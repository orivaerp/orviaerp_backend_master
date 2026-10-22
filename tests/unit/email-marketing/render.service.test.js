const render = require('../../../src/api/v1/modules/email-marketing/render.service');

const BASE = 'https://api.example.com';
const recipient = { token: 'tok123', name: 'Priya Sharma', email: 'priya@example.com' };

describe('email render service (unit)', () => {
  it('fills merge tags and escapes values', () => {
    const out = render.mergeTags('Hi {{first_name}} / {{ name }} / {{email}}', {
      name: 'Priya <b>Sharma</b>',
      email: 'p@example.com',
    });
    expect(out).toBe('Hi Priya / Priya &lt;b&gt;Sharma&lt;/b&gt; / p@example.com');
  });

  it('reads a missing name as "there" and leaves unknown tags alone', () => {
    expect(render.mergeTags('Hi {{name}} {{other}}', { email: 'a@b.co' })).toBe('Hi there {{other}}');
  });

  it('does not escape when merging a subject line', () => {
    expect(render.mergeTags("{{name}}'s offer", { name: "O'Neil" }, { escape: false })).toBe("O'Neil's offer");
  });

  it('wraps links for click tracking with a signed, decodable destination', () => {
    const { html } = render.buildEmail({
      subject: 'Hi',
      html: '<p><a href="https://orviaerp.com/pricing?a=1&amp;b=2">Pricing</a></p>',
      recipient,
      baseUrl: BASE,
    });
    const match = /href="(https:\/\/api\.example\.com\/api\/v1\/email\/t\/c\/tok123\?u=([^&"]+)&s=([^"]+))"/.exec(html);
    expect(match).not.toBeNull();
    const target = render.decodeClickTarget(match[2]);
    expect(target).toBe('https://orviaerp.com/pricing?a=1&b=2');
    expect(render.verifyUrl(target, match[3])).toBe(true);
    expect(render.verifyUrl('https://evil.example/', match[3])).toBe(false);
  });

  it('adds an open pixel and an unsubscribe footer when the author did not', () => {
    const { html, headers } = render.buildEmail({
      subject: 'Hi',
      html: '<html><body><p>Hello</p></body></html>',
      recipient,
      baseUrl: BASE,
    });
    expect(html).toContain(`${BASE}/api/v1/email/t/o/tok123.gif`);
    expect(html).toContain(`${BASE}/api/v1/email/unsubscribe/tok123`);
    expect(html.indexOf('Unsubscribe')).toBeLessThan(html.indexOf('</body>'));
    expect(headers['List-Unsubscribe']).toBe(`<${BASE}/api/v1/email/unsubscribe/tok123>`);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('uses the author\'s {{unsubscribe_url}} and does not add a second footer or wrap it', () => {
    const { html } = render.buildEmail({
      subject: 'Hi',
      html: '<p><a href="{{unsubscribe_url}}">Opt out</a></p>',
      recipient,
      baseUrl: BASE,
    });
    expect(html.match(/email\/unsubscribe\/tok123/g)).toHaveLength(1);
    expect(html).not.toContain('/t/c/');
    expect(html).not.toContain('You received this because');
  });

  it('leaves mailto: links untouched', () => {
    const { html } = render.buildEmail({
      subject: 'Hi',
      html: '<a href="mailto:hello@orviaerp.com">Mail us</a>',
      recipient,
      baseUrl: BASE,
    });
    expect(html).toContain('href="mailto:hello@orviaerp.com"');
  });

  it('a test send has no tracking: no pixel, no wrapped links, no one-click headers', () => {
    const { html, headers } = render.buildEmail({
      subject: 'Hi',
      html: '<a href="https://orviaerp.com">Site</a>',
      recipient,
      baseUrl: BASE,
      tracking: false,
    });
    expect(html).toContain('href="https://orviaerp.com"');
    expect(html).not.toContain('/t/o/');
    expect(headers).toEqual({});
  });

  it('makes a plain-text alternative', () => {
    const { text } = render.buildEmail({
      subject: 'Hi',
      html: '<h1>Big news</h1><p>Read <a href="https://orviaerp.com">here</a></p>',
      recipient,
      baseUrl: BASE,
      tracking: false,
    });
    expect(text).toContain('Big news');
    expect(text).toContain('here (https://orviaerp.com)');
  });
});
