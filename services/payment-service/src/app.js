const express = require('express');
const { errorHandler, notFoundHandler } = require('@ops/shared').errorHandler;
const paymentRoutes = require('./routes/payment.routes');

const app = express();

// ─── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1/payments', paymentRoutes);

// ─── Error handling ──────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;