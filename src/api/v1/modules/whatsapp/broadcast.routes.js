const express = require('express');
const router = express.Router();

const { createBroadcast, getAllBroadcasts, getBroadcastById } = require('./broadcast.controller');
const { createBroadcastSchema } = require('./broadcast.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

router.use(isAuthenticated, restrictTo('admin'));

router.get('/', getAllBroadcasts);
router.get('/:id', getBroadcastById);
router.post('/', validate(createBroadcastSchema), createBroadcast);

module.exports = router;
