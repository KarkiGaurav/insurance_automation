const InsuranceFormAutomator = require('../services/InsuranceFormAutomator');
const DataValidator = require('../utils/validator');
const logger = require('../utils/logger');

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

      res.json({
        ...result,
        processingTime: duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Automation failed', {
        error: error.message,
        duration,
        userData: userData.email // Log email for tracking but not full data for privacy
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

  // Complete multi-step form automation
  static async submitCompleteForm(req, res) {
    const startTime = Date.now();
    logger.info('Complete form automation request received', req.body);

    const { userData, vehicleData, driverData } = req.body;
    const automator = new InsuranceFormAutomator();

    try {
      // Validate user data
      const validationErrors = DataValidator.validateFormData(userData);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: validationErrors,
          step: 'user_validation_failed'
        });
      }

      // Validate vehicle data if provided
      if (vehicleData) {
        const vehicleErrors = DataValidator.validateVehicleData(vehicleData);
        if (vehicleErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: vehicleErrors,
            step: 'vehicle_validation_failed'
          });
        }
      }

      // Validate driver data if provided
      if (driverData) {
        const driverErrors = DataValidator.validateDriverData(driverData);
        if (driverErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: driverErrors,
            step: 'driver_validation_failed'
          });
        }
      }

      // Fraud detection
      const fraudIndicators = DataValidator.detectFraud(userData);
      if (fraudIndicators.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Suspicious data detected',
          indicators: fraudIndicators,
          step: 'fraud_detection_failed'
        });
      }

      // Initialize browser and fill complete form
      await automator.initialize();
      const result = await automator.fillCompleteForm(userData, vehicleData, driverData);

      const duration = Date.now() - startTime;
      logger.info(`Complete form automation completed in ${duration}ms`, { result });

      res.json({
        ...result,
        processingTime: duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Complete automation failed', {
        error: error.message,
        duration,
        userData: userData?.email // Log email for tracking but not full data for privacy
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