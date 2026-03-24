const { logger } = require('@ops/shared');

// ─── Razorpay client (lazy init) ─────────────────────────────────────────────
let razorpayClient = null;

const getRazorpayClient = () => {
  if (razorpayClient) return razorpayClient;

  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || keyId === 'your_razorpay_key_id') {
    logger.warn('Razorpay credentials not set — running in STUB mode');
    return null;
  }

  const Razorpay = require('razorpay');
  razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayClient;
};

// ─── Create Razorpay order ────────────────────────────────────────────────────
const createRazorpayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  const client = getRazorpayClient();

  // STUB MODE — simulate success for development
  if (!client) {
    logger.info('[STUB] Simulating Razorpay order creation', { receipt });
    return {
      id:       `stub_order_${Date.now()}`,
      amount:   amount * 100, // Razorpay uses paise
      currency,
      receipt,
      status:   'created',
      isStub:   true,
    };
  }

  const order = await client.orders.create({
    amount:   Math.round(amount * 100), // convert to paise
    currency,
    receipt,
    notes,
  });

  return order;
};

// ─── Verify Razorpay signature ────────────────────────────────────────────────
const verifyPaymentSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  const client = getRazorpayClient();

  // STUB MODE — always returns true
  if (!client) {
    logger.info('[STUB] Skipping signature verification');
    return true;
  }

  const crypto = require('crypto');
  const body   = razorpayOrderId + '|' + razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expectedSignature === razorpaySignature;
};

module.exports = { createRazorpayOrder, verifyPaymentSignature };