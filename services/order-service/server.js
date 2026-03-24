require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { logger, kafkaClient } = require('@ops/shared');

const PORT = process.env.PORT || 3002;

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Order service running on port ${PORT}`);
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