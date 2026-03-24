const express = require('express');
const { body } = require('express-validator');
const {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
} = require('../controllers/order.controller');
const { protect, restrictTo } = require('../middleware/auth.middleware');
const { orderLimiter, createLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// ─── Validation rules ────────────────────────────────────────────────────────
const createOrderRules = [
  body('items')
    .isArray({ min: 1 }).withMessage('Items must be a non-empty array'),
  body('items.*.productId')
    .notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.name')
    .trim()
    .notEmpty().withMessage('Product name is required for each item'),
  body('items.*.quantity')
    .isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('items.*.price')
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
  body('shippingAddress.street')
    .trim().notEmpty().withMessage('Street is required'),
  body('shippingAddress.city')
    .trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.state')
    .trim().notEmpty().withMessage('State is required'),
  body('shippingAddress.pincode')
    .trim().notEmpty().withMessage('Pincode is required'),
];

// ─── All routes require auth ─────────────────────────────────────────────────
router.use(protect);

// ─── User routes ─────────────────────────────────────────────────────────────
router.post(   '/',           createLimiter, createOrderRules, createOrder);
router.get(    '/my-orders',  orderLimiter,  getMyOrders);
router.get(    '/:id',        orderLimiter,  getOrderById);
router.patch(  '/:id/cancel', orderLimiter,  cancelOrder);

// ─── Admin routes ────────────────────────────────────────────────────────────
router.get('/', restrictTo('admin'), getAllOrders);

module.exports = router;
