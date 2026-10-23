const express = require('express');
const router = express.Router();

const subscribers = require('./subscriber.controller');
const campaigns = require('./campaign.controller');
const publicEndpoints = require('./public.controller');
const blocked = require('./blocked.controller');
const deliverability = require('./deliverability.controller');
const v = require('./email-marketing.validator');
const validate = require('../../../../common/middlewares/validate.middleware');
const isAuthenticated = require('../../../../common/middlewares/auth.middleware');
const restrictTo = require('../../../../common/middlewares/restrictTo.middleware');

/* ---- Public: opened by mail clients and Amazon SNS, so no login (see public.controller.js) ---- */
router.get('/t/o/:token.gif', publicEndpoints.openPixel);
router.get('/t/c/:token', publicEndpoints.clickRedirect);
router.get('/unsubscribe/:token', publicEndpoints.unsubscribePage);
router.post('/unsubscribe/:token', express.urlencoded({ extended: false }), publicEndpoints.unsubscribe);
router.post('/sns', express.text({ type: '*/*', limit: '256kb' }), publicEndpoints.snsWebhook);

/* ---- Admin only ---- */
router.use(isAuthenticated, restrictTo('admin'));

router.get('/status', campaigns.getStatus);

router.get('/subscribers', subscribers.getAllSubscribers);
router.get('/subscribers/stats', subscribers.getSubscriberStats);
router.post('/subscribers', validate(v.createSubscriberSchema), subscribers.createSubscriber);
router.post('/subscribers/import', validate(v.importSubscribersSchema), subscribers.importSubscribers);
router.patch('/subscribers/:id', validate(v.updateSubscriberSchema), subscribers.updateSubscriber);
router.delete('/subscribers/:id', subscribers.deleteSubscriber);

router.get('/blocked', blocked.getBlocked);
router.post('/blocked', validate(v.blockAddressSchema), blocked.blockAddress);
router.delete('/blocked/:id', blocked.unblockAddress);

router.get('/deliverability', deliverability.getSummary);
router.get('/deliverability/events', deliverability.getEvents);

router.get('/templates', campaigns.getAllTemplates);
router.post('/templates', validate(v.templateSchema), campaigns.createTemplate);
router.get('/templates/:id', campaigns.getTemplate);
router.put('/templates/:id', validate(v.templateSchema), campaigns.updateTemplate);
router.delete('/templates/:id', campaigns.deleteTemplate);

router.get('/campaigns', campaigns.getAllCampaigns);
router.post('/campaigns', validate(v.createCampaignSchema), campaigns.createCampaign);
router.post('/campaigns/audience-preview', validate(v.audiencePreviewSchema), campaigns.previewAudience);
router.get('/campaigns/:id', campaigns.getCampaign);
router.put('/campaigns/:id', validate(v.updateCampaignSchema), campaigns.updateCampaign);
router.delete('/campaigns/:id', campaigns.deleteCampaign);
router.get('/campaigns/:id/recipients', campaigns.getCampaignRecipients);
router.post('/campaigns/:id/test', validate(v.testSendSchema), campaigns.sendTest);
router.post('/campaigns/:id/send', campaigns.sendCampaign);
router.post('/campaigns/:id/resume', campaigns.resumeCampaign);

module.exports = router;
