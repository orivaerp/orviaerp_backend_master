// Works out who a campaign goes to: the chosen sources, de-duplicated by address, minus
// anybody who has unsubscribed / bounced / complained (from any source).

const Subscriber = require('./subscriber.model');
const Enquiry = require('../enquiry/enquiry.model');
const Contact = require('../contact/contact.model');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

exports.isValidEmail = (value) => typeof value === 'string' && EMAIL_PATTERN.test(value.trim());

exports.suppressedEmails = async () => {
  const rows = await Subscriber.find({ status: { $ne: 'subscribed' } }).select('email').lean();
  return new Set(rows.map((r) => r.email));
};

// @returns {{ recipients: {email, name, source}[], counts }}
exports.resolveAudience = async (audience = {}) => {
  const counts = { subscribers: 0, enquiries: 0, contacts: 0, suppressed: 0, duplicates: 0, invalid: 0 };
  const suppressed = await exports.suppressedEmails();
  const seen = new Set();
  const recipients = [];

  const add = (source, rawEmail, name) => {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!exports.isValidEmail(email)) {
      counts.invalid += 1;
      return;
    }
    if (suppressed.has(email)) {
      counts.suppressed += 1;
      return;
    }
    if (seen.has(email)) {
      counts.duplicates += 1;
      return;
    }
    seen.add(email);
    counts[source] += 1;
    recipients.push({ email, name: name || '', source });
  };

  if (audience.subscribers?.enabled) {
    const filter = { status: 'subscribed' };
    if (audience.subscribers.tags?.length) filter.tags = { $in: audience.subscribers.tags };
    const rows = await Subscriber.find(filter).select('email name').lean();
    rows.forEach((r) => add('subscribers', r.email, r.name));
  }

  if (audience.enquiries?.enabled) {
    const filter = { email: { $exists: true, $nin: ['', null] } };
    if (audience.enquiries.statuses?.length) filter.status = { $in: audience.enquiries.statuses };
    const rows = await Enquiry.find(filter).select('email name').lean();
    rows.forEach((r) => add('enquiries', r.email, r.name));
  }

  if (audience.contacts?.enabled) {
    const filter = {};
    if (audience.contacts.statuses?.length) filter.status = { $in: audience.contacts.statuses };
    const rows = await Contact.find(filter).select('email name').lean();
    rows.forEach((r) => add('contacts', r.email, r.name));
  }

  return { recipients, counts };
};
