const Payment = require('../models/payment.model');
const { createRazorpayOrder } = require('../config/razorpay');
const { kafkaClient, logger } = require('@ops/shared');
const { TOPICS, CONSUMER_GROUPS } = require('@ops/shared').topics;

// ─── Process an order.created event ─────────────────────────────────────────
const processOrderCreated = async (event) => {
  const { id: orderId, userId, totalAmount, items } = event;

  logger.info('Processing order.created event', { orderId, totalAmount });

  // ── Idempotency check — don't process the same order twice ───────────────
  const idempotencyKey = `payment:${orderId}`;
  const existing = await Payment.findOne({ idempotencyKey });
  if (existing) {
    logger.warn('Duplicate order.created event — skipping', { orderId });
    return;
  }

  // ── Create payment record in initiated state ──────────────────────────────
  const payment = await Payment.create({
    orderId,
    userId,
    amount:         totalAmount,
    currency:       'INR',
    status:         'processing',
    idempotencyKey,
  });

  try {
    // ── Create Razorpay order ─────────────────────────────────────────────
    const razorpayOrder = await createRazorpayOrder({
      amount:  totalAmount,
      receipt: orderId,
      notes:   { userId, itemCount: items.length },
    });

    // Update payment with Razorpay order ID
    payment.razorpayOrderId = razorpayOrder.id;
    payment.status          = 'success'; // In real flow, this is after webhook confirms payment
    await payment.save();

    // ── Publish payment.processed event ──────────────────────────────────
    await kafkaClient.publishEvent(TOPICS.PAYMENT_PROCESSED, {
      id:             payment._id.toString(),
      type:           'PAYMENT_PROCESSED',
      orderId,
      userId,
      paymentId:      payment._id.toString(),
      razorpayOrderId: razorpayOrder.id,
      amount:         totalAmount,
      currency:       'INR',
      processedAt:    new Date().toISOString(),
    });

    logger.info('Payment processed successfully', {
      orderId,
      paymentId: payment._id,
      razorpayOrderId: razorpayOrder.id,
    });

  } catch (err) {
    // ── Payment failed — update record and publish failure event ──────────
    payment.status        = 'failed';
    payment.failureReason = err.message;
    payment.retryCount   += 1;
    await payment.save();

    await kafkaClient.publishEvent(TOPICS.PAYMENT_FAILED, {
      id:           payment._id.toString(),
      type:         'PAYMENT_FAILED',
      orderId,
      userId,
      paymentId:    payment._id.toString(),
      reason:       err.message,
      failedAt:     new Date().toISOString(),
    });

    logger.error('Payment processing failed', {
      orderId,
      err: err.message,
    });
  }
};

// ─── Start consumer ───────────────────────────────────────────────────────────
const startOrderConsumer = async () => {
  await kafkaClient.consumeEvents(
    CONSUMER_GROUPS.PAYMENT_SERVICE,
    [TOPICS.ORDER_CREATED],
    async (topic, message) => {
      if (topic === TOPICS.ORDER_CREATED) {
        await processOrderCreated(message);
      }
    }
  );

  logger.info('Payment service Kafka consumer started');
};

module.exports = { startOrderConsumer };