const { redisClient, errorHandler } = require('@ops/shared');
const { TooManyRequestsError } = errorHandler;

/**
 * Redis-backed sliding window rate limiter.
 * @param {object} options
 * @param {number} options.limit      - Max requests in the window (default: 10)
 * @param {number} options.windowSecs - Window size in seconds (default: 60)
 * @param {string} options.keyPrefix  - Key prefix for namespacing (default: 'rl')
 */
const rateLimiter = ({ limit = 10, windowSecs = 60, keyPrefix = 'rl' } = {}) => {
  return async (req, res, next) => {
    try {
      // Use IP as the identifier (can extend to userId for authenticated routes)
      const identifier = req.ip || req.connection.remoteAddress || 'unknown';
      const key = `${keyPrefix}:${identifier}:${req.path}`;

      const allowed = await redisClient.checkRateLimit(key, limit, windowSecs);

      // Attach rate limit headers for transparency
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Window', `${windowSecs}s`);

      if (!allowed) {
        return next(
          new TooManyRequestsError(
            `Too many requests. Max ${limit} requests per ${windowSecs} seconds.`
          )
        );
      }

      next();
    } catch (err) {
      // If Redis is down, fail open (don't block users)
      next();
    }
  };
};

// ─── Preset limiters ─────────────────────────────────────────────────────────
const authLimiter = rateLimiter({ limit: 10, windowSecs: 60, keyPrefix: 'rl:auth' });
const strictLimiter = rateLimiter({ limit: 5, windowSecs: 60, keyPrefix: 'rl:strict' });

module.exports = { rateLimiter, authLimiter, strictLimiter };
