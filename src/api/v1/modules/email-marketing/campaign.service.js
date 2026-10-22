// The send engine. Starting a campaign freezes its audience into one "queued" row per person,
// then a background loop mails them at a steady rate (SES limits sends per second), recording
// each result. Progress is just the counters on the campaign, so the UI polls it.

const Campaign = require('./campaign.model');
const CampaignRecipient = require('./campaign-recipient.model');
const Subscriber = require('./subscriber.model');
const audienceService = require('./audience.service');
const mailer = require('./mailer.service');
const render = require('./render.service');

const BATCH_SIZE = 50;
const running = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sendDelayMs() {
  const perSecond = Number(process.env.EMAIL_SEND_RATE) || 5;
  return Math.max(Math.floor(1000 / perSecond), 0);
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

exports.isRunning = (campaignId) => running.has(String(campaignId));

// The origin people's mail clients call back to (open pixel, links, unsubscribe).
exports.publicBaseUrl = (req) =>
  (process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

function assertReadyToSend(campaign) {
  if (!mailer.isConfigured()) {
    throw httpError(
      503,
      'Email sending is not configured on the server (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM_ADDRESS)'
    );
  }
  if (!campaign.fromEmail && !mailer.defaultSender().fromEmail) {
    throw httpError(400, 'Set a From email for this campaign');
  }
}

// Sends one rendered copy to `to` with no tracking, so you can check it in your own inbox first.
exports.sendTest = async (campaign, to, baseUrl) => {
  assertReadyToSend(campaign);
  const email = render.buildEmail({
    subject: campaign.subject,
    html: campaign.html,
    recipient: { token: 'test', name: 'Test User', email: to },
    baseUrl,
    tracking: false,
  });
  await mailer.sendMail({
    to,
    subject: `[Test] ${email.subject}`,
    html: email.html,
    text: email.text,
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
  });
};

// Freezes the audience and starts mailing in the background.
exports.startCampaign = async (campaign, baseUrl) => {
  if (campaign.status !== 'draft') {
    throw httpError(409, 'Only a draft campaign can be sent');
  }
  assertReadyToSend(campaign);

  const { recipients } = await audienceService.resolveAudience(campaign.audience);
  if (recipients.length === 0) {
    throw httpError(400, 'No one to send to: the chosen audience is empty (or everyone has unsubscribed)');
  }

  await CampaignRecipient.insertMany(
    recipients.map((r) => ({ ...r, campaign: campaign._id, token: render.newToken() })),
    { ordered: false }
  );

  campaign.status = 'sending';
  campaign.baseUrl = baseUrl;
  campaign.totalCount = recipients.length;
  campaign.startedAt = new Date();
  await campaign.save();

  exports.processCampaign(campaign._id).catch((err) =>
    console.error('[email campaign] processing crashed:', err)
  );
  return campaign;
};

// Mails everyone still queued. Safe to call again after a server restart: it only touches
// recipients that are still "queued", and never runs twice for the same campaign.
exports.processCampaign = async (campaignId) => {
  const key = String(campaignId);
  if (running.has(key)) return;
  running.add(key);

  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'sending') return;

    const delay = sendDelayMs();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await CampaignRecipient.find({ campaign: campaignId, status: 'queued' })
        .sort({ _id: 1 })
        .limit(BATCH_SIZE);
      if (batch.length === 0) break;

      const suppressed = await audienceService.suppressedEmails();

      for (const recipient of batch) {
        await deliverOne(campaign, recipient, suppressed);
        if (delay) await sleep(delay);
      }
    }

    const fresh = await Campaign.findById(campaignId);
    fresh.status = fresh.sentCount === 0 && fresh.failedCount > 0 ? 'failed' : 'completed';
    fresh.completedAt = new Date();
    await fresh.save();
  } finally {
    running.delete(key);
  }
};

