const Redis = require('ioredis');
const logger = require('./logger');

let client = null;

const getRedisClient = () => {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis reconnecting... attempt ${times}`);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { err: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
};

// ─── Helper: Rate Limiter using sliding window ───────────────────────────────
/**
 * @param {string} key        - Unique key (e.g. "rate:userId:endpoint")
 * @param {number} limit      - Max requests allowed
 * @param {number} windowSecs - Window in seconds
 * @returns {boolean}         - true if allowed, false if blocked
 */
const checkRateLimit = async (key, limit = 100, windowSecs = 60) => {
  const redis = getRedisClient();
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, now, `${now}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSecs);

  const results = await pipeline.exec();
  const requestCount = results[2][1];

  return requestCount <= limit;
};

// ─── Helper: Distributed Lock (Redlock pattern, single node) ─────────────────
const acquireLock = async (lockKey, ttlMs = 5000) => {
  const redis = getRedisClient();
  const token = `${Date.now()}-${Math.random()}`;
  const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
  return result === 'OK' ? token : null;
};

const releaseLock = async (lockKey, token) => {
  const redis = getRedisClient();
  const current = await redis.get(lockKey);
  if (current === token) {
    await redis.del(lockKey);
    return true;
  }
  return false;
};

const disconnectRedis = async () => {
  if (client) {
    await client.quit();
    logger.info('Redis disconnected');
  }
};

module.exports = {
  getRedisClient,
  checkRateLimit,
  acquireLock,
  releaseLock,
  disconnectRedis,
};