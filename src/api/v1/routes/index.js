const express = require('express');
const router = express.Router();

const userRoutes = require('../modules/user/user.routes');
const authRoutes = require('../modules/auth/auth.routes');
const blogRoutes = require('../modules/blog/blog.routes');
const categoryRoutes = require('../modules/category/category.routes');
const productRoutes = require('../modules/product/product.routes');
const enquiryRoutes = require('../modules/enquiry/enquiry.routes');
const contactRoutes = require('../modules/contact/contact.routes');
const whatsappWebhookRoutes = require('../modules/whatsapp/webhook.routes');
const whatsappConversationRoutes = require('../modules/whatsapp/conversation.routes');
const whatsappTemplateRoutes = require('../modules/whatsapp/template.routes');

router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/blogs', blogRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/contacts', contactRoutes);
router.use('/whatsup', whatsappWebhookRoutes);
router.use('/whatsapp/conversations', whatsappConversationRoutes);
router.use('/whatsapp/templates', whatsappTemplateRoutes);

module.exports = router;