const { redisClient, errorHandler } = require('@ops/shared');
const { TooManyRequestsError } = errorHandler;

const rateLimiter = ({ limit = 20, windowSecs = 60, keyPrefix = 'rl' } = {}) => {
  return async (req, res, next) => {
    try {
      const identifier = req.user ? req.user.id : (req.ip || 'unknown');
      const key = `${keyPrefix}:${identifier}:${req.path}`;

      const allowed = await redisClient.checkRateLimit(key, limit, windowSecs);

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Window', `${windowSecs}s`);

      if (!allowed) {
        return next(
          new TooManyRequestsError(
            `Too many requests. Max ${limit} per ${windowSecs} seconds.`
          )
        );
      }

      next();
    } catch {
      // Fail open if Redis is down
      next();
    }
  };
};

const orderLimiter  = rateLimiter({ limit: 20, windowSecs: 60,  keyPrefix: 'rl:order' });
const createLimiter = rateLimiter({ limit: 5,  windowSecs: 60,  keyPrefix: 'rl:order:create' });

module.exports = { rateLimiter, orderLimiter, createLimiter };
