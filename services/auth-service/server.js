require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { logger } = require('@ops/shared');

const PORT = process.env.PORT || 3001;

const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Auth service running on port ${PORT}`);
  });
};

// ─── Graceful shutdown ───────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection, shutting down...', { err: err.message });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

console.log("Start");
start();