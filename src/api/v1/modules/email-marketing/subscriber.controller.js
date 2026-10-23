const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');
const { parseCsv } = require('../enquiry/enquiry-csv');
const { isValidEmail } = require('./audience.service');
const Subscriber = require('./subscriber.model');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @route GET /api/v1/email/subscribers?status=&tag=&search=&page=&limit=
exports.getAllSubscribers = catchAsync(async (req, res) => {
  const filter = {};
  if (Subscriber.STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    filter.$or = [{ email: pattern }, { name: pattern }];
  }

  const paging = parsePagination(req.query);
  if (!paging) {
    const all = await Subscriber.find(filter).sort({ createdAt: -1 });
    return success(res, { message: 'Subscribers fetched successfully', data: all });
  }

  const [items, total] = await Promise.all([
    Subscriber.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    Subscriber.countDocuments(filter),
  ]);
  return success(res, {
    message: 'Subscribers fetched successfully',
    data: items,
    meta: buildMeta(paging, total),
  });
});

// @route GET /api/v1/email/subscribers/stats
exports.getSubscriberStats = catchAsync(async (req, res) => {
  const rows = await Subscriber.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const stats = { total: 0, subscribed: 0, unsubscribed: 0, bounced: 0, complained: 0, blocked: 0 };
  rows.forEach((r) => {
    stats[r._id] = r.count;
    stats.total += r.count;
  });
  const tags = await Subscriber.distinct('tags');
  return success(res, { message: 'Subscriber stats fetched', data: { ...stats, tags: tags.sort() } });
});

// @route POST /api/v1/email/subscribers
exports.createSubscriber = catchAsync(async (req, res) => {
  const existing = await Subscriber.findOne({ email: req.body.email });
  if (existing) {
    const why =
      existing.status === 'subscribed'
        ? 'is already subscribed'
        : `is on the list as ${existing.status} and will not be mailed (change its status to re-enable it)`;
    return error(res, { statusCode: 409, message: `${req.body.email} ${why}` });
  }
  const subscriber = await Subscriber.create({ ...req.body, source: 'manual', createdBy: req.user.id });
  return success(res, { statusCode: 201, message: 'Subscriber added', data: subscriber });
});

// @desc  Bulk add from CSV text. Columns: email (required), name, tags (separate several with ; or |).
//        Addresses that already exist are left alone - in particular an unsubscribed person is
//        never quietly re-subscribed by a re-import.
// @route POST /api/v1/email/subscribers/import
exports.importSubscribers = catchAsync(async (req, res) => {
  const rows = parseCsv(req.body.csv);
  if (rows.length === 0) {
    return error(res, { statusCode: 400, message: 'The CSV has no rows. It needs a header row with an "email" column.' });
  }
  if (!('email' in rows[0])) {
    return error(res, { statusCode: 400, message: 'The CSV needs an "email" column in its header row.' });
  }

  const seen = new Set();
  const invalid = [];
  const fresh = [];
  rows.forEach((row, i) => {
    const address = (row.email || '').toLowerCase();
    if (!isValidEmail(address)) {
      invalid.push({ row: i + 2, email: row.email || '' });
      return;
    }
    if (seen.has(address)) return;
    seen.add(address);
    fresh.push({
      email: address,
      name: row.name || '',
      tags: (row.tags || '')
        .split(/[;|]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      source: 'csv',
      createdBy: req.user.id,
    });
  });

  const known = new Set(
    (await Subscriber.find({ email: { $in: fresh.map((f) => f.email) } }).select('email').lean()).map((s) => s.email)
  );
  const toInsert = fresh.filter((f) => !known.has(f.email));
  if (toInsert.length) await Subscriber.insertMany(toInsert, { ordered: false });

  return success(res, {
    message: `Imported ${toInsert.length} subscriber(s)`,
    data: {
      imported: toInsert.length,
      alreadyExisted: fresh.length - toInsert.length,
      invalid,
    },
  });
});

// @route PATCH /api/v1/email/subscribers/:id
exports.updateSubscriber = catchAsync(async (req, res) => {
  const update = { ...req.body };
  if (update.status) update.statusChangedAt = new Date();
  const subscriber = await Subscriber.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!subscriber) return error(res, { statusCode: 404, message: 'Subscriber not found' });
  return success(res, { message: 'Subscriber updated', data: subscriber });
});

// @route DELETE /api/v1/email/subscribers/:id
exports.deleteSubscriber = catchAsync(async (req, res) => {
  const subscriber = await Subscriber.findById(req.params.id);
  if (!subscriber) return error(res, { statusCode: 404, message: 'Subscriber not found' });
  // The row is what keeps an unsubscribed / bounced address from being mailed again.
  if (subscriber.status !== 'subscribed') {
    return error(res, {
      statusCode: 409,
      message: `This address is ${subscriber.status}. Keep it on the list so it is never mailed again.`,
    });
  }
  await subscriber.deleteOne();
  return success(res, { message: 'Subscriber removed' });
});
