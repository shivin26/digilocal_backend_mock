const crypto = require('crypto');
const authConfig = require('../config/auth');

// In-memory revoked tokens store (blacklist)
const revokedTokens = new Set();

// In-memory OTP storage: Map<email, { otpHash, expiresAt, attempts }>
const otpStore = new Map();

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Hashes a plaintext password securely using Node.js crypto.scrypt.
 * Format: $scrypt$salt$derivedKey
 */
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(authConfig.password.saltBytes).toString('hex');
    crypto.scrypt(password, salt, authConfig.password.keyLen, (err, derivedKey) => {
      if (err) return reject(err);
      const hash = derivedKey.toString('hex');
      resolve(`$scrypt$${salt}$${hash}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored hash or legacy plaintext string.
 * Supports automatic upgrade of legacy plaintext passwords.
 */
async function comparePassword(plaintextPassword, storedPassword) {
  if (!storedPassword || !plaintextPassword) {
    return { matches: false, needsRehash: false };
  }

  // Handle scrypt hash format
  if (storedPassword.startsWith('$scrypt$')) {
    const parts = storedPassword.split('$');
    if (parts.length !== 4) return { matches: false, needsRehash: false };
    const salt = parts[2];
    const originalHashHex = parts[3];

    return new Promise((resolve) => {
      crypto.scrypt(plaintextPassword, salt, authConfig.password.keyLen, (err, derivedKey) => {
        if (err) return resolve({ matches: false, needsRehash: false });
        const keyBuffer = Buffer.from(originalHashHex, 'hex');
        const matches = crypto.timingSafeEqual(derivedKey, keyBuffer);
        resolve({ matches, needsRehash: false });
      });
    });
  }

  // Legacy Plaintext Password Check (for initial seed data backward compatibility)
  const isPlaintextMatch = (storedPassword === plaintextPassword);
  return {
    matches: isPlaintextMatch,
    needsRehash: isPlaintextMatch // Signal handler to auto-upgrade to scrypt
  };
}

/**
 * Generates an HMAC-SHA256 JWT Token.
 */
function signJwt(payload, secret, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64url');

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies and decodes an HMAC-SHA256 JWT Token.
 */
function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  if (revokedTokens.has(token)) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null; // Invalid signature
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired token
    }
    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * Generates an Access Token (24h) and Refresh Token (7d) pair.
 */
function generateTokens(vendorOrUser) {
  const payload = {
    id: vendorOrUser.vendor_id || vendorOrUser.id || vendorOrUser.user_id,
    vendor_id: vendorOrUser.vendor_id || vendorOrUser.id,
    email: vendorOrUser.email,
    role: vendorOrUser.role || (vendorOrUser.email?.includes('admin') ? 'admin' : 'vendor')
  };

  const accessToken = signJwt(payload, authConfig.jwt.secret, 24 * 3600); // 24 Hours
  const refreshToken = signJwt({ id: payload.id, type: 'refresh' }, authConfig.jwt.refreshTokenSecret, 7 * 86400); // 7 Days

  return { accessToken, refreshToken, expiresIn: '24h' };
}

/**
 * Revokes a token (adds to blacklist).
 */
function revokeToken(token) {
  if (token) revokedTokens.add(token);
}

/**
 * Generates a 6-digit numeric OTP.
 */
function generateOTP(email) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = Date.now() + authConfig.otp.ttlMs;

  otpStore.set(email.toLowerCase(), {
    otpHash,
    expiresAt,
    attempts: 0
  });

  return otp;
}

/**
 * Verifies an OTP for a given email.
 */
function verifyOTP(email, inputOtp) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return { valid: false, reason: 'No OTP requested or expired' };

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return { valid: false, reason: 'OTP has expired' };
  }

  if (entry.attempts >= authConfig.otp.maxAttempts) {
    otpStore.delete(email.toLowerCase());
    return { valid: false, reason: 'Maximum OTP verification attempts exceeded' };
  }

  entry.attempts += 1;
  const inputHash = crypto.createHash('sha256').update(inputOtp).digest('hex');

  if (inputHash === entry.otpHash) {
    otpStore.delete(email.toLowerCase());
    return { valid: true };
  }

  return { valid: false, reason: 'Invalid OTP' };
}

module.exports = {
  hashPassword,
  comparePassword,
  generateTokens,
  verifyJwt,
  revokeToken,
  generateOTP,
  verifyOTP
};
