// Endpoints that mail clients and Amazon call, so none of them can need a login.
// Everything is keyed by an unguessable per-recipient token.

const catchAsync = require('../../../../common/utils/catchAsync');
const campaignService = require('./campaign.service');
const render = require('./render.service');
const snsService = require('./sns.service');
const CampaignRecipient = require('./campaign-recipient.model');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f6f6f8;margin:0;padding:48px 16px;color:#1f2937;">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08);">
${body}</div></body></html>`;

// @route GET /api/v1/email/t/o/:token.gif
exports.openPixel = catchAsync(async (req, res) => {
  await campaignService.recordOpen(req.params.token).catch(() => {});
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' });
  res.send(PIXEL);
});

// @route GET /api/v1/email/t/c/:token?u=<base64url url>&s=<signature>
exports.clickRedirect = catchAsync(async (req, res) => {
  let target;
  try {
    target = render.decodeClickTarget(String(req.query.u || ''));
  } catch {
    return res.status(400).send('Bad link');
  }
  if (!/^https?:\/\//i.test(target) || !render.verifyUrl(target, req.query.s)) {
    return res.status(400).send('Bad link');
  }
  await campaignService.recordClick(req.params.token).catch(() => {});
  return res.redirect(302, target);
});

// GET only asks "are you sure?". Unsubscribing happens on POST, so mail scanners that
// pre-fetch every link in a message can't unsubscribe people by accident.
// @route GET /api/v1/email/unsubscribe/:token
exports.unsubscribePage = catchAsync(async (req, res) => {
  const recipient = await CampaignRecipient.findOne({ token: req.params.token }).select('email').lean();
  if (!recipient) {
    return res.status(404).send(page('Link expired', '<h2>This link is no longer valid</h2>'));
  }
  return res.send(
    page(
      'Unsubscribe',
      `<h2 style="margin:0 0 8px;">Unsubscribe</h2>
<p style="color:#6b7280;margin:0 0 20px;">Stop emails to <strong>${recipient.email.replace(/[<>&"]/g, '')}</strong>?</p>
<form method="post" action=""><button type="submit" style="background:#6d4aff;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer;">Yes, unsubscribe me</button></form>`
    )
  );
});

// Also the target of the one-click "List-Unsubscribe-Post" header (RFC 8058).
// @route POST /api/v1/email/unsubscribe/:token
exports.unsubscribe = catchAsync(async (req, res) => {
  const recipient = await campaignService.unsubscribeByToken(req.params.token);
  if (!recipient) {
    return res.status(404).send(page('Link expired', '<h2>This link is no longer valid</h2>'));
  }
  return res.send(
    page('Unsubscribed', '<h2 style="margin:0 0 8px;">You\'re unsubscribed</h2><p style="color:#6b7280;margin:0;">You won\'t get any more emails from us.</p>')
  );
});

// @route POST /api/v1/email/sns   (SNS sends text/plain JSON)
exports.snsWebhook = catchAsync(async (req, res) => {
  let message;
  try {
    message = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid SNS message' });
  }
  const outcome = await snsService.handle(message);
  return res.json({ success: true, outcome });
});
