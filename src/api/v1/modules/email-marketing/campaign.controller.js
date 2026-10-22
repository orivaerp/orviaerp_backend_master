const mongoose = require('mongoose');
const catchAsync = require('../../../../common/utils/catchAsync');
const { success, error } = require('../../../../common/utils/apiResponse');
const { parsePagination, buildMeta } = require('../../../../common/utils/pagination');
const Campaign = require('./campaign.model');
const CampaignRecipient = require('./campaign-recipient.model');
const EmailTemplate = require('./email-template.model');
const audienceService = require('./audience.service');
const campaignService = require('./campaign.service');
const mailer = require('./mailer.service');

const notFound = (res, what = 'Campaign') => error(res, { statusCode: 404, message: `${what} not found` });
const loadCampaign = (id) => (mongoose.isValidObjectId(id) ? Campaign.findById(id) : null);

const withRunning = (campaign) => ({
  ...campaign.toObject(),
  // "sending" but nothing is working on it: the server restarted mid-send. Resume continues it.
  stalled: campaign.status === 'sending' && !campaignService.isRunning(campaign._id),
});

// @route GET /api/v1/email/status
exports.getStatus = catchAsync(async (req, res) => {
  const { fromEmail, fromName } = mailer.defaultSender();
  return success(res, {
    message: 'Email settings',
    data: {
      configured: mailer.isConfigured(),
      fromEmail,
      fromName,
      sendRatePerSecond: Number(process.env.EMAIL_SEND_RATE) || 5,
    },
  });
});

// ---------------------------------------------------------------- templates

exports.getAllTemplates = catchAsync(async (req, res) =>
  success(res, {
    message: 'Templates fetched successfully',
    data: await EmailTemplate.find().sort({ updatedAt: -1 }),
  })
);

exports.getTemplate = catchAsync(async (req, res) => {
  const template = mongoose.isValidObjectId(req.params.id) ? await EmailTemplate.findById(req.params.id) : null;
  if (!template) return notFound(res, 'Template');
  return success(res, { message: 'Template fetched successfully', data: template });
});

exports.createTemplate = catchAsync(async (req, res) => {
  const template = await EmailTemplate.create({ ...req.body, createdBy: req.user.id });
  return success(res, { statusCode: 201, message: 'Template created', data: template });
});

exports.updateTemplate = catchAsync(async (req, res) => {
  const template = mongoose.isValidObjectId(req.params.id)
    ? await EmailTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    : null;
  if (!template) return notFound(res, 'Template');
  return success(res, { message: 'Template updated', data: template });
});

exports.deleteTemplate = catchAsync(async (req, res) => {
  const template = mongoose.isValidObjectId(req.params.id) ? await EmailTemplate.findByIdAndDelete(req.params.id) : null;
  if (!template) return notFound(res, 'Template');
  return success(res, { message: 'Template deleted' });
});

// ---------------------------------------------------------------- campaigns

// @route GET /api/v1/email/campaigns?status=&page=&limit=
exports.getAllCampaigns = catchAsync(async (req, res) => {
  const filter = Campaign.STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
  const paging = parsePagination(req.query);
  const query = Campaign.find(filter).select('-html').sort({ createdAt: -1 });

  if (!paging) return success(res, { message: 'Campaigns fetched successfully', data: await query });

  const [items, total] = await Promise.all([query.skip(paging.skip).limit(paging.limit), Campaign.countDocuments(filter)]);
  return success(res, { message: 'Campaigns fetched successfully', data: items, meta: buildMeta(paging, total) });
});

exports.getCampaign = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  return success(res, { message: 'Campaign fetched successfully', data: withRunning(campaign) });
});

exports.createCampaign = catchAsync(async (req, res) => {
  const campaign = await Campaign.create({ ...req.body, createdBy: req.user.id });
  return success(res, { statusCode: 201, message: 'Campaign saved as draft', data: campaign });
});

exports.updateCampaign = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  if (campaign.status !== 'draft') {
    return error(res, { statusCode: 409, message: 'Only a draft can be edited; this campaign has already been sent' });
  }
  campaign.set(req.body);
  await campaign.save();
  return success(res, { message: 'Campaign updated', data: campaign });
});

exports.deleteCampaign = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  if (campaign.status === 'sending') {
    return error(res, { statusCode: 409, message: 'This campaign is sending right now' });
  }
  await CampaignRecipient.deleteMany({ campaign: campaign._id });
  await campaign.deleteOne();
  return success(res, { message: 'Campaign deleted' });
});

// @route POST /api/v1/email/campaigns/audience-preview
exports.previewAudience = catchAsync(async (req, res) => {
  const { counts, recipients } = await audienceService.resolveAudience(req.body.audience);
  return success(res, { message: 'Audience size', data: { total: recipients.length, ...counts } });
});

// @route POST /api/v1/email/campaigns/:id/test   { to }
exports.sendTest = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  await campaignService.sendTest(campaign, req.body.to, campaignService.publicBaseUrl(req));
  return success(res, { message: `Test email sent to ${req.body.to}` });
});

// @route POST /api/v1/email/campaigns/:id/send
exports.sendCampaign = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  await campaignService.startCampaign(campaign, campaignService.publicBaseUrl(req));
  return success(res, {
    statusCode: 202,
    message: `Sending to ${campaign.totalCount} recipient(s)`,
    data: withRunning(campaign),
  });
});

// @route POST /api/v1/email/campaigns/:id/resume
exports.resumeCampaign = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);
  if (campaign.status !== 'sending') {
    return error(res, { statusCode: 409, message: 'Only a campaign that is still sending can be resumed' });
  }
  campaignService.processCampaign(campaign._id).catch((err) => console.error('[email campaign] resume crashed:', err));
  return success(res, { statusCode: 202, message: 'Resumed', data: withRunning(campaign) });
});

// @route GET /api/v1/email/campaigns/:id/recipients?status=&search=&page=&limit=
exports.getCampaignRecipients = catchAsync(async (req, res) => {
  const campaign = await loadCampaign(req.params.id);
  if (!campaign) return notFound(res);

  const filter = { campaign: campaign._id };
  if (CampaignRecipient.STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.engaged === 'opened') filter.openedAt = { $ne: null };
  if (req.query.engaged === 'clicked') filter.clickedAt = { $ne: null };
  if (req.query.search) {
    filter.email = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const paging = parsePagination({ page: 1, ...req.query });
  const [items, total] = await Promise.all([
    CampaignRecipient.find(filter).select('-token').sort({ _id: 1 }).skip(paging.skip).limit(paging.limit),
    CampaignRecipient.countDocuments(filter),
  ]);
  return success(res, { message: 'Recipients fetched successfully', data: items, meta: buildMeta(paging, total) });
});