async function deliverOne(campaign, recipient, suppressed) {
  // Someone may have unsubscribed after the campaign started.
  if (suppressed.has(recipient.email)) {
    recipient.status = 'skipped';
    recipient.error = 'Unsubscribed or suppressed';
    await recipient.save();
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { skippedCount: 1 } });
    return;
  }

  try {
    const email = render.buildEmail({
      subject: campaign.subject,
      html: campaign.html,
      recipient,
      baseUrl: campaign.baseUrl,
    });
    recipient.sesMessageId = await mailer.sendMail({
      to: recipient.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
    });
    recipient.status = 'sent';
    recipient.sentAt = new Date();
    await recipient.save();
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { sentCount: 1 } });
  } catch (err) {
    recipient.status = 'failed';
    recipient.error = String(err.message || err).slice(0, 300);
    await recipient.save();
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { failedCount: 1 } });
    console.error(`[email campaign] failed to send to ${recipient.email}:`, err.message);
  }
}

// ----- events that arrive later (clicks, unsubscribes, SNS notices) -----

exports.recordOpen = async (token) => {
  const recipient = await CampaignRecipient.findOneAndUpdate(
    { token },
    { $inc: { openCount: 1 } },
    { new: false }
  );
  if (!recipient) return null;
  if (!recipient.openedAt) {
    await CampaignRecipient.updateOne({ _id: recipient._id, openedAt: null }, { openedAt: new Date() });
    await Campaign.updateOne({ _id: recipient.campaign }, { $inc: { openCount: 1 } });
  }
  return recipient;
};

exports.recordClick = async (token) => {
  const recipient = await CampaignRecipient.findOneAndUpdate(
    { token },
    { $inc: { clickCount: 1 } },
    { new: false }
  );
  if (!recipient) return null;
  const now = new Date();
  if (!recipient.clickedAt) {
    await CampaignRecipient.updateOne({ _id: recipient._id, clickedAt: null }, { clickedAt: now });
    await Campaign.updateOne({ _id: recipient.campaign }, { $inc: { clickCount: 1 } });
  }
  // Clicking proves it was opened, even when images (the pixel) are blocked.
  if (!recipient.openedAt) {
    await CampaignRecipient.updateOne({ _id: recipient._id, openedAt: null }, { openedAt: now });
    await Campaign.updateOne({ _id: recipient.campaign }, { $inc: { openCount: 1 } });
  }
  return recipient;
};

// Marks the address as suppressed everywhere (not just for this campaign).
exports.suppress = async (email, status, source) => {
  await Subscriber.findOneAndUpdate(
    { email },
    {
      $set: { status, statusChangedAt: new Date() },
      $setOnInsert: { source, name: '' },
    },
    { upsert: true }
  );
};

exports.unsubscribeByToken = async (token) => {
  const recipient = await CampaignRecipient.findOne({ token });
  if (!recipient) return null;
  await exports.suppress(recipient.email, 'unsubscribed', 'unsubscribe');
  if (!recipient.unsubscribedAt) {
    recipient.unsubscribedAt = new Date();
    await recipient.save();
    await Campaign.updateOne({ _id: recipient.campaign }, { $inc: { unsubscribeCount: 1 } });
  }
  return recipient;
};

// kind: 'bounced' | 'complained'. Only permanent bounces and complaints suppress the address.
exports.recordDeliveryProblem = async (sesMessageId, kind, detail) => {
  const recipient = await CampaignRecipient.findOne({ sesMessageId });
  if (!recipient) return null;
  const alreadyProblem = ['bounced', 'complained'].includes(recipient.status);
  recipient.status = kind;
  recipient.error = detail ? String(detail).slice(0, 300) : recipient.error;
  await recipient.save();
  if (!alreadyProblem) {
    await Campaign.updateOne(
      { _id: recipient.campaign },
      { $inc: kind === 'bounced' ? { bounceCount: 1 } : { complaintCount: 1 } }
    );
  }
  await exports.suppress(recipient.email, kind, 'bounce');
  return recipient;
};
