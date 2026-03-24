const Payment = require('../models/payment.model');
const { createPaymentIntent } = require('../config/stripe');
const { kafkaClient, logger } = require('@ops/shared');
const { TOPICS, CONSUMER_GROUPS } = require('@ops/shared').topics;

const processOrderCreated = async (event) => {
  const { id: orderId, userId, totalAmount, items } = event;

  logger.info('Processing order.created event', { orderId, totalAmount });

  const idempotencyKey = `payment:${orderId}`;
  const existing = await Payment.findOne({ idempotencyKey });
  if (existing) {
    logger.warn('Duplicate order.created event — skipping', { orderId });
    return;
  }

  const payment = await Payment.create({
    orderId,
    userId,
    amount:         totalAmount,
    currency:       'inr',
    status:         'processing',
    idempotencyKey,
  });

  try {
    const paymentIntent = await createPaymentIntent({
      amount:   totalAmount,
      currency: 'inr',
      orderId,
      userId,
    });

    payment.stripePaymentIntentId = paymentIntent.id;
    payment.stripeClientSecret    = paymentIntent.client_secret;
    payment.status                = paymentIntent.status === 'succeeded' ? 'success' : 'processing';
    await payment.save();

    await kafkaClient.publishEvent(TOPICS.PAYMENT_PROCESSED, {
      id:                    payment._id.toString(),
      type:                  'PAYMENT_PROCESSED',
      orderId,
      userId,
      paymentId:             payment._id.toString(),
      stripePaymentIntentId: paymentIntent.id,
      amount:                totalAmount,
      currency:              'inr',
      processedAt:           new Date().toISOString(),
    });

    logger.info('Payment processed successfully', {
      orderId,
      paymentId:             payment._id,
      stripePaymentIntentId: paymentIntent.id,
    });

  } catch (err) {
    payment.status        = 'failed';
    payment.failureReason = err.message;
    payment.retryCount   += 1;
    await payment.save();

    await kafkaClient.publishEvent(TOPICS.PAYMENT_FAILED, {
      id:        payment._id.toString(),
      type:      'PAYMENT_FAILED',
      orderId,
      userId,
      paymentId: payment._id.toString(),
      reason:    err.message,
      failedAt:  new Date().toISOString(),
    });

    logger.error('Payment processing failed', { orderId, err: err.message });
  }
};

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