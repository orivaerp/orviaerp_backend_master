const express = require('express');
const router = express.Router();

const { verifyWebhook, receiveWebhook } = require('./webhook.controller');

// Called directly by Meta, not by our own frontend - no session auth here.
router.get('/', verifyWebhook);
router.post('/', receiveWebhook);

module.exports = router;
