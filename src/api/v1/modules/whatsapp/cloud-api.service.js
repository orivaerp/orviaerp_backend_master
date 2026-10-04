// Thin wrapper around Meta's WhatsApp Cloud API (Graph API). Nothing here
// touches the DB - callers persist whatever they need themselves.

const GRAPH_BASE = 'https://graph.facebook.com';

function apiVersion() {
  return process.env.WHATSAPP_API_VERSION || 'v22.0';
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
}

async function graphFetch(path, options = {}) {
  const res = await fetch(`${GRAPH_BASE}/${apiVersion()}/${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.error?.message || `WhatsApp Graph API request failed (${res.status})`;
    const error = new Error(message);
    error.statusCode = 502;
    error.graphError = body?.error;
    throw error;
  }

  return body;
}

// @param to - customer's WhatsApp number (E.164-ish, no leading "+")
exports.sendTextMessage = async (to, body) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const result = await graphFetch(`${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  return result.messages?.[0]?.id;
};

// @param to - customer's WhatsApp number (E.164-ish, no leading "+")
// @param bodyParams - ordered list of strings to fill the template's {{1}}, {{2}}, ...
//                      placeholders. Omit/empty if the template has none.
// @param headerMedia - { type: 'image'|'video'|'document', id?, link? }. Required when the
//                      template's HEADER is a media format; Meta rejects the send otherwise.
exports.sendTemplateMessage = async (to, { name, language, bodyParams = [], headerMedia }) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const template = {
    name,
    language: { code: language },
  };

  const components = [];

  if (headerMedia && (headerMedia.id || headerMedia.link)) {
    const mediaRef = headerMedia.id ? { id: headerMedia.id } : { link: headerMedia.link };
    components.push({
      type: 'header',
      parameters: [{ type: headerMedia.type, [headerMedia.type]: mediaRef }],
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text })),
    });
  }

  if (components.length > 0) {
    template.components = components;
  }

  const result = await graphFetch(`${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template,
    }),
  });

  return result.messages?.[0]?.id;
};

// Lists the WABA's message templates (name/status/category/language/components -
// including each one's placeholder body text, so the UI can render a preview
// and figure out how many {{n}} parameters it needs to collect).
exports.listTemplates = async () => {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

  const result = await graphFetch(
    `${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
    { method: 'GET' }
  );

  return result.data || [];
};

// Meta's media URLs are short-lived and require the same bearer token to
// fetch, so this returns the raw bytes rather than a URL callers could store.
exports.downloadMedia = async (mediaId) => {
  const meta = await graphFetch(mediaId, { method: 'GET' });

  const fileRes = await fetch(meta.url, { headers: authHeaders() });
  if (!fileRes.ok) {
    const error = new Error(`Failed to download WhatsApp media (${fileRes.status})`);
    error.statusCode = 502;
    throw error;
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type };
};
