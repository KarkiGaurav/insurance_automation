// Database configuration (placeholder for future database integration)
module.exports = {
  // MongoDB configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/insurance_automation',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },

  // Redis configuration for caching
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null
  }
};