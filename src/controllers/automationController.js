const InsuranceFormAutomator = require('../services/InsuranceFormAutomator');
const DataValidator = require('../utils/validator');
const logger = require('../utils/logger');
const dataStore = require('../utils/dataStore');

// Main automation controller
class AutomationController {
  // Submit insurance form endpoint (Step 1 only)
  static async submitInsuranceForm(req, res) {
    const startTime = Date.now();
    logger.info('Insurance form submission request received', req.body);

    const userData = req.body;
    const automator = new InsuranceFormAutomator();

    try {
      // Validate data
      const validationErrors = DataValidator.validateFormData(userData);
      if (validationErrors.length > 0) {
        logger.warn('Form validation failed', validationErrors);
        return res.status(400).json({
          success: false,
          errors: validationErrors,
          step: 'validation_failed'
        });
      }

      // Fraud detection
      const fraudIndicators = DataValidator.detectFraud(userData);
      if (fraudIndicators.length > 0) {
        logger.warn('Fraud indicators detected', fraudIndicators);
        return res.status(400).json({
          success: false,
          error: 'Suspicious data detected',
          indicators: fraudIndicators,
          step: 'fraud_detection_failed'
        });
      }

      // Initialize browser and fill form
      await automator.initialize();
      const result = await automator.fillFirstStep(userData);

      const duration = Date.now() - startTime;
      logger.info(`Form submission completed in ${duration}ms`, { result });

      // Save submission to data store
      const savedSubmission = dataStore.saveSubmission({
        ...result,
        userData,
        vehicles: [],
        drivers: [userData],
        processingTime: duration
      });

      res.json({
        ...result,
        processingTime: duration,
        submissionId: savedSubmission?.id
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Automation failed', {
        error: error.message,
        duration,
        userData: userData.email // Log email for tracking but not full data for privacy
      });

      // Save failed submission
      dataStore.saveSubmission({
        success: false,
        userData,
        vehicles: [],
        drivers: [userData],
        message: error.message,
        step: 'automation_error',
        processingTime: duration
      });

      res.status(500).json({
        success: false,
        error: 'Automation failed',
        details: error.message,
        step: 'automation_error',
        processingTime: duration
      });
    } finally {
      await automator.close();
    }
  }

