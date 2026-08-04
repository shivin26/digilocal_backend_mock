const zlib = require('zlib');

/**
 * Lightweight Zero-Dependency Gzip Response Compression Middleware.
 * Compresses JSON/HTML response payloads > 1024 bytes to reduce network transfer latency.
 */
function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const originalSend = res.send;

  res.send = function (body) {
    if (!body || req.method === 'HEAD') {
      return originalSend.call(this, body);
    }

    const buf = Buffer.isBuffer(body)
      ? body
      : (typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body)));

    // Only compress payloads larger than 1024 bytes
    if (buf.length < 1024) {
      return originalSend.call(this, body);
    }

    zlib.gzip(buf, (err, gzipped) => {
      if (err) {
        return originalSend.call(this, body);
      }

      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Type', res.getHeader('Content-Type') || 'application/json');
      res.setHeader('Content-Length', gzipped.length);
      res.setHeader('Vary', 'Accept-Encoding');
      originalSend.call(this, gzipped);
    });
  };

  next();
}

module.exports = { compressionMiddleware };
