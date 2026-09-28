const contactService = require('./contact.service');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');

// Shared by list/stats/export so all three respect the same filters.
function buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.service) filter.service = query.service;
  if (query.budget) filter.budget = query.budget;

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const end = new Date(query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (query.search) {
    const regex = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }];
  }

  return filter;
}

// @desc    Submit the public "Project brief" contact form
// @route   POST /api/v1/contacts
exports.createContact = catchAsync(async (req, res) => {
  const submission = await contactService.create({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  return success(res, {
    statusCode: 201,
    message: 'Thanks — your brief has been received. We will follow up within 24 hours.',
    data: submission,
  });
});

// @desc    Get all contact submissions (filterable)
// @route   GET /api/v1/contacts
exports.getAllContacts = catchAsync(async (req, res) => {
  const submissions = await contactService.findAll(buildFilter(req.query));
  return success(res, { message: 'Contact submissions fetched successfully', data: submissions });
});

// @desc    Get submission counts by status/service for the listing page's stat cards
// @route   GET /api/v1/contacts/stats
exports.getContactStats = catchAsync(async (req, res) => {
  const stats = await contactService.getStats(buildFilter(req.query));
  return success(res, { message: 'Contact stats fetched successfully', data: stats });
});

// @desc    Get single submission by ID
// @route   GET /api/v1/contacts/:id
exports.getContactById = catchAsync(async (req, res) => {
  const submission = await contactService.findById(req.params.id);
  if (!submission) {
    return error(res, { statusCode: 404, message: 'Contact submission not found' });
  }
  return success(res, { message: 'Contact submission fetched successfully', data: submission });
});

// @desc    Update a submission's status/assignment/details
// @route   PUT /api/v1/contacts/:id
exports.updateContact = catchAsync(async (req, res) => {
  const submission = await contactService.updateById(req.params.id, req.body);
  if (!submission) {
    return error(res, { statusCode: 404, message: 'Contact submission not found' });
  }
  return success(res, { message: 'Contact submission updated successfully', data: submission });
});

// @desc    Add an internal note to a submission
// @route   POST /api/v1/contacts/:id/notes
exports.addContactNote = catchAsync(async (req, res) => {
  const submission = await contactService.addNote(req.params.id, {
    text: req.body.text,
    addedBy: req.user.id,
  });
  if (!submission) {
    return error(res, { statusCode: 404, message: 'Contact submission not found' });
  }
  return success(res, { message: 'Note added successfully', data: submission });
});

// @desc    Soft-delete a submission
// @route   DELETE /api/v1/contacts/:id
exports.deleteContact = catchAsync(async (req, res) => {
  const submission = await contactService.softDeleteById(req.params.id);
  if (!submission) {
    return error(res, { statusCode: 404, message: 'Contact submission not found' });
  }
  return success(res, { message: 'Contact submission deleted successfully' });
});

const CSV_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Company',
  'Company Website',
  'Service',
  'Budget',
  'Timeline',
  'Message',
  'Status',
  'Received',
];

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// @desc    Export the (optionally filtered) submissions list as CSV
// @route   GET /api/v1/contacts/export
exports.exportContacts = catchAsync(async (req, res) => {
  const submissions = await contactService.findAll(buildFilter(req.query));

  const rows = submissions.map((s) =>
    [
      s.name,
      s.email,
      s.phone,
      s.company || '',
      s.companyWebsite || '',
      s.service,
      s.budget || '',
      s.timeline || '',
      s.message,
      s.status,
      s.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(',')
  );
  const csv = [CSV_HEADERS.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contact-submissions-${Date.now()}.csv"`);
  return res.status(200).send(csv);
});