  // Complete multi-step form automation with multi-vehicle/driver support
  static async submitCompleteForm(req, res) {
    const startTime = Date.now();
    logger.info('Complete form automation request received', req.body);

    const {
      userData,
      vehicleData,
      driverData,
      // New: Support for multiple vehicles and drivers
      vehicles,
      drivers,
      policyInfo
    } = req.body;

    const automator = new InsuranceFormAutomator();

    try {
      // Process vehicles - support both single and multiple formats
      let processedVehicles = [];
      if (vehicles && Array.isArray(vehicles)) {
        // New format: multiple vehicles
        processedVehicles = vehicles;
      } else if (vehicleData) {
        // Legacy format: single vehicle
        processedVehicles = [vehicleData];
      }

      // Process drivers - support both single and multiple formats
      let processedDrivers = [];
      if (drivers && Array.isArray(drivers)) {
        // New format: multiple drivers
        processedDrivers = drivers;
      } else if (driverData) {
        // Legacy format: single driver
        processedDrivers = [driverData];
      }

      // Use userData as primary driver if no drivers array provided
      let primaryUserData = userData;
      if (processedDrivers.length === 0 && userData) {
        processedDrivers = [userData];
        primaryUserData = userData;
      } else if (processedDrivers.length > 0) {
        primaryUserData = processedDrivers[0];
      }

      // Validate user data (always validate userData for basic form fields)
      if (userData) {
        const validationErrors = DataValidator.validateFormData(userData);
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: validationErrors,
            step: 'user_validation_failed'
          });
        }
      }

      // Validate all vehicles
      for (let i = 0; i < processedVehicles.length; i++) {
        const vehicleErrors = DataValidator.validateVehicleData(processedVehicles[i]);
        if (vehicleErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: vehicleErrors,
            vehicleIndex: i,
            step: 'vehicle_validation_failed'
          });
        }
      }

      // Validate all drivers
      for (let i = 0; i < processedDrivers.length; i++) {
        const driverErrors = DataValidator.validateDriverData(processedDrivers[i]);
        if (driverErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: driverErrors,
            driverIndex: i,
            step: 'driver_validation_failed'
          });
        }
      }

      // Fraud detection on primary user/driver
      const fraudTarget = primaryUserData || processedDrivers[0];
      if (fraudTarget) {
        const fraudIndicators = DataValidator.detectFraud(fraudTarget);
        if (fraudIndicators.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Suspicious data detected',
            indicators: fraudIndicators,
            step: 'fraud_detection_failed'
          });
        }
      }

      // Initialize browser and process automation
      await automator.initialize();

      let result;
      // Always use multi-vehicle/driver automation for consistency
      logger.info(`Using multi-vehicle/driver automation: ${processedVehicles.length} vehicles, ${processedDrivers.length} drivers`);
      result = await automator.fillMultiVehicleDriverForm(
        processedVehicles,
        processedDrivers,
        policyInfo,
        userData  // Pass original userData with address/city/zip/email/phone
      );

      const duration = Date.now() - startTime;
      logger.info(`Complete form automation completed in ${duration}ms`, {
        result,
        vehicleCount: processedVehicles.length,
        driverCount: processedDrivers.length
      });

      // Save submission to data store
      const savedSubmission = dataStore.saveSubmission({
        ...result,
        userData,
        vehicles: processedVehicles,
        drivers: processedDrivers,
        processingTime: duration
      });

      res.json({
        ...result,
        processingTime: duration,
        vehicleCount: processedVehicles.length,
        driverCount: processedDrivers.length,
        submissionId: savedSubmission?.id
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Complete automation failed', {
        error: error.message,
        duration,
        userData: primaryUserData?.email || userData?.email
      });

      // Save failed submission
      dataStore.saveSubmission({
        success: false,
        userData,
        vehicles: processedVehicles,
        drivers: processedDrivers,
        message: error.message,
        step: 'complete_automation_error',
        processingTime: duration
      });

      res.status(500).json({
        success: false,
        error: 'Complete automation failed',
        details: error.message,
        step: 'complete_automation_error',
        processingTime: duration
      });
    } finally {
      await automator.close();
    }
  }

  // Debug form filling endpoint
  static async debugFormFill(req, res) {
    req.setTimeout(90000);
    res.setTimeout(90000);

    const userData = req.body;
    const automator = new InsuranceFormAutomator();

    try {
      logger.info('Starting debug form fill', userData);

      await automator.initialize();

      // Navigate and fill form (without submission)
      await automator.page.goto(automator.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await automator.page.waitForSelector('#FirstName', { timeout: 15000 });
      await automator.humanDelay(3000);

      // Fill form fields for debugging
      await automator.fillFormFields(userData || {
        firstName: 'Debug',
        lastName: 'Test',
        address: '123 Test St',
        city: 'Test City',
        state: 'CA',
        zipCode: '12345',
        email: 'debug@test.com',
        phone: '1234567890'
      });

      await automator.takeScreenshot('debug_form_filled');

      // Check checkbox state
      const checkboxInfo = await automator.page.evaluate(() => {
        const checkbox = document.getElementById('verifyDisclosure');
        if (!checkbox) return { exists: false };

        const rect = checkbox.getBoundingClientRect();
        const style = window.getComputedStyle(checkbox);

        return {
          exists: true,
          checked: checkbox.checked,
          disabled: checkbox.disabled,
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          inViewport: rect.top >= 0 && rect.left >= 0 &&
                     rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          style: { display: style.display, visibility: style.visibility, opacity: style.opacity }
        };
      });

      // Get all checkboxes
      const allCheckboxes = await automator.page.evaluate(() => {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        return Array.from(checkboxes).map(cb => ({
          id: cb.id,
          name: cb.name,
          checked: cb.checked,
          disabled: cb.disabled,
          visible: cb.offsetParent !== null
        }));
      });

      res.json({
        success: true,
        checkboxInfo,
        allCheckboxes,
        message: 'Debug completed - check screenshots in temp/screenshots',
        currentUrl: automator.page.url(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Debug form fill failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      await automator.close();
    }
  }

}

module.exports = AutomationController;