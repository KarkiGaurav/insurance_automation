const fs = require('fs');

// Puppeteer configuration for different environments
class PuppeteerConfig {
  // Speed mode - block unnecessary resources and reduce delays
  static speedMode = process.env.SPEED_MODE !== 'false'; // Default: true
  static turboMode = process.env.TURBO_MODE !== 'false'; // Default: true (ultra-fast mode)

  static getBrowserConfig() {
    // Check if we want visible browser
    const showBrowser = process.env.HEADLESS === 'false' || process.env.SHOW_BROWSER === 'true';
    
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,BlockThirdPartyCookies',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-site-isolation-trials',
      '--disable-extensions',
      '--disable-default-apps',
      '--mute-audio',
      '--disable-translate',
      '--disable-sync',
      '--disable-notifications'
    ];

    // Remove problematic flags for visible mode
    if (!showBrowser) {
      baseArgs.push('--no-zygote', '--single-process');
    }

    const config = {
      headless: showBrowser ? false : 'new',
      args: baseArgs,
      timeout: 60000,
      ignoreHTTPSErrors: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    };

    // Add slowMo only for visible mode (but not in turbo mode)
    if (showBrowser && !this.turboMode) {
      config.slowMo = 50;
    }

    // Chrome executable path detection
    if (process.platform === 'darwin') {
      config.executablePath = this.findChromeExecutable();
    }

    return config;
  }

  // Resource types to block for faster loading
  // NOTE: Don't block 'stylesheet' as some forms need CSS for validation display
  static getBlockedResources() {
    return [
      'image',
      'font',
      'media',
      'texttrack'
    ];
  }

  // URLs to block (analytics, ads, tracking) - be careful not to block essential resources
  static getBlockedUrls() {
    return [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.net',
      'facebook.com/tr',
      'doubleclick.net',
      'hotjar.com',
      'mixpanel.com',
      'segment.io',
      'optimizely.com',
      'crazyegg.com',
      'mouseflow.com',
      'fullstory.com',
      'newrelic.com',
      'nr-data.net'
    ];
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