const express = require('express');
const router = express.Router();

const { createBroadcast, getAllBroadcasts, getBroadcastById } = require('./broadcast.controller');
const { createBroadcastSchema } = require('./broadcast.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');

router.use(isAuthenticated);

router.get('/', getAllBroadcasts);
router.get('/:id', getBroadcastById);
router.post('/', validate(createBroadcastSchema), createBroadcast);

module.exports = router;
