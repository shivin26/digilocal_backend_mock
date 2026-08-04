require('dotenv').config();

/**
 * Validates environment variables required for server operation.
 * Sets fallback defaults for non-critical variables and logs startup configuration.
 */
function validateEnv() {
  const env = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || 5000;

  const warnings = [];

  if (!process.env.DATABASE_URL) {
    warnings.push('No Render PostgreSQL database URL configured in DATABASE_URL. Using SQLite fallback.');
  }

  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET is not set. A default fallback will be used in development, but must be set in production.');
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail@gmail.com') {
    warnings.push('EMAIL_USER is not configured. Email notifications will operate in simulation mode.');
  }

  return {
    env,
    port,
    isProduction: env === 'production'
  };
}

module.exports = { validateEnv };
