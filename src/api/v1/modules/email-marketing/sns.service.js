// Receives Amazon SNS notices about mail we sent through SES (bounces, complaints).
// SNS posts to a public URL, so every message's signature is checked against Amazon's
// certificate before anything in it is believed.

const crypto = require('crypto');
const campaignService = require('./campaign.service');
const CampaignRecipient = require('./campaign-recipient.model');
const EmailEvent = require('./email-event.model');

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;
const certCache = new Map();

const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
const CONFIRMATION_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

function fail(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

exports.stringToSign = (message) => {
  const fields = message.Type === 'Notification' ? NOTIFICATION_FIELDS : CONFIRMATION_FIELDS;
  return fields
    .filter((name) => message[name] !== undefined)
    .map((name) => `${name}\n${message[name]}\n`)
    .join('');
};

async function fetchCertificate(urlText) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw fail('Invalid SigningCertURL');
  }
  if (url.protocol !== 'https:' || !CERT_HOST.test(url.hostname) || !url.pathname.endsWith('.pem')) {
    throw fail('SigningCertURL is not an Amazon SNS certificate');
  }
  if (!certCache.has(url.href)) {
    const res = await fetch(url.href);
    if (!res.ok) throw fail('Could not fetch the SNS signing certificate', 502);
    certCache.set(url.href, await res.text());
  }
  return certCache.get(url.href);
}

exports.verifyMessage = async (message) => {
  if (!message?.Signature || !message.SigningCertURL) throw fail('Unsigned SNS message');
  const algorithm = message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const cert = await fetchCertificate(message.SigningCertURL);
  const valid = crypto
    .createVerify(algorithm)
    .update(exports.stringToSign(message))
    .verify(cert, message.Signature, 'base64');
  if (!valid) throw fail('SNS signature does not match');

  const expectedTopic = process.env.SNS_TOPIC_ARN;
  if (expectedTopic && message.TopicArn !== expectedTopic) throw fail('Unexpected SNS topic');
};

// Records what SES said and applies it. SES sends the same payload two ways: the account-level
// notifications use "notificationType", configuration-set event publishing uses "eventType".
// Transient bounces (full mailbox, server busy) are only recorded: SES retries those itself.
// Permanent bounces and complaints also block the address from every future campaign.
exports.applyNotification = async (payload) => {
  const sesId = payload?.mail?.messageId;
  const kind = payload?.notificationType || payload?.eventType;
  if (!sesId || !kind) return;

  const recipientRow = await CampaignRecipient.findOne({ sesMessageId: sesId }).select('campaign email').lean();
  const campaign = recipientRow?.campaign;
  const fallbackEmail = recipientRow?.email;
  const at = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value) : new Date());

  const record = async (event) => {
    try {
      await EmailEvent.create({ sesMessageId: sesId, campaign, ...event });
      return true;
    } catch (err) {
      if (err.code === 11000) return false; // SNS delivered this notice twice
      throw err;
    }
  };

  if (kind === 'Delivery') {
    const when = at(payload.delivery?.timestamp);
    for (const email of payload.delivery?.recipients || [payload.mail?.destination?.[0]].filter(Boolean)) {
      await record({ type: 'delivered', email, occurredAt: when });
    }
    await campaignService.recordDelivered(sesId);
  } else if (kind === 'Bounce') {
    const bounce = payload.bounce || {};
    const when = at(bounce.timestamp);
    for (const row of bounce.bouncedRecipients || []) {
      const detail = row.diagnosticCode || row.status || bounce.bounceSubType || 'Bounce';
      await record({
        type: 'bounced',
        email: row.emailAddress || fallbackEmail,
        bounceType: bounce.bounceType,
        bounceSubType: bounce.bounceSubType,
        detail,
        occurredAt: when,
      });
    }
    if (bounce.bounceType === 'Permanent') {
      const detail = bounce.bouncedRecipients?.[0]?.diagnosticCode || 'Permanent bounce';
      await campaignService.recordDeliveryProblem(sesId, 'bounced', detail);
    }
  } else if (kind === 'Complaint') {
    const complaint = payload.complaint || {};
    const when = at(complaint.timestamp);
    for (const row of complaint.complainedRecipients || []) {
      await record({
        type: 'complained',
        email: row.emailAddress || fallbackEmail,
        detail: complaint.complaintFeedbackType,
        occurredAt: when,
      });
    }
    await campaignService.recordDeliveryProblem(sesId, 'complained', complaint.complaintFeedbackType);
  }
};

// @returns what happened, for the response body / logs
exports.handle = async (message) => {
  await exports.verifyMessage(message);

  if (message.Type === 'SubscriptionConfirmation') {
    const url = new URL(message.SubscribeURL);
    if (url.protocol !== 'https:' || !CERT_HOST.test(url.hostname)) throw fail('Unexpected SubscribeURL');
    await fetch(url.href);
    return 'subscribed';
  }

  if (message.Type === 'Notification') {
    let payload;
    try {
      payload = JSON.parse(message.Message);
    } catch {
      return 'ignored';
    }
    await exports.applyNotification(payload);
    return 'processed';
  }

  return 'ignored';
};
