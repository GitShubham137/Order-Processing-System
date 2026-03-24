const { logger } = require('@ops/shared');

// ─── Stripe client (lazy init) ───────────────────────────────────────────────
let stripeClient = null;

const getStripeClient = () => {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || secretKey === 'sk_test_your_stripe_secret_key_here') {
    logger.warn('Stripe key not set — running in STUB mode');
    return null;
  }

  const Stripe  = require('stripe');
  stripeClient  = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  return stripeClient;
};

// ─── Create Stripe PaymentIntent ─────────────────────────────────────────────
const createPaymentIntent = async ({ amount, currency = 'inr', orderId, userId }) => {
  const client = getStripeClient();

  // STUB MODE — simulate success for development
  if (!client) {
    logger.info('[STUB] Simulating Stripe PaymentIntent creation', { orderId });
    return {
      id:             `stub_pi_${Date.now()}`,
      client_secret:  `stub_secret_${Date.now()}`,
      amount:         amount * 100, // Stripe uses smallest currency unit (paise for INR)
      currency,
      status:         'succeeded',
      isStub:         true,
    };
  }

  const paymentIntent = await client.paymentIntents.create({
    amount:   Math.round(amount * 100), // convert to paise
    currency,
    metadata: { orderId, userId },
    automatic_payment_methods: { enabled: true },
  });

  return paymentIntent;
};

const verifyWebhookSignature = (rawBody, signature) => {
  const client        = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!client || !webhookSecret || webhookSecret.startsWith('whsec_your')) {
    logger.info('[STUB] Skipping Stripe webhook verification');
    return JSON.parse(rawBody);
  }

  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
};

module.exports = { createPaymentIntent, verifyWebhookSignature };