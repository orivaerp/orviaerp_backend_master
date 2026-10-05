const mongoose = require('mongoose');
const enquiryService = require('./enquiry.service');
const Enquiry = require('./enquiry.model');
const User = require('../user/user.model');
const { parseCsv, matchEnum } = require('./enquiry-csv');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');

// Admins see every lead; everyone else only the leads assigned to them.
const isAdmin = (user) => user?.role === 'admin';
const scopeFor = (user) => (isAdmin(user) ? {} : { assignedTo: new mongoose.Types.ObjectId(user.id) });

const tzOffsetOf = (query) => {
  const n = parseInt(query.tzOffset, 10);
  return Number.isFinite(n) ? n : 0;
};

// Shared by list/stats/export so all three respect the same filters — and the same
// visibility rules (the scope is applied last so a query param can never widen it).
function buildFilter(query, user) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  if (query.category) filter.category = query.category;

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
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const followUp = enquiryService.followUpCondition(query.followUp, tzOffsetOf(query));
  if (followUp) filter.nextFollowUpAt = followUp;

  // Admin-only filter: one assignee, or the unassigned pool.
  if (isAdmin(user) && query.assignedTo) {
    if (query.assignedTo === 'unassigned') filter.assignedTo = null;
    else if (mongoose.isValidObjectId(query.assignedTo)) {
      filter.assignedTo = new mongoose.Types.ObjectId(query.assignedTo);
    }
  }

  return { ...filter, ...scopeFor(user) };
}

// Only an active user can be given a lead.
async function assigneeProblem(userId) {
  if (!userId) return null;
  const assignee = await User.findById(userId);
  if (!assignee) return 'The selected user does not exist';
  if (assignee.status !== 'active') return 'Leads can only be assigned to an active user';
  return null;
}

// @desc    Get all enquiries (filterable by status/source/date range/search)
// @route   GET /api/v1/enquiries
exports.getAllEnquiries = catchAsync(async (req, res) => {
  const filter = buildFilter(req.query, req.user);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    const enquiries = await enquiryService.findAll(filter);
    return success(res, { message: 'Enquiries fetched successfully', data: enquiries });
  }

  const [enquiries, total] = await Promise.all([
    enquiryService.findAll(filter, pagination),
    enquiryService.count(filter),
  ]);
  return success(res, {
    message: 'Enquiries fetched successfully',
    data: enquiries,
    meta: buildMeta(pagination, total),
  });
});

// @desc    Get lead counts by status/source for the listing page's stat cards
// @route   GET /api/v1/enquiries/stats
exports.getEnquiryStats = catchAsync(async (req, res) => {
  const stats = await enquiryService.getStats(buildFilter(req.query, req.user), {
    tzOffset: tzOffsetOf(req.query),
  });
  return success(res, { message: 'Enquiry stats fetched successfully', data: stats });
});

// @desc    Get single enquiry by ID
// @route   GET /api/v1/enquiries/:id
exports.getEnquiryById = catchAsync(async (req, res) => {
  // Out-of-scope leads look exactly like missing ones, so ids can't be probed.
  const enquiry = await enquiryService.findById(req.params.id, scopeFor(req.user));
  if (!enquiry) {
    return error(res, { statusCode: 404, message: 'Enquiry not found' });
  }
  return success(res, { message: 'Enquiry fetched successfully', data: enquiry });
});

// @desc    Create a new enquiry (public — e.g. contact / product enquiry form,
//          also used by the dashboard's "Add lead" form)
// @route   POST /api/v1/enquiries
exports.createEnquiry = catchAsync(async (req, res) => {
  // Taken from the session, never the request body (the route is public), so
  // it can't be spoofed. Anonymous website submissions get no createdBy.
  const data = { ...req.body, createdBy: req.user?.id };

  // Assignment: an admin may pick anyone; a non-admin staff member's own lead is
  // assigned to them (otherwise they could not see what they just added); public
  // form submissions start unassigned.
  if (isAdmin(req.user)) {
    const problem = await assigneeProblem(data.assignedTo);
    if (problem) return error(res, { statusCode: 400, message: problem });
  } else if (req.user) {
    data.assignedTo = req.user.id;
  } else {
    delete data.assignedTo;
  }

  const enquiry = await enquiryService.create(data);
  return success(res, { statusCode: 201, message: 'Enquiry submitted successfully', data: enquiry });
});

// @desc    Update enquiry status/assignment by ID
// @route   PUT /api/v1/enquiries/:id
exports.updateEnquiry = catchAsync(async (req, res) => {
  if ('assignedTo' in req.body) {
    if (!isAdmin(req.user)) {
      return error(res, { statusCode: 403, message: 'Only an admin can assign leads' });
    }
    const problem = await assigneeProblem(req.body.assignedTo);
    if (problem) return error(res, { statusCode: 400, message: problem });
  }

  const enquiry = await enquiryService.updateById(req.params.id, req.body, {
    actor: req.user.id,
    scope: scopeFor(req.user),
  });
  if (!enquiry) {
    return error(res, { statusCode: 404, message: 'Enquiry not found' });
  }
  return success(res, { message: 'Enquiry updated successfully', data: enquiry });
});

