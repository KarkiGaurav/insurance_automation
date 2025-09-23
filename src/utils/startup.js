const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Startup utility to ensure all required directories exist
class StartupUtils {
  static ensureDirectories() {
    const directories = [
      path.join(__dirname, '../../logs'),
      path.join(__dirname, '../../temp'),
      path.join(__dirname, '../../temp/screenshots'),
      path.join(__dirname, '../../public'),
      path.join(__dirname, '../../public/images')
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });

    logger.info('All required directories verified/created');
  }

  static checkDependencies() {
    try {
      // Check if required packages are available
      require('puppeteer');
      require('express');
      require('cors');
      require('helmet');

      logger.info('All dependencies verified');
      return true;
    } catch (error) {
      logger.error('Missing dependencies', { error: error.message });
      return false;
    }
  }

  static displayStartupInfo() {
    const info = {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      timestamp: new Date().toISOString()
    };

    logger.info('Application startup info', info);

    console.log('\n🚀 Insurance Form Automation API');
    console.log('================================');
    console.log(`📦 Node.js: ${info.nodeVersion}`);
    console.log(`💻 Platform: ${info.platform} (${info.architecture})`);
    console.log(`🌍 Environment: ${info.environment}`);
    console.log(`🔌 Port: ${info.port}`);
    console.log('================================\n');
  }

  static init() {
    try {
      this.ensureDirectories();

      if (!this.checkDependencies()) {
        throw new Error('Missing required dependencies');
      }

      this.displayStartupInfo();

      logger.info('Startup initialization completed successfully');
      return true;
    } catch (error) {
      logger.error('Startup initialization failed', { error: error.message });
      console.error('❌ Startup failed:', error.message);
      return false;
    }
  }
}

module.exports = StartupUtils;