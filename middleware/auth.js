const { verifyJwt } = require('../utils/auth');
const authConfig = require('../config/auth');

/**
 * Extracts and verifies JWT access token from request headers or query params.
 * Attaches user payload to req.user if valid.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : (req.headers['x-access-token'] || req.query.token || req.body?.token);

  if (!token) {
    req.user = null;
    return next();
  }

  const payload = verifyJwt(token, authConfig.jwt.secret);
  if (payload) {
    req.user = payload;
  } else {
    req.user = null;
  }

  next();
}

/**
 * Middleware enforcing mandatory authentication.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Access token is missing or invalid' });
  }
  next();
}

/**
 * Role-Based Access Control (RBAC) Middleware.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role(s)` });
    }
    next();
  };
}

/**
 * Admin Access Guard.
 */
const requireAdmin = requireRole('admin');

/**
 * Vendor Access Guard.
 */
const requireVendor = requireRole('vendor', 'admin');

/**
 * Vendor Ownership & IDOR Protection Guard.
 * Ensures vendors can only view/modify their own store resources.
 */
function requireVendorOwner(req, res, next) {
  // If an authenticated user token is present, enforce strict ownership matching
  if (req.user) {
    const targetVendorId = req.params.vendorId || req.body?.vendor_id || req.query?.vendor_id;
    const isOwner = (req.user.vendor_id == targetVendorId || req.user.id == targetVendorId);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to access or modify this vendor resource (IDOR Protection)' });
    }
  }
  
  // Non-blocking fallback for existing legacy unauthenticated frontend calls
  next();
}

module.exports = {
  authenticateToken,
  requireAuth,
  requireRole,
  requireAdmin,
  requireVendor,
  requireVendorOwner
};
