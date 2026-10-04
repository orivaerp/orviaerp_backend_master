const express = require('express');
const router = express.Router();

const {
  getAllEnquiries,
  getEnquiryStats,
  getEnquiryById,
  createEnquiry,
  updateEnquiry,
  addEnquiryNote,
  deleteEnquiry,
  exportEnquiries,
  importEnquiries,
} = require('./enquiry.controller');

const { createEnquirySchema, updateEnquirySchema, addNoteSchema } = require('./enquiry.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

// Anyone can submit an enquiry; only staff can view/manage the inbox.
router
  .route('/')
  .get(isAuthenticated, restrictTo('admin', 'vendor', 'sales'), getAllEnquiries)
  .post(validate(createEnquirySchema), createEnquiry);

router.get('/stats', isAuthenticated, restrictTo('admin', 'vendor', 'sales'), getEnquiryStats);
router.get('/export', isAuthenticated, restrictTo('admin', 'vendor', 'sales'), exportEnquiries);
router.post('/import', isAuthenticated, restrictTo('admin'), importEnquiries);

router
  .route('/:id')
  .get(isAuthenticated, restrictTo('admin', 'vendor', 'sales'), getEnquiryById)
  .put(isAuthenticated, restrictTo('admin', 'vendor', 'sales'), validate(updateEnquirySchema), updateEnquiry)
  .delete(isAuthenticated, restrictTo('admin'), deleteEnquiry);

router.post(
  '/:id/notes',
  isAuthenticated,
  restrictTo('admin', 'vendor', 'sales'),
  validate(addNoteSchema),
  addEnquiryNote
);

module.exports = router;