// @desc    Add an internal note to an enquiry
// @route   POST /api/v1/enquiries/:id/notes
exports.addEnquiryNote = catchAsync(async (req, res) => {
  const enquiry = await enquiryService.addNote(
    req.params.id,
    { text: req.body.text, addedBy: req.user.id, followUpAt: req.body.followUpAt || undefined },
    scopeFor(req.user)
  );
  if (!enquiry) {
    return error(res, { statusCode: 404, message: 'Enquiry not found' });
  }
  return success(res, { message: 'Note added successfully', data: enquiry });
});

// @desc    Assign many leads to one user (or unassign them) in one go — admin only
// @route   POST /api/v1/enquiries/bulk-assign
exports.bulkAssignEnquiries = catchAsync(async (req, res) => {
  const { ids, assignedTo } = req.body;

  const problem = await assigneeProblem(assignedTo || null);
  if (problem) return error(res, { statusCode: 400, message: problem });

  const result = await enquiryService.bulkAssign(ids, assignedTo || null, req.user.id);
  return success(res, { message: 'Leads assigned', data: result });
});

// @desc    Mark the lead's pending follow-up as done (optionally with a closing remark)
// @route   POST /api/v1/enquiries/:id/followup/complete
exports.completeEnquiryFollowUp = catchAsync(async (req, res) => {
  const enquiry = await enquiryService.completeFollowUp(
    req.params.id,
    { actor: req.user.id, text: req.body.text },
    scopeFor(req.user)
  );
  if (enquiry === null) {
    return error(res, { statusCode: 404, message: 'Enquiry not found' });
  }
  if (enquiry === false) {
    return error(res, { statusCode: 400, message: 'This lead has no pending follow-up' });
  }
  return success(res, { message: 'Follow-up marked done', data: enquiry });
});

// @desc    Soft-delete enquiry by ID
// @route   DELETE /api/v1/enquiries/:id
exports.deleteEnquiry = catchAsync(async (req, res) => {
  const enquiry = await enquiryService.softDeleteById(req.params.id);
  if (!enquiry) {
    return error(res, { statusCode: 404, message: 'Enquiry not found' });
  }
  return success(res, { message: 'Enquiry deleted successfully' });
});

const CSV_HEADERS = [
  'Name',
  'Email',
  'Phone',
  'Subject',
  'Message',
  'Source',
  'Status',
  'Category',
  'Sub Category',
  'Firm Name',
  'Website',
  'City',
  'Address',
  'State',
  'Product',
  'Created At',
];

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// @desc    Export the (optionally filtered) enquiry list as CSV
// @route   GET /api/v1/enquiries/export
exports.exportEnquiries = catchAsync(async (req, res) => {
  const enquiries = await enquiryService.findAll(buildFilter(req.query, req.user));

  const rows = enquiries.map((e) =>
    [
      e.name,
      e.email,
      e.phone || '',
      e.subject || '',
      e.message,
      e.source,
      e.status,
      e.category || '',
      e.subCategory || '',
      e.firmName || '',
      e.website || '',
      e.city || '',
      e.address || '',
      e.state || '',
      e.product && typeof e.product === 'object' ? e.product.name : '',
      e.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(',')
  );
  const csv = [CSV_HEADERS.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="enquiries-${Date.now()}.csv"`);
  return res.status(200).send(csv);
});


// @desc    Bulk-import leads from CSV text (same columns as /export produces)
// @route   POST /api/v1/enquiries/import
exports.importEnquiries = catchAsync(async (req, res) => {
  const csvText = req.body.csv;
  if (!csvText || typeof csvText !== 'string') {
    return error(res, { statusCode: 400, message: 'CSV content is required' });
  }

  const rows = parseCsv(csvText);
  const payloads = rows
    .filter((row) => row.name && row.phone)
    .map((row) => ({
      name: row.name,
      email: row.email || undefined,
      phone: row.phone,
      subject: row.subject || undefined,
      message: row.message || row.subject || undefined,
      source: matchEnum(row.source, Enquiry.SOURCES) || 'other',
      status: matchEnum(row.status, Enquiry.STATUSES),
      category: matchEnum(row.category, Enquiry.CATEGORIES),
      subCategory: row['sub category'] || row.subcategory || undefined,
      firmName: row['firm name'] || row.firmname || undefined,
      website: row.website || undefined,
      city: row.city || undefined,
      address: row.address || undefined,
      state: row.state || undefined,
      createdBy: req.user.id,
    }));

  if (payloads.length === 0) {
    return error(res, { statusCode: 400, message: 'No valid rows found — each row needs at least a name and phone' });
  }

  const result = await enquiryService.bulkCreate(payloads);
  return success(res, { message: 'Import completed', data: result });
});
