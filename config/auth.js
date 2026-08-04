/**
 * Authentication and Authorization Configuration
 */
module.exports = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'digilocal_jwt_super_secret_key_change_in_prod_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'digilocal_refresh_super_secret_key_2026',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  },

  // Password Security Policy (scrypt parameters)
  password: {
    saltBytes: 16,
    keyLen: 64,
    minPasswordLength: 6
  },

  // Brute-force & Account Lockout Policy
  lockout: {
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000 // 15 minutes
  },

  // OTP Configuration
  otp: {
    digits: 6,
    ttlMs: 10 * 60 * 1000, // 10 minutes
    maxAttempts: 3
  }
};
