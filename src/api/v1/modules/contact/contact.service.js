const ContactSubmission = require('./contact.model');

const normalizeRefs = (data) => {
  if (data.assignedTo === '') data.assignedTo = null;
  return data;
};

const populateRefs = (query) => query.populate('assignedTo', 'firstName lastName email');

exports.findAll = async (filter = {}) => {
  return populateRefs(ContactSubmission.find({ isDeleted: false, ...filter })).sort('-createdAt');
};

exports.findById = async (id) => {
  return populateRefs(ContactSubmission.findOne({ _id: id, isDeleted: false }));
};

exports.create = async (data) => {
  return ContactSubmission.create(normalizeRefs(data));
};

exports.updateById = async (id, data) => {
  const submission = await ContactSubmission.findOneAndUpdate(
    { _id: id, isDeleted: false },
    normalizeRefs(data),
    { new: true, runValidators: true }
  );
  if (!submission) return null;
  return exports.findById(submission._id);
};

exports.addNote = async (id, note) => {
  const submission = await ContactSubmission.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $push: { notes: note } },
    { new: true, runValidators: true }
  );
  if (!submission) return null;
  return exports.findById(submission._id);
};

exports.softDeleteById = async (id) => {
  return ContactSubmission.findOneAndUpdate({ _id: id, isDeleted: false }, { isDeleted: true }, { new: true });
};

// Counts for the listing page's stat cards.
exports.getStats = async (filter = {}) => {
  const match = { isDeleted: false, ...filter };

  const [statusAgg, serviceAgg, total] = await Promise.all([
    ContactSubmission.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ContactSubmission.aggregate([{ $match: match }, { $group: { _id: '$service', count: { $sum: 1 } } }]),
    ContactSubmission.countDocuments(match),
  ]);

  const byStatus = Object.fromEntries(ContactSubmission.STATUSES.map((s) => [s, 0]));
  statusAgg.forEach((row) => {
    byStatus[row._id] = row.count;
  });

  const byService = Object.fromEntries(ContactSubmission.SERVICES.map((s) => [s, 0]));
  serviceAgg.forEach((row) => {
    byService[row._id] = row.count;
  });

  return { total, byStatus, byService };
};
