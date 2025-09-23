const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const routes = require('./src/routes');
const logger = require('./src/utils/logger');
const StartupUtils = require('./src/utils/startup');

// Initialize startup utilities
if (!StartupUtils.init()) {
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/screenshots', express.static(path.join(__dirname, 'temp/screenshots')));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method === 'POST' ? req.body : undefined
  });
  next();
});

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Insurance Form Automation API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      automation: '/api/submit-insurance-form',
      debug: '/api/debug-form-fill',
      browserCheck: '/api/browser-check',
      simpleTest: '/api/simple-test',
      urlTest: '/api/quick-url-test'
    },
    documentation: 'See README.md for full API documentation'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET /api/health',
      'POST /api/submit-insurance-form',
      'POST /api/debug-form-fill',
      'GET /api/browser-check',
      'GET /api/simple-test',
      'GET /api/quick-url-test'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  logger.info(`Insurance Form Automation API started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    platform: process.platform,
    nodeVersion: process.version
  });

  console.log(`🚀 Insurance Form Automation API running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🏥 Browser check: http://localhost:${PORT}/api/browser-check`);
  console.log(`📋 Submit form: http://localhost:${PORT}/api/submit-insurance-form`);
  console.log(`🔧 Debug form: http://localhost:${PORT}/api/debug-form-fill`);
});

module.exports = app;