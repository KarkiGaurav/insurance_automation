const puppeteer = require('puppeteer');
const PuppeteerConfig = require('../config/puppeteer');
const logger = require('../utils/logger');

// Diagnostic endpoints controller
class DiagnosticController {
  // Health check endpoint
  static async healthCheck(req, res) {
    res.json({
      status: 'OK',
      message: 'Insurance Form Automation API is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  // Browser availability check
  static async browserCheck(req, res) {
    try {
      const config = PuppeteerConfig.getBrowserConfig();

      // Get available Chrome paths
      const availablePaths = [];
      const chromePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser'
      ];

      const fs = require('fs');
      for (const path of chromePaths) {
        try {
          if (fs.existsSync(path)) {
            availablePaths.push(path);
          }
        } catch (err) {
          // Continue checking
        }
      }

      // Test browser launch
      let browserTest = null;
      try {
        browserTest = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          executablePath: config.executablePath,
          timeout: 10000
        });
        await browserTest.close();

        res.json({
          success: true,
          availablePaths,
          selectedPath: config.executablePath || 'bundled-chromium',
          browserLaunchTest: 'success',
          platform: process.platform
        });
      } catch (launchError) {
        res.json({
          success: false,
          availablePaths,
          selectedPath: config.executablePath || 'bundled-chromium',
          browserLaunchTest: 'failed',
          error: launchError.message,
          platform: process.platform
        });
      }
    } catch (error) {
      logger.error('Browser check failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        platform: process.platform
      });
    }
  }

  // Simple Puppeteer test
  static async simpleTest(req, res) {
    try {
      logger.info('Running simple Puppeteer test...');

      const config = PuppeteerConfig.getBrowserConfig();
      const browser = await puppeteer.launch(config);
      const page = await browser.newPage();

      // Test with a simple page
      await page.goto('https://httpbin.org/delay/1', {
        waitUntil: 'load',
        timeout: 10000
      });

      const content = await page.content();
      await browser.close();

      res.json({
        success: true,
        message: 'Puppeteer working fine',
        contentLength: content.length,
        platform: process.platform,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Simple test failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Quick URL accessibility test
  static async quickUrlTest(req, res) {
    try {
      logger.info('Testing target URL accessibility...');

      const config = PuppeteerConfig.getBrowserConfig();
      const browser = await puppeteer.launch(config);
      const page = await browser.newPage();

      const response = await page.goto(
        'https://2a02e4bb-946b-477d-ba1f-fdba752637be.quotes.iwantinsurance.com/auto',
        {
          waitUntil: 'load',
          timeout: 20000
        }
      );

      const title = await page.title();
      const url = page.url();
      const status = response.status();

      await browser.close();

      res.json({
        success: true,
        status,
        title,
        url,
        message: 'URL accessible',
        platform: process.platform,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('URL test failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        platform: process.platform,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Basic API test
  static async basicTest(req, res) {
    res.json({
      message: 'API is working',
      receivedData: req.body,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }
}

module.exports = DiagnosticController;