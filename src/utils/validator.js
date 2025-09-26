// Data validation utilities
class DataValidator {
  // Form data validation
  static validateFormData(data) {
    const errors = [];

    // Required fields validation
    if (!data.firstName?.trim()) errors.push('First Name is required');
    if (!data.lastName?.trim()) errors.push('Last Name is required');
    if (!data.address?.trim()) errors.push('Address is required');
    if (!data.city?.trim()) errors.push('City is required');
    if (!data.state?.trim()) errors.push('State is required');
    if (!data.zipCode?.trim()) errors.push('Zip Code is required');
    if (!data.email?.trim()) errors.push('Email is required');
    if (!data.phone?.trim()) errors.push('Phone is required');

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (data.email && !emailRegex.test(data.email)) {
      errors.push('Invalid email format');
    }

    // Phone validation (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (data.phone && !phoneRegex.test(data.phone.replace(/\D/g, ''))) {
      errors.push('Phone must be 10 digits');
    }

    // Zip code validation
    const zipRegex = /^\d{5}$/;
    if (data.zipCode && !zipRegex.test(data.zipCode)) {
      errors.push('Zip code must be 5 digits');
    }

    return errors;
  }

  // Fraud detection
  static detectFraud(data) {
    const fraudIndicators = [];

    // Test emails
    const testEmails = [
      'test@test.com', 'fake@fake.com', 'example@example.com',
      'admin@admin.com', 'noreply@noreply.com'
    ];

    if (testEmails.includes(data.email?.toLowerCase())) {
      fraudIndicators.push('Test email detected');
    }

    // Suspicious patterns
    if (data.firstName === data.lastName) {
      fraudIndicators.push('First name same as last name');
    }

    // Common fake names
    const fakeNames = ['test', 'fake', 'admin', 'user', 'demo'];
    if (fakeNames.includes(data.firstName?.toLowerCase()) ||
        fakeNames.includes(data.lastName?.toLowerCase())) {
      fraudIndicators.push('Suspicious name detected');
    }

    // Sequential or repeated numbers in phone
    const cleanPhone = data.phone?.replace(/\D/g, '');
    if (cleanPhone && (cleanPhone === '1234567890' || cleanPhone === '0000000000')) {
      fraudIndicators.push('Invalid phone number pattern');
    }

    return fraudIndicators;
  }

  // Vehicle data validation
  static validateVehicleData(data) {
    const errors = [];

    if (!data.year || data.year < 1900 || data.year > new Date().getFullYear() + 1) {
      errors.push('Valid vehicle year is required');
    }

    if (!data.make?.trim()) {
      errors.push('Vehicle make is required');
    }

    if (!data.model?.trim()) {
      errors.push('Vehicle model is required');
    }

    return errors;
  }

  // Validate driver data
  static validateDriverData(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return ['Driver data is required and must be an object'];
    }

    // Optional but if provided, should be valid
    if (data.firstName && data.firstName.length < 2) {
      errors.push('Driver first name must be at least 2 characters');
    }

    if (data.lastName && data.lastName.length < 2) {
      errors.push('Driver last name must be at least 2 characters');
    }

    if (data.dateOfBirth) {
      const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!dobPattern.test(data.dateOfBirth)) {
        errors.push('Driver date of birth must be in YYYY-MM-DD format');
      }
    }

    if (data.gender && !['M', 'F', 'X'].includes(data.gender)) {
      errors.push('Driver gender must be M, F, or X');
    }

    if (data.maritalStatus && !['M', 'S', 'D', 'W', 'E'].includes(data.maritalStatus)) {
      errors.push('Driver marital status must be M, S, D, W, or E');
    }

    if (data.licenseState && data.licenseState.length !== 2) {
      errors.push('Driver license state must be a 2-character state code');
    }

    if (data.licenseStatus && !['V', 'E', 'S', 'R'].includes(data.licenseStatus)) {
      errors.push('Driver license status must be V, E, S, or R');
    }

    if (data.relationship && !['S', 'C', 'R', 'N', 'P'].includes(data.relationship)) {
      errors.push('Driver relationship must be S (Spouse), C (Child), R (Other Related), N (Other Non-Related), or P (Parent)');
    }

    return errors;
  }
}

module.exports = DataValidator;