const catchAsync = require('../../../../common/utils/catchAsync');
const { success } = require('../../../../common/utils/apiResponse');
const cloudApi = require('./cloud-api.service');

// @desc    List this WABA's message templates (for picking one to send
//          outside the 24h customer-service window)
// @route   GET /api/v1/whatsapp/templates
exports.getAllTemplates = catchAsync(async (req, res) => {
  const templates = await cloudApi.listTemplates();
  // Only APPROVED templates are actually usable for sending.
  const usable = templates.filter((t) => t.status === 'APPROVED');
  return success(res, { message: 'Templates fetched successfully', data: usable });
});
