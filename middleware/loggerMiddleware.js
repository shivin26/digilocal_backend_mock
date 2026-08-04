const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Express Middleware for Request ID, Correlation ID, and HTTP Request/Response Logging.
 */
function loggerMiddleware(req, res, next) {
  const startTime = Date.now();

  // Generate or propagate Request ID and Correlation ID
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const correlationId = req.headers['x-correlation-id'] || requestId;

  req.id = requestId;
  req.correlationId = correlationId;

  // Set response headers for client tracing
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  // Log incoming HTTP Request
  logger.info(`HTTP ${req.method} ${req.originalUrl || req.url}`, {
    requestId,
    correlationId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent']
  });

  // Intercept response finish event to log Response status & duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');

    logger[logLevel](`HTTP ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`, {
      requestId,
      correlationId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTimeMs: duration
    });
  });

  next();
}

module.exports = { loggerMiddleware };
