// Sends mail through Amazon SES's SMTP interface (nodemailer). Nothing here touches the DB.
//
// Env: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME,
//      SES_CONFIGURATION_SET (optional; lets SES publish bounce/complaint events to SNS).

const nodemailer = require('nodemailer');

let transport;

exports.isConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM_ADDRESS
  );

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 3,
    });
  }
  return transport;
}

exports.defaultSender = () => ({
  fromName: process.env.EMAIL_FROM_NAME || '',
  fromEmail: process.env.EMAIL_FROM_ADDRESS || '',
});

// Tests (and anyone wanting a different provider) can swap the transport.
exports.setTransport = (replacement) => {
  transport = replacement;
};

// SES answers "250 Ok <message id>"; that id is what its bounce/complaint notices carry,
// whereas nodemailer's own `messageId` is just a header SES overwrites.
function sesMessageIdFrom(info) {
  const match = /Ok\s+([A-Za-z0-9-]+)/.exec(info?.response || '');
  return match ? match[1] : String(info?.messageId || '').replace(/^<|@.*$|>$/g, '');
}

// @returns the provider's message id
exports.sendMail = async ({ to, subject, html, text, headers = {}, fromName, fromEmail }) => {
  const sender = exports.defaultSender();
  const address = fromEmail || sender.fromEmail;
  const name = fromName ?? sender.fromName;

  const info = await getTransport().sendMail({
    from: name ? { name, address } : address,
    to,
    subject,
    html,
    text,
    headers: {
      ...(process.env.SES_CONFIGURATION_SET
        ? { 'X-SES-CONFIGURATION-SET': process.env.SES_CONFIGURATION_SET }
        : {}),
      ...headers,
    },
  });

  return sesMessageIdFrom(info);
};
