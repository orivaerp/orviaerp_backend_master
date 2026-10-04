const express = require('express');
const router = express.Router();

const { getAllTemplates } = require('./template.controller');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

router.get('/', isAuthenticated, restrictTo('admin'), getAllTemplates);

module.exports = router;
