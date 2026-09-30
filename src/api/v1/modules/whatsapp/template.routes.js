const express = require('express');
const router = express.Router();

const { getAllTemplates } = require('./template.controller');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');

router.get('/', isAuthenticated, getAllTemplates);

module.exports = router;
