const Payment = require('../models/payment.model');
const { verifyPaymentSignature } = require('../config/razorpay');
const { kafkaClient, logger } = require('@ops/shared');
const { TOPICS } = require('@ops/shared').topics;
const { NotFoundError, ValidationError, ForbiddenError } = require('@ops/shared').errorHandler;

// ─── Get payment by order ID ─────────────────────────────────────────────────
const getPaymentByOrder = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId });

    if (!payment) {
      return next(new NotFoundError('Payment not found for this order'));
    }

    // Users can only view their own payments
    if (payment.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new ForbiddenError('You do not have access to this payment'));
    }

    res.status(200).json({ success: true, payment });
  } catch (err) {
    next(err);
  }
};

// ─── Get all payments (admin) ────────────────────────────────────────────────
const getAllPayments = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId) filter.userId = req.query.userId;

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      payments,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Razorpay webhook — verify and confirm payment ───────────────────────────
// In production this endpoint is called by Razorpay after payment completes
const handleWebhook = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(new ValidationError('Missing Razorpay webhook fields'));
    }

    // Verify the signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    if (!isValid) {
      logger.warn('Invalid Razorpay signature', { razorpay_order_id });
      return next(new ValidationError('Invalid payment signature'));
    }

    // Find and update payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return next(new NotFoundError('Payment record not found'));
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status            = 'success';
    await payment.save();

    // Publish confirmed payment event
    await kafkaClient.publishEvent(TOPICS.PAYMENT_PROCESSED, {
      id:               payment._id.toString(),
      type:             'PAYMENT_CONFIRMED',
      orderId:          payment.orderId,
      userId:           payment.userId,
      paymentId:        payment._id.toString(),
      razorpayPaymentId: razorpay_payment_id,
      amount:           payment.amount,
      processedAt:      new Date().toISOString(),
    });

    logger.info('Razorpay webhook verified and payment confirmed', {
      paymentId: payment._id,
      orderId:   payment.orderId,
    });

    res.status(200).json({ success: true, message: 'Payment confirmed' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPaymentByOrder, getAllPayments, handleWebhook };