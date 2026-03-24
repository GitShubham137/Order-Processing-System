const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('@ops/shared').errorHandler;

// ─── Verify JWT ──────────────────────────────────────────────────────────────
// Order service does NOT have a User model — it only verifies the token
// and trusts the payload signed by auth-service.
const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('No token provided'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new UnauthorizedError('Invalid token'));
    }
    next(err);
  }
};

// ─── Role-based access ───────────────────────────────────────────────────────
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission for this action'));
    }
    next();
  };
};

module.exports = { protect, restrictTo };
