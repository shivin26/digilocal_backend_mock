const authConfig = require('../config/auth');
const logger = require('../utils/logger');

// Track failed login attempts per identity (email or IP): Map<key, { count, lockedUntil }>
const failedLoginAttempts = new Map();

/**
 * Checks if an account/IP is currently locked due to excessive failed attempts.
 */
function checkAccountLockout(key) {
  const record = failedLoginAttempts.get(key.toLowerCase());
  if (!record) return { isLocked: false };

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMinutes = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return {
      isLocked: true,
      remainingMinutes,
      message: `Account temporarily locked due to repeated failed login attempts. Please try again in ${remainingMinutes} minute(s).`
    };
  }

  // Reset expired lockout
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    failedLoginAttempts.delete(key.toLowerCase());
  }

  return { isLocked: false };
}

/**
 * Records a failed login attempt. Locks account if threshold reached.
 */
function recordFailedAttempt(key) {
  const k = key.toLowerCase();
  const record = failedLoginAttempts.get(k) || { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= authConfig.lockout.maxFailedAttempts) {
    record.lockedUntil = Date.now() + authConfig.lockout.lockoutDurationMs;
    logger.auth(`Account/IP ${k} locked for 15 minutes due to ${record.count} failed login attempts.`, { key: k });
  }

  failedLoginAttempts.set(k, record);
}

/**
 * Clears failed login attempt counter upon successful authentication.
 */
function resetFailedAttempts(key) {
  failedLoginAttempts.delete(key.toLowerCase());
}

/**
 * Express middleware for login brute-force protection.
 */
function loginBruteForceGuard(req, res, next) {
  const identifier = req.body?.email || req.ip;
  if (!identifier) return next();

  const lockoutStatus = checkAccountLockout(identifier);
  if (lockoutStatus.isLocked) {
    return res.status(429).json({ error: lockoutStatus.message, isLocked: true });
  }

  next();
}

/**
 * OWASP Security Headers Middleware (Zero-Dependency Helmet Replacement).
 */
function owaspSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:;");
  next();
}

module.exports = {
  checkAccountLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  loginBruteForceGuard,
  owaspSecurityHeaders
};
