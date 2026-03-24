const mongoose = require('mongoose');

// ─── Sub-schema: Order Item ──────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: [true, 'Product ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
  },
  { _id: false }
);

// ─── Sub-schema: Shipping Address ───────────────────────────────────────────
const addressSchema = new mongoose.Schema(
  {
    street:  { type: String, required: true, trim: true },
    city:    { type: String, required: true, trim: true },
    state:   { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
  },
  { _id: false }
);

// ─── Main Order Schema ───────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Order must have at least one item',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative'],
    },
    shippingAddress: {
      type: addressSchema,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',         // order placed, awaiting payment
        'payment_pending', // sent to payment service
        'payment_failed',  // payment failed
        'confirmed',       // payment success, inventory reserved
        'processing',      // being prepared
        'shipped',         // dispatched
        'delivered',       // delivered to customer
        'cancelled',       // cancelled
      ],
      default: 'pending',
      index: true,
    },
    paymentId: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Virtual: item count ─────────────────────────────────────────────────────
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// ─── Index for common queries ────────────────────────────────────────────────
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
