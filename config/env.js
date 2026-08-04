require('dotenv').config();

/**
 * Validates environment variables required for server operation.
 * Sets fallback defaults for non-critical variables and logs startup configuration.
 */
function validateEnv() {
  const env = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || 5001;

  const warnings = [];

  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    warnings.push('No PostgreSQL database configuration found (DATABASE_URL / PGHOST). Using SQLite fallback.');
  }

  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET is not set. A default fallback will be used in development, but must be set in production.');
  }

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail@gmail.com') {
    warnings.push('EMAIL_USER is not configured. Email notifications will operate in simulation mode.');
  }

  console.log(`[Env] Running in ${env.toUpperCase()} mode on PORT ${port}`);
  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[Env Warning] ${w}`));
  }

  return {
    env,
    port,
    isProduction: env === 'production'
  };
}

module.exports = { validateEnv };
