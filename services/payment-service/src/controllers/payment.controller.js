const Payment = require('../models/payment.model');
const { verifyWebhookSignature } = require('../config/stripe');
const { kafkaClient, logger } = require('@ops/shared');
const { TOPICS } = require('@ops/shared').topics;
const { NotFoundError, ValidationError, ForbiddenError } = require('@ops/shared').errorHandler;

const getPaymentByOrder = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ orderId: req.params.orderId });

    if (!payment) {
      return next(new NotFoundError('Payment not found for this order'));
    }

    if (payment.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new ForbiddenError('You do not have access to this payment'));
    }

    res.status(200).json({ success: true, payment });
  } catch (err) {
    next(err);
  }
};

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


const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];

    let event;
    try {
      event = verifyWebhookSignature(req.body, signature);
    } catch (err) {
      logger.warn('Invalid Stripe webhook signature', { err: err.message });
      return res.status(400).json({ error: 'Invalid signature' });
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent  = event.data.object;
        const payment = await Payment.findOne({ stripePaymentIntentId: intent.id });

        if (payment) {
          payment.status            = 'success';
          payment.stripePaymentId   = intent.id;
          await payment.save();

          await kafkaClient.publishEvent(TOPICS.PAYMENT_PROCESSED, {
            id:                    payment._id.toString(),
            type:                  'PAYMENT_CONFIRMED',
            orderId:               payment.orderId,
            userId:                payment.userId,
            paymentId:             payment._id.toString(),
            stripePaymentIntentId: intent.id,
            amount:                payment.amount,
            processedAt:           new Date().toISOString(),
          });

          logger.info('Stripe webhook: payment confirmed', {
            paymentId: payment._id,
            orderId:   payment.orderId,
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent  = event.data.object;
        const payment = await Payment.findOne({ stripePaymentIntentId: intent.id });

        if (payment) {
          payment.status        = 'failed';
          payment.failureReason = intent.last_payment_error?.message || 'Payment failed';
          await payment.save();

          await kafkaClient.publishEvent(TOPICS.PAYMENT_FAILED, {
            id:        payment._id.toString(),
            type:      'PAYMENT_FAILED',
            orderId:   payment.orderId,
            userId:    payment.userId,
            paymentId: payment._id.toString(),
            reason:    payment.failureReason,
            failedAt:  new Date().toISOString(),
          });

          logger.warn('Stripe webhook: payment failed', {
            paymentId: payment._id,
            orderId:   payment.orderId,
          });
        }
        break;
      }

      default:
        logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPaymentByOrder, getAllPayments, handleWebhook };