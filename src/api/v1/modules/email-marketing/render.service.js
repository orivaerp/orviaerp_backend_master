// Turns a campaign's html into the email one person receives: merge tags filled in, links
// wrapped for click tracking, an open pixel, and an unsubscribe link (added if the author
// didn't include one - sending bulk mail without it gets you marked as spam).

const crypto = require('crypto');

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const toBase64Url = (value) => Buffer.from(value, 'utf8').toString('base64url');
const fromBase64Url = (value) => Buffer.from(value, 'base64url').toString('utf8');

function secret() {
  return process.env.EMAIL_LINK_SECRET || process.env.SESSION_SECRET || 'dev-email-link-secret';
}

// Click links carry the destination, so they're signed: otherwise /t/c/... would be an open redirect.
exports.signUrl = (url) =>
  crypto.createHmac('sha256', secret()).update(url).digest('base64url').slice(0, 32);

exports.verifyUrl = (url, signature) => {
  const expected = Buffer.from(exports.signUrl(url));
  const given = Buffer.from(String(signature || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

exports.newToken = () => crypto.randomBytes(18).toString('base64url');

const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// {{name}}, {{first_name}}, {{email}}, {{unsubscribe_url}}. Missing names read as "there".
exports.mergeTags = (template, { name, email, unsubscribeUrl }, { escape = true } = {}) => {
  const safe = escape ? escapeHtml : (value) => String(value ?? '');
  return String(template).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key) => {
    switch (key.toLowerCase()) {
      case 'name':
        return safe(name || 'there');
      case 'first_name':
        return safe(firstNameOf(name) || 'there');
      case 'email':
        return safe(email);
      case 'unsubscribe_url':
        return unsubscribeUrl;
      default:
        return whole;
    }
  });
};

exports.stripTags = (html) =>
  String(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const links = (baseUrl, token) => ({
  open: `${baseUrl}/api/v1/email/t/o/${token}.gif`,
  click: (url) => `${baseUrl}/api/v1/email/t/c/${token}?u=${toBase64Url(url)}&s=${exports.signUrl(url)}`,
  unsubscribe: `${baseUrl}/api/v1/email/unsubscribe/${token}`,
});

exports.decodeClickTarget = (encoded) => fromBase64Url(encoded);

// @param tracking - false for test sends: no pixel, no wrapped links, a dead unsubscribe link
exports.buildEmail = ({ subject, html, recipient, baseUrl, tracking = true }) => {
  const url = tracking ? links(baseUrl, recipient.token) : null;
  const unsubscribeUrl = url ? url.unsubscribe : '#';
  const vars = { name: recipient.name, email: recipient.email, unsubscribeUrl };

  let body = exports.mergeTags(html, vars);

  if (!/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) {
    const footer =
      `<p style="margin:24px 0 0;font-size:12px;color:#6b7280;text-align:center;">` +
      `You received this because you are on our mailing list. ` +
      `<a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a></p>`;
    body = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${footer}</body>`) : body + footer;
  }

  if (url) {
    body = body.replace(/(<a\s[^>]*?href=)(["'])(https?:\/\/[^"']+)\2/gi, (whole, start, quote, target) => {
      if (target.startsWith(`${baseUrl}/api/v1/email/`)) return whole; // our own unsubscribe link
      return `${start}${quote}${url.click(target.replace(/&amp;/g, '&'))}${quote}`;
    });
    const pixel = `<img src="${url.open}" width="1" height="1" alt="" style="display:none;border:0;" />`;
    body = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${pixel}</body>`) : body + pixel;
  }

  return {
    subject: exports.mergeTags(subject, vars, { escape: false }),
    html: body,
    text: exports.stripTags(body),
    headers: url
      ? {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : {},
  };
};
