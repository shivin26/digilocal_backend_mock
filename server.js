require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, closeDb, query } = require('./db');
const { validateEnv } = require('./config/env');
const { startSubscriptionCron } = require('./config/cron');
const { loggerMiddleware } = require('./middleware/loggerMiddleware');
const { compressionMiddleware } = require('./middleware/compression');
const { owaspSecurityHeaders } = require('./middleware/security');
const logger = require('./utils/logger');

// ── Startup Environment Check ────────────────────────────────
validateEnv();

// ── Route Modules ────────────────────────────────────────────
const healthRouter = require('./routes/health');
const societiesRouter = require('./routes/societies');
const storefrontRouter = require('./routes/storefront');
const ordersRouter = require('./routes/orders');
const vendorAuthRouter = require('./routes/vendorAuth');
const vendorPanelRouter = require('./routes/vendorPanel');
const adminRouter = require('./routes/admin');

// ── App Setup ────────────────────────────────────────────────
const app = express();

// ── OWASP Security & CORS Configuration ──────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Blocked by CORS policy'));
        }
    },
    credentials: true
}));

app.use(owaspSecurityHeaders);
app.use(express.json({ limit: '10mb' }));

// ── Attach Performance Compression & Logging Middlewares ──────
app.use(compressionMiddleware);
app.use(loggerMiddleware);

const PORT = process.env.PORT || 5000;

// ── Database Init ────────────────────────────────────────────
initDb().catch(err => {
    logger.error('Fatal Database initialization error', { error: err.message });
    process.exit(1);
});

// ── OpenAPI 3.1 & Interactive Swagger UI Documentation ──────
const openApiSpecPath = path.join(__dirname, 'docs', 'openapi.json');

app.get('/openapi.json', (req, res) => {
    if (fs.existsSync(openApiSpecPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(openApiSpecPath);
    } else {
        res.status(404).json({ error: 'OpenAPI specification file not found' });
    }
});

app.get('/api-docs', (req, res) => {
    const swaggerHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>DigiLocal API Documentation - Swagger UI</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      <style>
        body { margin: 0; padding: 0; background: #FAF9F6; }
        .swagger-ui .topbar { background-color: #0A1428; border-bottom: 3px solid #C5A880; }
        .swagger-ui .topbar a { max-width: 300px; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
      <script>
        window.onload = function() {
          SwaggerUIBundle({
            url: "/openapi.json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIBundle.SwaggerUIStandalonePreset
            ]
          });
        };
      </script>
    </body>
    </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(swaggerHtml);
});

// ── Mount Health, Readiness & Observability Endpoints ──────
app.use('/health', healthRouter);
app.get('/version', (req, res) => res.redirect('/health/version'));

// ── Mount Business Routes ────────────────────────────────────
app.use('/api/societies', societiesRouter);   // Society management
app.use('/api', storefrontRouter);            // Storefront APIs
app.use('/api/orders', ordersRouter);         // Customer orders
app.use('/api/vendors', vendorAuthRouter);    // Vendor auth
app.use('/api/users', vendorAuthRouter);      // User auth (Vendors logging in as users)
app.use('/api/vendorPanel', vendorPanelRouter); // Vendor dashboard
app.use('/api/admin', adminRouter);           // Admin portal

// ── Legacy Backward-Compatibility Routes ─────────────────────
app.post('/registerVender', (req, res) => {
    req.url = '/api/vendors/register';
    app._router.handle(req, res);
});

app.get('/venderPanel/:venderId', (req, res) => {
    res.redirect(`/api/vendorPanel/${req.params.venderId}`);
});

// ── QR Code Shop Direct Link ─────────────────────────────────
app.get('/shop/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        const result = await query(
            `SELECT vendor_id, society_id, store_name FROM vendors WHERE vendor_id = ?`,
            [vendorId]
        );
        if (result.rows.length === 0) {
            return res.status(404).send('<h2>Shop not found</h2>');
        }
        const vendor = result.rows[0];
        const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendOrigin}/${vendor.society_id}/${vendor.vendor_id}`);
    } catch (err) {
        logger.error('QR shop redirect error', { error: err.message, vendorId: req.params.vendorId });
        res.status(500).send('<h2>Server error</h2>');
    }
});

// ── Global Error Handling Middleware ─────────────────────────
app.use((err, req, res, next) => {
    logger.error('Unhandled Application Error', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        requestId: req.id
    });
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        requestId: req.id
    });
});

// ── Start Cron Jobs ──────────────────────────────────────────
startSubscriptionCron();

// ── Start Server ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
    logger.info(`DigiLocal Server running on PORT ${PORT} | Health: http://localhost:${PORT}/health | Docs: http://localhost:${PORT}/api-docs`, { port: PORT });
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop existing server or change PORT in .env`, { port: PORT });
    } else {
        logger.error('Server boot error', { error: err.message });
    }
});

// ── Uncaught Exception & Process Lifecycle Handlers ───────────
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at Promise', { reason: reason?.message || reason });
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception thrown', { error: err.message, stack: err.stack });
});

const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`, { signal });
    server.close(async () => {
        logger.info('HTTP server closed.');
        await closeDb();
        logger.info('Database connections closed cleanly. Shutdown complete.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));