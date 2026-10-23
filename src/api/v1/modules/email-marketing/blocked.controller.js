const mongoose = require('mongoose');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');
const Subscriber = require('./subscriber.model');
const campaignService = require('./campaign.service');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bounces and spam complaints can never be lifted by hand: mailing those addresses again is
// exactly what ruins a sender's reputation with Gmail/Hotmail and gets an SES account paused.
const LOCKED = ['bounced', 'complained'];

const toRow = (s) => ({
  _id: s._id,
  email: s.email,
  reason: s.status,
  source: s.blockSource || (s.status === 'bounced' || s.status === 'complained' ? 'ses' : 'manual'),
  note: s.note || '',
  locked: LOCKED.includes(s.status),
  addedAt: s.statusChangedAt || s.updatedAt,
});

// @desc  Everyone who will never be emailed, whatever the campaign
// @route GET /api/v1/email/blocked?reason=&search=&page=&limit=
exports.getBlocked = catchAsync(async (req, res) => {
  const reasons = Subscriber.STATUSES.filter((s) => s !== 'subscribed');
  const filter = { status: { $in: reasons } };
  if (reasons.includes(req.query.reason)) filter.status = req.query.reason;
  if (req.query.search) filter.email = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');

  const paging = parsePagination({ page: 1, ...req.query });
  const sort = { statusChangedAt: -1, updatedAt: -1 };
  const [items, total] = await Promise.all([
    Subscriber.find(filter).sort(sort).skip(paging.skip).limit(paging.limit).lean(),
    Subscriber.countDocuments(filter),
  ]);
  return success(res, {
    message: 'Blocked addresses fetched',
    data: items.map(toRow),
    meta: buildMeta(paging, total),
  });
});

// @route POST /api/v1/email/blocked   { email, note? }
exports.blockAddress = catchAsync(async (req, res) => {
  const { email, note } = req.body;
  const existing = await Subscriber.findOne({ email });
  if (existing && existing.status !== 'subscribed') {
    return error(res, { statusCode: 409, message: `${email} is already blocked (${existing.status})` });
  }
  await campaignService.suppress(email, 'blocked', 'manual', { blockSource: 'manual', note: note || '' });
  const row = await Subscriber.findOne({ email }).lean();
  return success(res, { statusCode: 201, message: `${email} will not be emailed again`, data: toRow(row) });
});

// @desc  Lets an unsubscribed / manually blocked address be mailed again. Not for bounces or complaints.
// @route DELETE /api/v1/email/blocked/:id
exports.unblockAddress = catchAsync(async (req, res) => {
  const row = mongoose.isValidObjectId(req.params.id) ? await Subscriber.findById(req.params.id) : null;
  if (!row || row.status === 'subscribed') {
    return error(res, { statusCode: 404, message: 'Blocked address not found' });
  }
  if (LOCKED.includes(row.status)) {
    return error(res, {
      statusCode: 409,
      message: `This address ${row.status === 'bounced' ? 'bounced' : 'reported a message as spam'}, so it stays blocked to protect your sender reputation.`,
    });
  }
  await row.deleteOne();
  return success(res, { message: `${row.email} can be emailed again` });
});
