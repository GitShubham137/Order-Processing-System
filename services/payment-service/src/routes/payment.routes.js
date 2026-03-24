const express = require('express');
const { getPaymentByOrder, getAllPayments, handleWebhook } = require('../controllers/payment.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/webhook', handleWebhook);

router.use(protect);

router.get('/order/:orderId', getPaymentByOrder);
router.get('/',               restrictTo('admin'), getAllPayments);

module.exports = router;