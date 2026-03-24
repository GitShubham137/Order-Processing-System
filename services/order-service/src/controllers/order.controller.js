const { validationResult } = require('express-validator');
const Order = require('../models/order.model');
const { kafkaClient, logger } = require('@ops/shared');
const { TOPICS } = require('@ops/shared').topics;
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require('@ops/shared').errorHandler;

// ─── Create Order ────────────────────────────────────────────────────────────
const createOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationError(errors.array()[0].msg));
    }

    const { items, shippingAddress, notes } = req.body;

    // Calculate total amount from items
    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const order = await Order.create({
      userId: req.user.id,
      items,
      totalAmount,
      shippingAddress,
      notes,
      status: 'pending',
    });

    // ── Publish order.created event to Kafka ──────────────────────────────
    await kafkaClient.publishEvent(TOPICS.ORDER_CREATED, {
      id:              order._id.toString(),
      type:            'ORDER_CREATED',
      userId:          order.userId,
      items:           order.items,
      totalAmount:     order.totalAmount,
      shippingAddress: order.shippingAddress,
      createdAt:       order.createdAt,
    });

    // Update status to payment_pending after publishing
    order.status = 'payment_pending';
    await order.save();

    logger.info('Order created and event published', {
      orderId: order._id,
      userId:  req.user.id,
      total:   totalAmount,
    });

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get all orders for current user ────────────────────────────────────────
const getMyOrders = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const filter = { userId: req.user.id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      orders,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get single order by ID ──────────────────────────────────────────────────
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return next(new NotFoundError('Order not found'));
    }

    // Users can only see their own orders; admins can see all
    if (order.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new ForbiddenError('You do not have access to this order'));
    }

    res.status(200).json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

// ─── Cancel order ────────────────────────────────────────────────────────────
const cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return next(new NotFoundError('Order not found'));
    }

    if (order.userId !== req.user.id && req.user.role !== 'admin') {
      return next(new ForbiddenError('You do not have access to this order'));
    }

    const cancellableStatuses = ['pending', 'payment_pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return next(
        new ValidationError(`Order cannot be cancelled in "${order.status}" status`)
      );
    }

    order.status = 'cancelled';
    await order.save();

    logger.info('Order cancelled', { orderId: order._id, userId: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      order,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: get all orders ───────────────────────────────────────────────────
const getAllOrders = async (req, res, next) => {
  try {
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 20;
    const skip   = (page - 1) * limit;
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.userId) filter.userId = req.query.userId;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      orders,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createOrder, getMyOrders, getOrderById, cancelOrder, getAllOrders };
