const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/user.model');
const { logger } = require('@ops/shared');
const { ValidationError, UnauthorizedError, ConflictError } = require('@ops/shared').errorHandler;

// ─── Helper: generate JWT ────────────────────────────────────────────────────
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ─── Helper: send token response ────────────────────────────────────────────
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id, user.role);

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

// ─── Register ────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationError(errors.array()[0].msg));
    }

    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return next(new ConflictError('Email already registered'));
    }

    const user = await User.create({ name, email, password });

    logger.info('New user registered', { userId: user._id, email: user.email });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationError(errors.array()[0].msg));
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.isActive) {
      return next(new UnauthorizedError('Invalid email or password'));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(new UnauthorizedError('Invalid email or password'));
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info('User logged in', { userId: user._id });

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ─── Get current user ────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Logout (client-side token invalidation) ─────────────────────────────────
const logout = async (req, res, next) => {
  try {
    // For stateless JWT, logout is handled client-side by discarding the token.
    // For production, consider a Redis token blacklist here.
    logger.info('User logged out', { userId: req.user._id });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, logout };
