require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { startOrderConsumer } = require('./src/consumers/order.consumer');
const { logger, kafkaClient } = require('@ops/shared');

const PORT = process.env.PORT || 3003;

const start = async () => {
  await connectDB();

  // Start Kafka consumer to listen for order.created events
  await startOrderConsumer();

  app.listen(PORT, () => {
    logger.info(`Payment service running on port ${PORT}`);
  });
};

// ─── Graceful shutdown ───────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  await kafkaClient.disconnectProducer();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { err: err.message });
  process.exit(1);
});

start();