const express = require('express');
const router = express.Router();
const { query, getDbType } = require('../db');
const pkg = require('../package.json');

const startTime = Date.now();

// GET /health - Full Health Check Report
router.get('/', async (req, res) => {
  let dbStatus = 'DOWN';
  let dbError = null;

  try {
    await query('SELECT 1');
    dbStatus = 'UP';
  } catch (err) {
    dbStatus = 'DOWN';
    dbError = err.message;
  }

  const isHealthy = dbStatus === 'UP';
  const statusCode = isHealthy ? 200 : 503;

  const memoryUsage = process.memoryUsage();

  res.status(statusCode).json({
    status: isHealthy ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    version: pkg.version || '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    environment: process.env.NODE_ENV || 'development',
    requestId: req.id || null,
    database: {
      status: dbStatus,
      engine: getDbType(),
      error: dbError
    },
    memory: {
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024)
    }
  });
});

// GET /health/live - Liveness Probe (K8s/Docker)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
  });
});

// GET /health/ready - Readiness Probe (K8s/Docker)
router.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({
      status: 'READY',
      timestamp: new Date().toISOString(),
      database: 'CONNECTED'
    });
  } catch (err) {
    res.status(503).json({
      status: 'NOT_READY',
      timestamp: new Date().toISOString(),
      error: 'Database ping failed: ' + err.message
    });
  }
});

// GET /version - Application Metadata
router.get('/version', (req, res) => {
  res.status(200).json({
    name: pkg.name || 'digilocal-backend',
    version: pkg.version || '1.0.0',
    description: pkg.description || 'Backend API for DigiLocal Marketplace',
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

module.exports = router;
