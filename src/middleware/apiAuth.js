const logger = require('../utils/logger');

// Simple API key authentication middleware
const apiAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.API_KEY || 'your-secret-api-key-2024';

  // Skip auth for health check and browser check endpoints
  const skipAuth = ['/api/health', '/api/browser-check'];
  if (skipAuth.includes(req.path)) {
    return next();
  }

  if (!apiKey) {
    logger.warn('API request without API key', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });

    return res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Please provide API key in X-API-Key header or Authorization header'
    });
  }

  if (apiKey !== validApiKey) {
    logger.warn('API request with invalid API key', {
      ip: req.ip,
      path: req.path,
      providedKey: apiKey.substring(0, 8) + '...',
      userAgent: req.get('User-Agent')
    });

    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is not valid'
    });
  }

  logger.info('API request authenticated successfully', {
    ip: req.ip,
    path: req.path
  });

  next();
};

module.exports = apiAuth;