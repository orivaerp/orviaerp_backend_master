const express = require('express');
const router = express.Router();

const {
  createContact,
  getAllContacts,
  getContactStats,
  getContactById,
  updateContact,
  addContactNote,
  deleteContact,
  exportContacts,
} = require('./contact.controller');

const { createContactSchema, updateContactSchema, addNoteSchema } = require('./contact.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

// Anyone can submit the public contact form; only staff can view/manage submissions.
router
  .route('/')
  .get(isAuthenticated, restrictTo('admin', 'vendor'), getAllContacts)
  .post(validate(createContactSchema), createContact);

router.get('/stats', isAuthenticated, restrictTo('admin', 'vendor'), getContactStats);
router.get('/export', isAuthenticated, restrictTo('admin', 'vendor'), exportContacts);

router
  .route('/:id')
  .get(isAuthenticated, restrictTo('admin', 'vendor'), getContactById)
  .put(isAuthenticated, restrictTo('admin', 'vendor'), validate(updateContactSchema), updateContact)
  .delete(isAuthenticated, restrictTo('admin'), deleteContact);

router.post('/:id/notes', isAuthenticated, restrictTo('admin', 'vendor'), validate(addNoteSchema), addContactNote);

module.exports = router;
