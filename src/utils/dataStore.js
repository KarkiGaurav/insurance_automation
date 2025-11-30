const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class DataStore {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.submissionsFile = path.join(this.dataDir, 'submissions.json');
    this.ensureDataDirectory();
  }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger.info(`Created data directory: ${this.dataDir}`);
    }
    
    // Initialize submissions file if it doesn't exist
    if (!fs.existsSync(this.submissionsFile)) {
      fs.writeFileSync(this.submissionsFile, JSON.stringify({ submissions: [] }, null, 2));
      logger.info('Initialized submissions.json');
    }
  }

  // Save a new submission
  saveSubmission(data) {
    try {
      const submissions = this.getAllSubmissions();
      
      const submission = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        status: data.success ? 'success' : 'failed',
        userData: this.sanitizeUserData(data.userData),
        vehicles: data.vehicles || [],
        drivers: this.sanitizeDrivers(data.drivers || []),
        result: {
          success: data.success,
          message: data.message,
          step: data.step,
          processingTime: data.processingTime,
          currentUrl: data.currentUrl,
          quotes: data.quotes || null
        }
      };

      submissions.submissions.push(submission);
      
      fs.writeFileSync(this.submissionsFile, JSON.stringify(submissions, null, 2));
      logger.info(`Saved submission ${submission.id}`);
      
      return submission;
    } catch (error) {
      logger.error('Failed to save submission', { error: error.message });
      return null;
    }
  }

  // Get all submissions
  getAllSubmissions() {
    try {
      const data = fs.readFileSync(this.submissionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read submissions', { error: error.message });
      return { submissions: [] };
    }
  }

  // Get submission by ID
  getSubmissionById(id) {
    const data = this.getAllSubmissions();
    return data.submissions.find(s => s.id === id) || null;
  }

  // Get recent submissions
  getRecentSubmissions(limit = 10) {
    const data = this.getAllSubmissions();
    return data.submissions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // Get submissions by status
  getSubmissionsByStatus(status) {
    const data = this.getAllSubmissions();
    return data.submissions.filter(s => s.result.status === status);
  }

  // Get submission stats
  getStats() {
    const data = this.getAllSubmissions();
    const submissions = data.submissions;
    
    const successful = submissions.filter(s => s.status === 'success').length;
    const failed = submissions.filter(s => s.status === 'failed').length;
    
    const avgProcessingTime = submissions.length > 0
      ? submissions.reduce((sum, s) => sum + (s.result.processingTime || 0), 0) / submissions.length
      : 0;

    return {
      total: submissions.length,
      successful,
      failed,
      successRate: submissions.length > 0 ? ((successful / submissions.length) * 100).toFixed(1) + '%' : '0%',
      avgProcessingTime: Math.round(avgProcessingTime),
      lastSubmission: submissions.length > 0 
        ? submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp 
        : null
    };
  }

  // Delete a submission
  deleteSubmission(id) {
    try {
      const data = this.getAllSubmissions();
      const index = data.submissions.findIndex(s => s.id === id);
      
      if (index === -1) return false;
      
      data.submissions.splice(index, 1);
      fs.writeFileSync(this.submissionsFile, JSON.stringify(data, null, 2));
      logger.info(`Deleted submission ${id}`);
      
      return true;
    } catch (error) {
      logger.error('Failed to delete submission', { error: error.message });
      return false;
    }
  }

  // Clear all submissions
  clearAll() {
    try {
      fs.writeFileSync(this.submissionsFile, JSON.stringify({ submissions: [] }, null, 2));
      logger.info('Cleared all submissions');
      return true;
    } catch (error) {
      logger.error('Failed to clear submissions', { error: error.message });
      return false;
    }
  }

  // Generate unique ID
  generateId() {
    return 'sub_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // Sanitize user data (remove sensitive info for storage)
  sanitizeUserData(userData) {
    if (!userData) return null;
    return {
      firstName: userData.firstName,
      lastName: userData.lastName,
      city: userData.city,
      state: userData.state,
      zipCode: userData.zipCode,
      email: userData.email ? userData.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
      phone: userData.phone ? userData.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2') : null
    };
  }

  // Sanitize driver data
  sanitizeDrivers(drivers) {
    return drivers.map(driver => ({
      firstName: driver.firstName,
      lastName: driver.lastName,
      dateOfBirth: driver.dateOfBirth ? driver.dateOfBirth.replace(/\d{2}$/, '**') : null,
      gender: driver.gender,
      relationship: driver.relationship
    }));
  }
}

module.exports = new DataStore();
