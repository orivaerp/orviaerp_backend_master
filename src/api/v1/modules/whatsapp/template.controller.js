const catchAsync = require('../../../../common/utils/catchAsync');
const { success } = require('../../../../common/utils/apiResponse');
const cloudApi = require('./cloud-api.service');

// @desc    List this WABA's message templates, every status included
//          (APPROVED/REJECTED/PENDING/...) - the Templates screen shows all
//          of them; send pickers (Inbox, Broadcast) filter to APPROVED
//          client-side since only those are actually usable for sending.
// @route   GET /api/v1/whatsapp/templates
exports.getAllTemplates = catchAsync(async (req, res) => {
  const templates = await cloudApi.listTemplates();
  return success(res, { message: 'Templates fetched successfully', data: templates });
});
