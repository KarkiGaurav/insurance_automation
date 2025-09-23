const fs = require('fs');

// Puppeteer configuration for different environments
class PuppeteerConfig {
  static getBrowserConfig() {
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--remote-debugging-port=0'
    ];

    const config = {
      headless: process.env.NODE_ENV === 'production' ? 'new' : 'new',
      args: baseArgs,
      timeout: 60000,
      ignoreHTTPSErrors: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    };

    // Chrome executable path detection
    if (process.platform === 'darwin') {
      config.executablePath = this.findChromeExecutable();
    }

    return config;
  }

  static findChromeExecutable() {
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser'
    ];

    for (const path of chromePaths) {
      try {
        if (fs.existsSync(path)) {
          console.log(`Found Chrome at: ${path}`);
          return path;
        }
      } catch (err) {
        // Continue to next path
      }
    }

    return undefined; // Use Puppeteer's bundled Chromium
  }
}

module.exports = PuppeteerConfig;