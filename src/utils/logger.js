const fs = require('fs');
const path = require('path');

// Simple logging utility
class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  log(level, message, data = null) {
    const logEntry = {
      timestamp: this.getTimestamp(),
      level: level.toUpperCase(),
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };

    const logString = `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}${
      logEntry.data ? '\n' + logEntry.data : ''
    }\n`;

    // Console output
    console.log(logString);

    // File output
    const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logString);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  debug(message, data = null) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, data);
    }
  }
}

module.exports = new Logger();