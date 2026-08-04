const os = require('os');
const crypto = require('crypto');

/**
 * Enterprise Pino-Compatible High-Performance Logger.
 * Formats JSON logs in production, redacts sensitive keys, and tracks correlation IDs.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'newpassword',
  'oldpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'jwt_secret',
  'otp',
  'authorization',
  'creditcard',
  'cardnumber',
  'cvv'
]);

/**
 * Recursively redacts sensitive keys from log metadata objects.
 */
function sanitizeMeta(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeMeta(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeMeta(val, depth + 1);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

class Logger {
  constructor() {
    this.hostname = os.hostname();
    this.pid = process.pid;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  _format(level, msg, meta = {}) {
    const timestamp = new Date().toISOString();
    const cleanMeta = sanitizeMeta(meta);

    if (this.isProduction) {
      return JSON.stringify({
        level: level.toUpperCase(),
        time: timestamp,
        pid: this.pid,
        hostname: this.hostname,
        msg: typeof msg === 'string' ? msg : JSON.stringify(msg),
        ...cleanMeta
      });
    } else {
      const metaStr = Object.keys(cleanMeta).length > 0 ? ` ${JSON.stringify(cleanMeta)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${msg}${metaStr}`;
    }
  }

  info(msg, meta) {
    console.log(this._format('info', msg, meta));
  }

  warn(msg, meta) {
    console.warn(this._format('warn', msg, meta));
  }

  error(msg, meta) {
    console.error(this._format('error', msg, meta));
  }

  debug(msg, meta) {
    if (this.logLevel === 'debug' || !this.isProduction) {
      console.log(this._format('debug', msg, meta));
    }
  }

  // Domain Logger Extensions
  db(msg, meta) {
    this.info(`[DB] ${msg}`, { module: 'database', ...meta });
  }

  auth(msg, meta) {
    this.info(`[AUTH] ${msg}`, { module: 'authentication', ...meta });
  }

  payment(msg, meta) {
    this.info(`[PAYMENT] ${msg}`, { module: 'payment', ...meta });
  }

  audit(msg, meta) {
    this.info(`[AUDIT] ${msg}`, { module: 'audit', ...meta });
  }
}

const logger = new Logger();
module.exports = logger;
