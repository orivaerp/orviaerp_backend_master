const catchAsync = require('../../../../common/utils/catchAsync');
const { success } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');
const CampaignRecipient = require('./campaign-recipient.model');
const EmailEvent = require('./email-event.model');

const WINDOW_DAYS = 7;
// Below this many sends a single bounce swings the percentage wildly, so we don't grade yet.
const MIN_SENDS = 100;
// Amazon pauses accounts that stay above roughly 5% bounces / 0.1% complaints; these are the
// safer targets it recommends staying under.
const BOUNCE_WARN = 2;
const BOUNCE_BAD = 5;
const COMPLAINT_WARN = 0.05;
const COMPLAINT_BAD = 0.1;

const round2 = (n) => Math.round(n * 100) / 100;

exports.grade = ({ sent, bounceRate, complaintRate }) => {
  if (sent < MIN_SENDS) return 'unknown';
  if (bounceRate >= BOUNCE_BAD || complaintRate >= COMPLAINT_BAD) return 'bad';
  if (bounceRate >= BOUNCE_WARN || complaintRate >= COMPLAINT_WARN) return 'warning';
  return 'good';
};

// @route GET /api/v1/email/deliverability
exports.getSummary = catchAsync(async (req, res) => {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

  const [sent, delivered, hardBounces, softBounces, complaints, anyEvent] = await Promise.all([
    CampaignRecipient.countDocuments({ sentAt: { $gte: since } }),
    EmailEvent.countDocuments({ type: 'delivered', occurredAt: { $gte: since } }),
    EmailEvent.countDocuments({ type: 'bounced', bounceType: 'Permanent', occurredAt: { $gte: since } }),
    EmailEvent.countDocuments({ type: 'bounced', bounceType: { $ne: 'Permanent' }, occurredAt: { $gte: since } }),
    EmailEvent.countDocuments({ type: 'complained', occurredAt: { $gte: since } }),
    EmailEvent.exists({}),
  ]);

  const bounceRate = sent ? round2((hardBounces / sent) * 100) : 0;
  const complaintRate = sent ? round2((complaints / sent) * 100) : 0;

  return success(res, {
    message: 'Deliverability summary',
    data: {
      windowDays: WINDOW_DAYS,
      sent,
      delivered,
      hardBounces,
      softBounces,
      complaints,
      bounceRate,
      complaintRate,
      health: exports.grade({ sent, bounceRate, complaintRate }),
      minSends: MIN_SENDS,
      // false until the first SES notice arrives, so the page can say "connect SNS" instead of showing zeros
      eventsConnected: Boolean(anyEvent),
      targets: { bounceRate: BOUNCE_WARN, complaintRate: COMPLAINT_WARN },
    },
  });
});

// @route GET /api/v1/email/deliverability/events?type=&page=&limit=
exports.getEvents = catchAsync(async (req, res) => {
  const filter = {};
  if (EmailEvent.schema.path('type').enumValues.includes(req.query.type)) filter.type = req.query.type;

  const paging = parsePagination({ page: 1, ...req.query });
  const [items, total] = await Promise.all([
    EmailEvent.find(filter).sort({ occurredAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    EmailEvent.countDocuments(filter),
  ]);
  return success(res, { message: 'Delivery events fetched', data: items, meta: buildMeta(paging, total) });
});
