const Enquiry = require('./enquiry.model');

const normalizeRefs = (data) => {
  if (data.product === '') data.product = null;
  if (data.assignedTo === '') data.assignedTo = null;
  return data;
};

const populateRefs = (query) =>
  query
    .populate('product', 'name slug')
    .populate('assignedTo', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName email');

// `page` is { skip, limit } from common/utils/pagination; omit it for the full list.
exports.findAll = async (filter = {}, page) => {
  const query = populateRefs(Enquiry.find({ isDeleted: false, ...filter })).sort({
    createdAt: -1,
    _id: -1,
  });
  return page ? query.skip(page.skip).limit(page.limit) : query;
};

exports.count = async (filter = {}) => {
  return Enquiry.countDocuments({ isDeleted: false, ...filter });
};

exports.findById = async (id) => {
  return populateRefs(Enquiry.findOne({ _id: id, isDeleted: false }));
};

exports.create = async (data) => {
  return Enquiry.create(normalizeRefs(data));
};

exports.updateById = async (id, data) => {
  const enquiry = await Enquiry.findOneAndUpdate({ _id: id, isDeleted: false }, normalizeRefs(data), {
    new: true,
    runValidators: true,
  });
  if (!enquiry) return null;
  return exports.findById(enquiry._id);
};

exports.addNote = async (id, note) => {
  const enquiry = await Enquiry.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $push: { notes: note } },
    { new: true, runValidators: true }
  );
  if (!enquiry) return null;
  return exports.findById(enquiry._id);
};

exports.softDeleteById = async (id) => {
  return Enquiry.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
};

// Counts for the listing page's stat cards — total plus a breakdown by
// status and by source, all scoped to the same filter as the list itself.
exports.getStats = async (filter = {}) => {
  const match = { isDeleted: false, ...filter };

  const [statusAgg, sourceAgg, total] = await Promise.all([
    Enquiry.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Enquiry.aggregate([{ $match: match }, { $group: { _id: '$source', count: { $sum: 1 } } }]),
    Enquiry.countDocuments(match),
  ]);

  const byStatus = Object.fromEntries(Enquiry.STATUSES.map((s) => [s, 0]));
  statusAgg.forEach((row) => {
    byStatus[row._id] = row.count;
  });

  const bySource = Object.fromEntries(Enquiry.SOURCES.map((s) => [s, 0]));
  sourceAgg.forEach((row) => {
    bySource[row._id] = row.count;
  });

  return { total, byStatus, bySource };
};

// Bulk-inserts leads from a parsed CSV. Runs row-by-row (not insertMany) so
// one bad row doesn't fail the whole import and we can report which rows
// failed and why.
exports.bulkCreate = async (rows) => {
  const result = { created: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i += 1) {
    try {
      await Enquiry.create(normalizeRefs(rows[i]));
      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({ row: i + 2, message: err.message }); // +2: 1-indexed + header row
    }
  }

  return result;
};
