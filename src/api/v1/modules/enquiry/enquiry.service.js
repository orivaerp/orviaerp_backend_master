const Enquiry = require('./enquiry.model');

const USER_FIELDS = 'firstName lastName email role';

const normalizeRefs = (data) => {
  if (data.product === '') data.product = null;
  if (data.assignedTo === '') data.assignedTo = null;
  return data;
};

const populateRefs = (query) =>
  query
    .populate('product', 'name slug')
    .populate('assignedTo', USER_FIELDS)
    .populate('createdBy', USER_FIELDS);

// Single-lead view also resolves who wrote each remark and who did what in the timeline.
const populateDetail = (query) =>
  populateRefs(query)
    .populate('notes.addedBy', USER_FIELDS)
    .populate('activities.actor', USER_FIELDS)
    .populate('activities.assignedFrom', USER_FIELDS)
    .populate('activities.assignedTo', USER_FIELDS);

const idOf = (value) => (value ? String(value._id || value) : null);

// `scope` is extra filter (e.g. { assignedTo }) that limits what the caller may see.

// `page` is { skip, limit } from common/utils/pagination; omit it for the full list.
exports.findAll = async (filter = {}, page) => {
  // The activity log is only needed on the detail page, so keep it out of list payloads.
  const query = populateRefs(Enquiry.find({ isDeleted: false, ...filter }))
    .select('-activities')
    .sort({ createdAt: -1, _id: -1 });
  return page ? query.skip(page.skip).limit(page.limit) : query;
};

exports.count = async (filter = {}) => {
  return Enquiry.countDocuments({ isDeleted: false, ...filter });
};

exports.findById = async (id, scope = {}) => {
  return populateDetail(Enquiry.findOne({ _id: id, isDeleted: false, ...scope }));
};

exports.create = async (data) => {
  const activities = [{ type: 'created', actor: data.createdBy }];
  if (data.assignedTo) {
    activities.push({ type: 'assigned', actor: data.createdBy, assignedTo: data.assignedTo });
  }
  return Enquiry.create({ ...normalizeRefs(data), activities });
};

// Loads, applies the change, and records what changed (status / assignment) so the
// timeline is always in step with the data. Returns null if not found / out of scope.
exports.updateById = async (id, data, { actor, scope = {} } = {}) => {
  const enquiry = await Enquiry.findOne({ _id: id, isDeleted: false, ...scope });
  if (!enquiry) return null;

  normalizeRefs(data);
  const statusBefore = enquiry.status;
  const assignedBefore = idOf(enquiry.assignedTo);

  enquiry.set(data);

  if (data.status && data.status !== statusBefore) {
    enquiry.activities.push({
      type: 'status_changed',
      actor,
      statusFrom: statusBefore,
      statusTo: data.status,
    });
  }

  if ('assignedTo' in data && idOf(enquiry.assignedTo) !== assignedBefore) {
    enquiry.activities.push({
      type: 'assigned',
      actor,
      assignedFrom: assignedBefore,
      assignedTo: idOf(enquiry.assignedTo),
    });
  }

  await enquiry.save();
  return exports.findById(enquiry._id);
};

// A remark; `followUpAt` (optional) also schedules the lead's next follow-up,
// replacing any earlier pending one.
exports.addNote = async (id, { text, addedBy, followUpAt }, scope = {}) => {
  const enquiry = await Enquiry.findOne({ _id: id, isDeleted: false, ...scope });
  if (!enquiry) return null;

  enquiry.notes.push({ text, addedBy, ...(followUpAt ? { followUpAt } : {}) });
  if (followUpAt) enquiry.nextFollowUpAt = followUpAt;

  await enquiry.save();
  return exports.findById(enquiry._id);
};

// Marks the pending follow-up as done. Returns null if the lead isn't found / out of
// scope, and false if there is no follow-up pending.
exports.completeFollowUp = async (id, { actor, text }, scope = {}) => {
  const enquiry = await Enquiry.findOne({ _id: id, isDeleted: false, ...scope });
  if (!enquiry) return null;
  if (!enquiry.nextFollowUpAt) return false;

  enquiry.activities.push({
    type: 'followup_done',
    actor,
    followUpAt: enquiry.nextFollowUpAt,
    ...(text ? { text } : {}),
  });
  enquiry.nextFollowUpAt = undefined;

  await enquiry.save();
  return exports.findById(enquiry._id);
};

exports.softDeleteById = async (id) => {
  return Enquiry.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
};

// Calendar-day buckets in the *caller's* timezone. `tzOffset` is minutes behind UTC
// (what JS's Date#getTimezoneOffset returns, e.g. -330 for IST).
exports.dayBounds = (tzOffset = 0, now = new Date()) => {
  const offsetMs = tzOffset * 60 * 1000;
  const local = new Date(now.getTime() - offsetMs);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocal + offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

// Mongo condition for the `followUp` list filter.
exports.followUpCondition = (kind, tzOffset) => {
  const { start, end } = exports.dayBounds(tzOffset);
  switch (kind) {
    case 'overdue':
      return { $lt: start };
    case 'today':
      return { $gte: start, $lte: end };
    case 'upcoming':
      return { $gt: end };
    case 'pending':
      return { $ne: null, $exists: true };
    default:
      return undefined;
  }
};

// Counts for the listing page's stat cards — total plus a breakdown by
// status and by source, plus how many follow-ups are overdue / due today / upcoming,
// all scoped to the same filter as the list itself.
exports.getStats = async (filter = {}, { tzOffset = 0 } = {}) => {
  const match = { isDeleted: false, ...filter };

  const followUpCount = (kind) =>
    Enquiry.countDocuments({ ...match, nextFollowUpAt: exports.followUpCondition(kind, tzOffset) });

  const [statusAgg, sourceAgg, total, overdue, today, upcoming] = await Promise.all([
    Enquiry.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Enquiry.aggregate([{ $match: match }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Enquiry.countDocuments(match),
    followUpCount('overdue'),
    followUpCount('today'),
    followUpCount('upcoming'),
  ]);

  const byStatus = Object.fromEntries(Enquiry.STATUSES.map((s) => [s, 0]));
  statusAgg.forEach((row) => {
    byStatus[row._id] = row.count;
  });

  const bySource = Object.fromEntries(Enquiry.SOURCES.map((s) => [s, 0]));
  sourceAgg.forEach((row) => {
    bySource[row._id] = row.count;
  });

  return { total, byStatus, bySource, followUps: { overdue, today, upcoming } };
};

// Bulk-inserts leads from a parsed CSV. Runs row-by-row (not insertMany) so
// one bad row doesn't fail the whole import and we can report which rows
// failed and why.
exports.bulkCreate = async (rows) => {
  const result = { created: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i += 1) {
    try {
      await Enquiry.create({
        ...normalizeRefs(rows[i]),
        activities: [{ type: 'created', actor: rows[i].createdBy }],
      });
      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({ row: i + 2, message: err.message }); // +2: 1-indexed + header row
    }
  }

  return result;
};
