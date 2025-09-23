const puppeteer = require('puppeteer');
const PuppeteerConfig = require('../config/puppeteer');
const StateMapper = require('../utils/stateMapping');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Main insurance form automation service
class InsuranceFormAutomator {
  constructor() {
    this.url = 'https://2a02e4bb-946b-477d-ba1f-fdba752637be.quotes.iwantinsurance.com/auto';
    this.browser = null;
    this.page = null;
    this.screenshotDir = path.join(__dirname, '../../temp/screenshots');
    this.ensureDirectories();
  }

  ensureDirectories() {
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
      logger.info(`Created screenshots directory: ${this.screenshotDir}`);
    }
  }

  async initialize() {
    try {
      logger.info('Initializing browser...');
      const config = PuppeteerConfig.getBrowserConfig();
      this.browser = await puppeteer.launch(config);
      this.page = await this.browser.newPage();

      // Set realistic browser properties
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
      await this.page.setViewport({ width: 1366, height: 768 });

      logger.info('Browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize browser', { error: error.message });
      throw error;
    }
  }

  async fillFirstStep(userData) {
    try {
      logger.info('Starting form filling process', userData);

      // Navigate to form
      logger.info('Navigating to form...');
      await this.page.goto(this.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for form to be ready
      logger.info('Waiting for page to fully load...');
      const formReady = await Promise.race([
        this.page.waitForSelector('#FirstName', { timeout: 15000 }).then(() => 'firstname'),
        this.page.waitForSelector('#residence', { timeout: 15000 }).then(() => 'form'),
        this.page.waitForSelector('input[type="text"]', { timeout: 15000 }).then(() => 'input'),
        this.page.waitForSelector('#container', { timeout: 15000 }).then(() => 'container')
      ]).catch(async () => {
        await this.takeScreenshot('page_load_error');
        throw new Error('Page failed to load properly');
      });

      logger.info(`Page ready detected via: ${formReady}`);

      // Additional wait for JavaScript
      await this.humanDelay(3000);

      // Handle popups
      await this.handlePopups();

      // Fill form fields
      await this.fillFormFields(userData);

      // Handle agreement checkbox
      await this.handleAgreementCheckbox();

      // Submit form
      return await this.submitForm();

    } catch (error) {
      logger.error('Error in fillFirstStep', { error: error.message });
      await this.takeScreenshot('error_debug');

      return {
        success: false,
        error: error.message,
        currentUrl: this.page ? this.page.url() : 'unknown',
        step: 'step1_error'
      };
    }
  }

  // Complete multi-step automation
  async fillCompleteForm(userData, vehicleData = null, driverData = null) {
    try {
      // Step 1: Fill personal information
      const step1Result = await this.fillFirstStep(userData);
      if (!step1Result.success) {
        return step1Result;
      }

      // Continue through conditional steps based on current page
      return await this.handleConditionalSteps(vehicleData, driverData);

    } catch (error) {
      logger.error('Error in fillCompleteForm', { error: error.message });
      return {
        success: false,
        error: error.message,
        currentUrl: this.page ? this.page.url() : 'unknown',
        step: 'multi_step_error'
      };
    }
  }

  // Handle all conditional steps in sequence
  async handleConditionalSteps(vehicleData, driverData) {
    let currentUrl = this.page.url();
    let quoteResult = null;
    let storedQuotes = null; // Store quotes for final return
    logger.info(`Starting conditional steps, current URL: ${currentUrl}`);

    // Step 2: Vehicle selection (if on prefill page)
    if (currentUrl.includes('/Prefill')) {
      const vehicleResult = await this.handleVehicleLookupStep(vehicleData);
      if (!vehicleResult.success) return vehicleResult;
      currentUrl = this.page.url();
    }

    // Step 3: Vehicle usage (pg2)
    if (currentUrl.includes('/VehicleUsage') || await this.page.$('#pg2')) {
      const usageResult = await this.handleVehicleUsageStep(vehicleData);
      if (!usageResult.success) return usageResult;
      currentUrl = this.page.url();
    }

    // Step 4: Vehicle list (pg3)
    if (currentUrl.includes('/VehicleList') || await this.page.$('#pg3')) {
      const listResult = await this.handleVehicleListStep();
      if (!listResult.success) return listResult;
      currentUrl = this.page.url();
    }

    // Step 5: Driver information (pg4)
    if (currentUrl.includes('/Driver') || await this.page.$('#pg4')) {
      const driverResult = await this.handleDriverInformationStep(driverData);
      if (!driverResult.success) return driverResult;
      currentUrl = this.page.url();
    }

    // Step 6: Driver list (pg5)
    if (currentUrl.includes('/DriverList') || await this.page.$('#pg5')) {
      const driverListResult = await this.handleDriverListStep();
      if (!driverListResult.success) return driverListResult;
      currentUrl = this.page.url();
    }

    // Step 7: Policy information (pg6)
    if (currentUrl.includes('/PolicyInfo') || await this.page.$('#pg6')) {
      const policyResult = await this.handlePolicyInformationStep(driverData?.policyInfo);
      if (!policyResult.success) return policyResult;
      currentUrl = this.page.url();
    }

    // Step 8: Coverage options (pg7)
    if (currentUrl.includes('/CoverageOptions') || await this.page.$('#pg7')) {
      const coverageResult = await this.handleCoverageOptionsStep(driverData?.coveragePreference);
      if (!coverageResult.success) return coverageResult;
      currentUrl = this.page.url();
    }

    // Step 9: Property info (pg8)
    if (currentUrl.includes('/PropertyInfo') || await this.page.$('#pg8')) {
      const propertyResult = await this.handlePropertyInfoStep(driverData?.propertyInfo);
      if (!propertyResult.success) return propertyResult;
      currentUrl = this.page.url();
    }

    // Step 10: Check for quotes (may be on different pages)
    logger.info('Checking for quotes on current page...');

    // Try to extract quotes from current page regardless of URL
    const quotesOnCurrentPage = await this.extractQuotesFromCurrentPage();
    if (quotesOnCurrentPage && quotesOnCurrentPage.quotes && quotesOnCurrentPage.quotes.length > 0) {
      logger.info(`Found ${quotesOnCurrentPage.quotes.length} quotes on current page`);
      storedQuotes = quotesOnCurrentPage;
    }

    // If we're specifically on QuoteResults page, use the detailed handler
    if (currentUrl.includes('/QuoteResults') || await this.page.$('#pgResults')) {
      logger.info('On QuoteResults page, using detailed quote handler...');
      quoteResult = await this.handleQuoteResultsStep(driverData?.quotePreference);
      if (quoteResult.success && quoteResult.data) {
        storedQuotes = quoteResult.data; // Override with detailed results
      }
      currentUrl = this.page.url();
    }

    // Step 11: Contact method (ContactMethod) - After quotes
    if (currentUrl.includes('/ContactMethod') || await this.page.$('#pgContactMethod')) {
      const contactResult = await this.handleContactMethodStep(driverData?.contactPreference || 'email');
      if (!contactResult.success) return contactResult;
      currentUrl = this.page.url();
    }

    // Step 12: Thank you page (final confirmation)
    if (currentUrl.includes('/ThankYou') || currentUrl.includes('/Complete') || await this.page.$('#pgThankYou')) {
      const thankYouResult = await this.handleThankYouStep();
      if (!thankYouResult.success) return thankYouResult;
      currentUrl = this.page.url();
    }

    // Return final result with stored quotes
    const finalResult = {
      success: true,
      message: 'Complete multi-step form automation finished successfully!',
      currentUrl: this.page.url(),
      step: 'all_steps_completed'
    };

    // Add stored quote data if available
    if (storedQuotes) {
      finalResult.quotes = storedQuotes;
      finalResult.message = 'Complete automation finished - insurance quotes retrieved!';
    }

    return finalResult;
  }

  // Handle vehicle lookup/prefill step
  async handleVehicleLookupStep(vehicleData) {
    try {
      logger.info('Handling vehicle lookup step...');

      // Wait for prefill page to load
      await this.page.waitForSelector('#pgPrefill', { timeout: 10000 });
      await this.humanDelay(2000);

      // Take screenshot of vehicle lookup page
      await this.takeScreenshot('vehicle_lookup_page');

      // Click "Enter Manually" since we want to specify vehicle details
      logger.info('Clicking "Enter Manually" button...');
      await this.page.click('#pgPrefillNo');
      await this.humanDelay(3000);

      // Handle VIN entry step
      return await this.handleVinEntryStep(vehicleData);

    } catch (error) {
      logger.error('Error in handleVehicleLookupStep', { error: error.message });
      await this.takeScreenshot('vehicle_lookup_error');

      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'vehicle_lookup_error'
      };
    }
  }

  // Handle VIN entry step
  async handleVinEntryStep(vehicleData) {
    try {
      logger.info('Handling VIN entry step...');

      // Wait for VIN entry page
      await this.page.waitForSelector('#pgVinEnty', { timeout: 10000 });
      await this.humanDelay(2000);

      await this.takeScreenshot('vin_entry_page');

      if (vehicleData && vehicleData.vin) {
        // If VIN is provided, enter it
        logger.info(`Entering VIN: ${vehicleData.vin}`);
        await this.clearAndType('#VehicleVIN', vehicleData.vin);
        await this.page.click('#pgVinEntryStart');
        await this.humanDelay(5000);

        // Check if VIN lookup was successful
        // If successful, it should proceed to next step
        // If failed, might show error or fallback to manual selection
      } else {
        // Click "Select My Vehicle" for manual entry
        logger.info('Clicking "Select My Vehicle" for manual entry...');
        await this.page.click('#pgVinEntyNo');
        await this.humanDelay(3000);
      }

      // Handle vehicle details form
      return await this.handleVehicleDetailsForm(vehicleData);

    } catch (error) {
      logger.error('Error in handleVinEntryStep', { error: error.message });
      await this.takeScreenshot('vin_entry_error');

      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'vin_entry_error'
      };
    }
  }

  // Handle vehicle details form (pg1)
  async handleVehicleDetailsForm(vehicleData) {
    try {
      logger.info('Handling vehicle details form...');

      // Wait for vehicle details page
      await this.page.waitForSelector('#pg1', { timeout: 10000 });
      await this.humanDelay(2000);

      await this.takeScreenshot('vehicle_details_page');

      if (!vehicleData) {
        throw new Error('Vehicle data is required for vehicle details form');
      }

      // Select vehicle year
      if (vehicleData.year) {
        logger.info(`Selecting vehicle year: ${vehicleData.year}`);
        await this.page.select('#VehicleYear', vehicleData.year.toString());
        await this.humanDelay(2000);

        // Wait for make dropdown to populate
        await this.waitForMakeDropdown();
      }

      // Select vehicle make
      if (vehicleData.make) {
        logger.info(`Selecting vehicle make: ${vehicleData.make}`);

        // Get all available make options
        const makeOptions = await this.page.evaluate(() => {
          const makeSelect = document.getElementById('VehicleMake');
          if (!makeSelect) return [];

          return Array.from(makeSelect.options).map(option => ({
            value: option.value,
            text: option.text.trim(),
            selected: option.selected
          }));
        });

        logger.info('Available make options:', makeOptions);

        // Try to find matching make option (case-insensitive, partial match)
        const targetMake = vehicleData.make.toLowerCase();
        let selectedMake = null;

        // Try exact match first
        selectedMake = makeOptions.find(option =>
          option.text.toLowerCase() === targetMake ||
          option.value.toLowerCase() === targetMake
        );

        // Try partial match if exact match fails
        if (!selectedMake) {
          selectedMake = makeOptions.find(option =>
            option.text.toLowerCase().includes(targetMake) ||
            targetMake.includes(option.text.toLowerCase())
          );
        }

        if (selectedMake) {
          logger.info(`Found matching make option: ${selectedMake.text} (value: ${selectedMake.value})`);
          await this.page.select('#VehicleMake', selectedMake.value);
          await this.humanDelay(3000);

          // Wait for model dropdown to populate
          await this.waitForModelDropdown();
        } else {
          logger.error(`No matching make found for "${vehicleData.make}". Available options:`, makeOptions.map(opt => opt.text));
          throw new Error(`Vehicle make "${vehicleData.make}" not found in dropdown options`);
        }
      }

      // Select vehicle model
      if (vehicleData.model) {
        logger.info(`Selecting vehicle model: ${vehicleData.model}`);

        // Get all available model options
        const modelOptions = await this.page.evaluate(() => {
          const modelSelect = document.getElementById('VehicleModel');
          if (!modelSelect) return [];

          return Array.from(modelSelect.options).map(option => ({
            value: option.value,
            text: option.text.trim(),
            selected: option.selected
          }));
        });

        logger.info('Available model options:', modelOptions);

        // Try to find matching model option (case-insensitive, partial match)
        const targetModel = vehicleData.model.toLowerCase();
        let selectedModel = null;

        // Try exact match first
        selectedModel = modelOptions.find(option =>
          option.text.toLowerCase() === targetModel ||
          option.value.toLowerCase() === targetModel
        );

        // Try partial match if exact match fails
        if (!selectedModel) {
          selectedModel = modelOptions.find(option =>
            option.text.toLowerCase().includes(targetModel) ||
            targetModel.includes(option.text.toLowerCase())
          );
        }

        if (selectedModel) {
          logger.info(`Found matching model option: ${selectedModel.text} (value: ${selectedModel.value})`);
          await this.page.select('#VehicleModel', selectedModel.value);
          await this.humanDelay(3000);
        } else {
          logger.error(`No matching model found for "${vehicleData.model}". Available options:`, modelOptions.map(opt => opt.text));
          throw new Error(`Vehicle model "${vehicleData.model}" not found in dropdown options`);
        }
      }

      // Wait for continue button to be enabled
      await this.waitForContinueButton();

      // Click continue
      logger.info('Clicking continue button...');
      await this.clickButton('#pg1btn', 'vehicle details continue button');

      await this.takeScreenshot('after_vehicle_submit');

      return {
        success: true,
        message: 'Vehicle details submitted successfully',
        currentUrl: this.page.url(),
        step: 'vehicle_details_completed',
        nextStep: 'vehicle_additional_details_or_driver_info'
      };

    } catch (error) {
      logger.error('Error in handleVehicleDetailsForm', { error: error.message });
      await this.takeScreenshot('vehicle_details_error');

      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'vehicle_details_error'
      };
    }
  }

  // Wait for make dropdown to be populated
  async waitForMakeDropdown() {
    try {
      logger.info('Waiting for make dropdown to populate...');

      // Wait for the make dropdown to have options (more than just the default)
      await this.page.waitForFunction(() => {
        const makeSelect = document.getElementById('VehicleMake');
        return makeSelect && makeSelect.options.length > 1;
      }, { timeout: 15000 });

      // Also wait for the panel to not be disabled
      await this.page.waitForFunction(() => {
        const makePanel = document.getElementById('VehMakePanel');
        return makePanel && !makePanel.classList.contains('disabled');
      }, { timeout: 15000 });

      logger.info('Make dropdown populated');
    } catch (error) {
      logger.warn('Timeout waiting for make dropdown', { error: error.message });
    }
  }

  // Wait for model dropdown to be populated
  async waitForModelDropdown() {
    try {
      logger.info('Waiting for model dropdown to populate...');

      await this.page.waitForFunction(() => {
        const modelSelect = document.getElementById('VehicleModel');
        return modelSelect && modelSelect.options.length > 1;
      }, { timeout: 15000 });

      await this.page.waitForFunction(() => {
        const modelPanel = document.getElementById('VehModelPanel');
        return modelPanel && !modelPanel.classList.contains('disabled');
      }, { timeout: 15000 });

      logger.info('Model dropdown populated');
    } catch (error) {
      logger.warn('Timeout waiting for model dropdown', { error: error.message });
    }
  }

  // Wait for continue button to be enabled
  async waitForContinueButton() {
    try {
      logger.info('Waiting for continue button to be enabled...');

      // Check current state first
      const buttonState = await this.page.evaluate(() => {
        const continueBtn = document.getElementById('pg1btn');
        const yearSelect = document.getElementById('VehicleYear');
        const makeSelect = document.getElementById('VehicleMake');
        const modelSelect = document.getElementById('VehicleModel');

        return {
          buttonExists: !!continueBtn,
          buttonDisabled: continueBtn ? continueBtn.disabled : true,
          yearSelected: yearSelect ? yearSelect.value : 'not found',
          makeSelected: makeSelect ? makeSelect.value : 'not found',
          makeOptions: makeSelect ? makeSelect.options.length : 0,
          modelSelected: modelSelect ? modelSelect.value : 'not found',
          modelOptions: modelSelect ? modelSelect.options.length : 0
        };
      });

      logger.info('Current form state:', buttonState);

      if (!buttonState.buttonExists) {
        throw new Error('Continue button not found');
      }

      if (!buttonState.buttonDisabled) {
        logger.info('Continue button is already enabled');
        return;
      }

      // Wait for the button to be enabled
      await this.page.waitForFunction(() => {
        const continueBtn = document.getElementById('pg1btn');
        return continueBtn && !continueBtn.disabled;
      }, { timeout: 20000 });

      logger.info('Continue button enabled');
    } catch (error) {
      // Get final state for debugging
      const finalState = await this.page.evaluate(() => {
        const continueBtn = document.getElementById('pg1btn');
        const yearSelect = document.getElementById('VehicleYear');
        const makeSelect = document.getElementById('VehicleMake');
        const modelSelect = document.getElementById('VehicleModel');

        return {
          buttonDisabled: continueBtn ? continueBtn.disabled : true,
          yearSelected: yearSelect ? yearSelect.value : 'not found',
          makeSelected: makeSelect ? makeSelect.value : 'not found',
          modelSelected: modelSelect ? modelSelect.value : 'not found',
          formValid: continueBtn ? !continueBtn.disabled : false
        };
      });

      logger.error('Continue button timeout - final state:', finalState);
      throw new Error(`Continue button did not become enabled. Final state: ${JSON.stringify(finalState)}`);
    }
  }

  async handlePopups() {
    // Handle access control popup
    const accessControl = await this.page.$('#getAccessControl');
    if (accessControl) {
      const isVisible = await this.page.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }, accessControl);

      if (isVisible) {
        logger.info('Handling access control popup...');
        await this.page.click('#AllowAccess');
        await this.humanDelay(2000);
      }
    }

    // Handle iOS warning
    const iosWarning = await this.page.$('#iOSWarining');
    if (iosWarning) {
      const isVisible = await this.page.evaluate(el => {
        return !el.classList.contains('iOSWarningHidden');
      }, iosWarning);

      if (isVisible) {
        logger.info('iOS warning detected');
      }
    }
  }

  async fillFormFields(userData) {
    logger.info('Filling form fields...');

    // Name fields
    await this.clearAndType('#FirstName', userData.firstName);
    await this.clearAndType('#LastName', userData.lastName);

    // Address fields
    await this.clearAndType('#InsuredAddress', userData.address);
    if (userData.apartment) {
      await this.clearAndType('#InsuredAddress2', userData.apartment);
    }
    await this.clearAndType('#InsuredCity', userData.city);

    // State selection
    const stateValue = StateMapper.codeToFullName(userData.state);
    logger.info(`Selecting state: ${userData.state} -> ${stateValue}`);
    await this.page.select('#InsuredState', stateValue);
    await this.humanDelay();

    // Contact information
    await this.clearAndType('#ZIPCode', userData.zipCode);
    await this.clearAndType('#EmailAddress', userData.email);
    await this.clearAndType('#Phone', userData.phone);

    // Optional fields
    if (userData.leadSource) {
      await this.page.select('#LeadSource', userData.leadSource);
      await this.humanDelay();
    }

    if (userData.timeAtResidence) {
      await this.page.select('#TimeAtResidence', userData.timeAtResidence);
      await this.humanDelay();
    }
  }

  async clearAndType(selector, text) {
    await this.page.evaluate((sel) => document.querySelector(sel).value = '', selector);
    await this.page.type(selector, text, { delay: 100 });
    await this.humanDelay();
  }

  // Robust button clicking helper
  async clickButton(selector, description = 'button') {
    try {
      logger.info(`Attempting to click ${description}: ${selector}`);

      // Wait for element to exist
      await this.page.waitForSelector(selector, { timeout: 10000 });

      // Check if element is visible and enabled
      const elementInfo = await this.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (!element) return { exists: false };

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          exists: true,
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          enabled: !element.disabled,
          inViewport: rect.top >= 0 && rect.left >= 0 &&
                     rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          tagName: element.tagName,
          type: element.type,
          value: element.value
        };
      }, selector);

      logger.info(`Element info for ${selector}:`, elementInfo);

      if (!elementInfo.exists) {
        throw new Error(`Element ${selector} does not exist`);
      }

      if (!elementInfo.visible) {
        throw new Error(`Element ${selector} is not visible`);
      }

      if (!elementInfo.enabled) {
        throw new Error(`Element ${selector} is disabled`);
      }

      // Scroll element into view if needed
      if (!elementInfo.inViewport) {
        logger.info(`Scrolling ${selector} into view`);
        await this.page.evaluate((sel) => {
          document.querySelector(sel).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, selector);
        await this.humanDelay(1000);
      }

      // Try multiple clicking approaches
      const clickMethods = [
        // Method 1: Standard click
        async () => {
          await this.page.click(selector);
          return 'standard_click';
        },
        // Method 2: Force click with evaluate
        async () => {
          await this.page.evaluate((sel) => {
            document.querySelector(sel).click();
          }, selector);
          return 'evaluate_click';
        },
        // Method 3: Mouse click at coordinates
        async () => {
          const element = await this.page.$(selector);
          const box = await element.boundingBox();
          await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          return 'mouse_click';
        },
        // Method 4: Submit if it's a form button
        async () => {
          if (elementInfo.type === 'submit') {
            await this.page.evaluate((sel) => {
              const element = document.querySelector(sel);
              if (element.form) {
                element.form.submit();
              } else {
                element.click();
              }
            }, selector);
            return 'form_submit';
          }
          throw new Error('Not a submit button');
        }
      ];

      let lastError;
      for (let i = 0; i < clickMethods.length; i++) {
        try {
          const method = await clickMethods[i]();
          logger.info(`Successfully clicked ${selector} using ${method}`);
          await this.humanDelay(2000);
          return true;
        } catch (error) {
          lastError = error;
          logger.warn(`Click method ${i + 1} failed for ${selector}: ${error.message}`);
          await this.humanDelay(500);
        }
      }

      throw new Error(`All click methods failed for ${selector}. Last error: ${lastError.message}`);

    } catch (error) {
      logger.error(`Failed to click ${description} (${selector}): ${error.message}`);
      throw error;
    }
  }

  async handleAgreementCheckbox() {
    const checkboxChecked = await this.page.$eval('#verifyDisclosure', el => el.checked);
    if (!checkboxChecked) {
      logger.info('Checking agreement checkbox...');

      // Scroll checkbox into view
      await this.page.evaluate(() => {
        const checkbox = document.getElementById('verifyDisclosure');
        if (checkbox) {
          checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      await this.humanDelay();

      // Try multiple approaches to check the checkbox
      const checkboxClicked = await this.page.evaluate(() => {
        const checkbox = document.getElementById('verifyDisclosure');
        if (!checkbox) return false;

        try {
          // Method 1: Direct click
          checkbox.click();
          return checkbox.checked;
        } catch (e1) {
          try {
            // Method 2: Click on label
            const label = document.querySelector('label[for="verifyDisclosure"]');
            if (label) {
              label.click();
              return checkbox.checked;
            }
          } catch (e2) {
            try {
              // Method 3: Click on checkmark span
              const checkmark = label ? label.querySelector('.checkmark') : null;
              if (checkmark) {
                checkmark.click();
                return checkbox.checked;
              }
            } catch (e3) {
              // Method 4: Programmatically set
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              return checkbox.checked;
            }
          }
        }
        return false;
      });

      if (checkboxClicked) {
        logger.info('Checkbox successfully checked');
      } else {
        logger.warn('Could not check agreement checkbox');
        await this.takeScreenshot('checkbox_debug');
      }
    }
  }

  async submitForm() {
    logger.info('Submitting form...');

    // Take screenshot before submitting
    await this.takeScreenshot('before_submit');

    // Submit form
    const submitButton = await this.page.$('#pg0btn');
    if (!submitButton) {
      throw new Error('Submit button not found');
    }

    const isDisabled = await this.page.$eval('#pg0btn', btn => btn.disabled);
    if (isDisabled) {
      throw new Error('Submit button is disabled - form validation failed');
    }

    await this.humanDelay(3000);
    await this.clickButton('#pg0btn', 'form submit button');

    await this.humanDelay(3000);

    // Analyze results
    return await this.analyzeSubmissionResult();
  }

  async analyzeSubmissionResult() {
    const currentUrl = this.page.url();
    logger.info(`Current URL after submit: ${currentUrl}`);

    await this.takeScreenshot('after_submit');

    // Check for errors
    const errorElements = await this.page.$$('.errMsg');
    const visibleErrors = [];

    for (const element of errorElements) {
      const isVisible = await this.page.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               el.offsetParent !== null &&
               el.textContent.trim() !== '';
      }, element);

      if (isVisible) {
        const errorText = await this.page.evaluate(el => el.textContent.trim(), element);
        if (errorText) {
          visibleErrors.push(errorText);
        }
      }
    }

    if (visibleErrors.length > 0) {
      logger.warn('Form validation errors found', visibleErrors);
      return {
        success: false,
        errors: visibleErrors,
        currentUrl,
        step: 'step1_validation_failed'
      };
    }

    // Check if moved to next step
    const nextStepElements = ['#pgPrefill', '#pg1', '#pgVinEnty'];

    for (const selector of nextStepElements) {
      const element = await this.page.$(selector);
      if (element) {
        const isVisible = await this.page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none';
        }, element);

        if (isVisible) {
          logger.info(`Successfully moved to next step: ${selector}`);
          return {
            success: true,
            message: 'Step 1 completed successfully - moved to vehicle selection',
            currentUrl,
            nextStep: 'vehicle_selection',
            step: 'step1_completed'
          };
        }
      }
    }

    // Check for address validation
    const addressValidation = await this.page.$('#addressConfirmsection');
    if (addressValidation) {
      const isVisible = await this.page.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none';
      }, addressValidation);

      if (isVisible) {
        logger.info('Address validation screen detected');

        try {
          // Wait for the address validation buttons to be ready
          await this.humanDelay(2000);

          // Look for Continue buttons in the address validation section
          const continueButtons = await this.page.$$('input[value="Continue"]');

          if (continueButtons.length > 0) {
            logger.info(`Found ${continueButtons.length} Continue buttons`);
            // Click the first Continue button (usually the suggested address)
            await continueButtons[0].click();
            await this.humanDelay(3000);

            logger.info('Address validation handled with Continue button');
          } else {
            // Fallback: look for other possible button selectors
            const possibleSelectors = [
              '#useSuggestedAddress',
              'button[type="submit"]',
              '.pageButton',
              '#pg0btn'
            ];

            let buttonClicked = false;
            for (const selector of possibleSelectors) {
              const button = await this.page.$(selector);
              if (button) {
                try {
                  await button.click();
                  await this.humanDelay(3000);
                  logger.info(`Address validation handled with ${selector}`);
                  buttonClicked = true;
                  break;
                } catch (e) {
                  logger.warn(`Failed to click ${selector}: ${e.message}`);
                }
              }
            }

            if (!buttonClicked) {
              logger.warn('No clickable button found for address validation');
            }
          }
        } catch (error) {
          logger.error('Error handling address validation', { error: error.message });
        }

        return {
          success: true,
          message: 'Address validation handled',
          currentUrl: this.page.url(),
          step: 'address_validation_completed'
        };
      }
    }

    // Default response
    const pageContent = await this.page.content();
    const hasFormElements = pageContent.includes('FirstName') && pageContent.includes('residence');

    return {
      success: !hasFormElements,
      message: hasFormElements ? 'Form submitted but still on same page' : 'Form submitted successfully',
      currentUrl,
      step: hasFormElements ? 'step1_uncertain' : 'step1_submitted',
      debug: {
        contentLength: pageContent.length,
        hasFormElements
      }
    };
  }

  async takeScreenshot(name) {
    try {
      // Ensure directory exists before taking screenshot
      this.ensureDirectories();

      const screenshotPath = path.join(this.screenshotDir, `${name}_${Date.now()}.png`);
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: false,
        clip: { x: 0, y: 0, width: 1366, height: 768 }
      });
      logger.info(`Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      logger.warn('Could not take screenshot', {
        error: error.message,
        screenshotDir: this.screenshotDir,
        name: name
      });
      return null;
    }
  }

  async humanDelay(ms = null) {
    const delay = ms || (Math.random() * 400 + 100);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }

  // Handle vehicle usage step (pg2)
  async handleVehicleUsageStep(vehicleData = {}) {
    try {
      logger.info('Handling vehicle usage step (pg2)...');
      await this.page.waitForSelector('#pg2', { timeout: 10000 });
      await this.takeScreenshot('vehicle_usage_page');

      // Vehicle Usage (required)
      if (vehicleData.usage) {
        logger.info(`Selecting vehicle usage: ${vehicleData.usage}`);
        await this.page.select('#vehUsage', vehicleData.usage);
        await this.humanDelay(2000);
      }

      // Ownership (conditional - may be hidden)
      const ownershipVisible = await this.page.$eval('#vehOwnershipPan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (ownershipVisible && vehicleData.ownership) {
        logger.info(`Selecting vehicle ownership: ${vehicleData.ownership}`);
        await this.page.select('#vehOwnership', vehicleData.ownership);
        await this.humanDelay(2000);
      }

      // Garaged (conditional - may be hidden)
      const garagedVisible = await this.page.$eval('#GaragedPan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (garagedVisible && vehicleData.garaged) {
        logger.info(`Selecting garaged option: ${vehicleData.garaged}`);
        await this.page.select('#Garaged', vehicleData.garaged);
        await this.humanDelay(2000);

        // Handle garaging address if needed
        if (vehicleData.garaged !== '0' && vehicleData.garagingAddress) {
          await this.handleGaragingAddress(vehicleData.garagingAddress);
        }
      }

      // Length of ownership (conditional)
      const lengthVisible = await this.page.$eval('#vehLenOfOwnershipPan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (lengthVisible && vehicleData.lengthOfOwnership) {
        logger.info(`Selecting length of ownership: ${vehicleData.lengthOfOwnership}`);
        await this.page.select('#vehLenOfOwnership', vehicleData.lengthOfOwnership);
        await this.humanDelay(2000);
      }

      await this.takeScreenshot('vehicle_usage_filled');

      // Click continue
      logger.info('Clicking continue button for vehicle usage...');
      await this.clickButton('#pg2btn', 'vehicle usage continue button');

      return {
        success: true,
        message: 'Vehicle usage step completed',
        currentUrl: this.page.url(),
        step: 'vehicle_usage_completed'
      };

    } catch (error) {
      logger.error('Error in handleVehicleUsageStep', { error: error.message });
      await this.takeScreenshot('vehicle_usage_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'vehicle_usage_error'
      };
    }
  }

  // Handle garaging address dialog
  async handleGaragingAddress(garagingAddress) {
    try {
      // Wait for garaging dialog to appear
      await this.page.waitForSelector('#garagingAddressPan', { visible: true, timeout: 5000 });

      if (garagingAddress.zipCode) {
        await this.page.type('#GaragingZipCode', garagingAddress.zipCode);
        await this.humanDelay();
      }

      if (garagingAddress.state) {
        await this.page.select('#GaragingState', garagingAddress.state);
        await this.humanDelay(2000);
      }

      if (garagingAddress.address) {
        await this.page.type('#GaragingAddress', garagingAddress.address);
        await this.humanDelay();
      }

      // Click continue in garaging dialog
      await this.page.click('#GarZipBtn');
      await this.humanDelay(2000);

    } catch (error) {
      logger.warn('Error handling garaging address', { error: error.message });
    }
  }

  // Handle vehicle list step (pg3)
  async handleVehicleListStep() {
    try {
      logger.info('Handling vehicle list step (pg3)...');
      await this.page.waitForSelector('#pg3', { timeout: 10000 });
      await this.takeScreenshot('vehicle_list_page');

      // Check if there are vehicles in the list
      const vehicleCount = await this.page.$eval('#carCount', el => el.value).catch(() => '0');
      logger.info(`Found ${vehicleCount} vehicles in garage`);

      // For now, just continue with existing vehicles
      // TODO: Add logic to add/edit/remove vehicles as needed

      // Click continue
      logger.info('Clicking continue button for vehicle list...');
      await this.clickButton('#pg3btn', 'vehicle list continue button');

      return {
        success: true,
        message: 'Vehicle list step completed',
        currentUrl: this.page.url(),
        step: 'vehicle_list_completed'
      };

    } catch (error) {
      logger.error('Error in handleVehicleListStep', { error: error.message });
      await this.takeScreenshot('vehicle_list_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'vehicle_list_error'
      };
    }
  }

  // Handle driver information step (pg4)
  async handleDriverInformationStep(driverData = {}) {
    try {
      logger.info('Handling driver information step (pg4)...');
      await this.page.waitForSelector('#pg4', { timeout: 10000 });
      await this.takeScreenshot('driver_info_page');

      // Driver name
      if (driverData.firstName) {
        await this.clearAndType('#drvFirstName', driverData.firstName);
      }
      if (driverData.lastName) {
        await this.clearAndType('#drvLastName', driverData.lastName);
      }

      // Driver details - improved handling for DOB
      if (driverData.dateOfBirth) {
        logger.info(`Setting date of birth: ${driverData.dateOfBirth}`);

        // Enhanced DOB handling with multiple approaches
        try {
          // First, check if the field exists and is visible
          const dobExists = await this.page.$('#drvDOB');
          if (!dobExists) {
            logger.warn('DOB field #drvDOB not found');
          } else {
            // Clear field first
            await this.page.evaluate((selector) => {
              const element = document.querySelector(selector);
              if (element) {
                element.value = '';
                element.focus();
              }
            }, '#drvDOB');

            await this.humanDelay(500);

            // Method 1: Try typing character by character (works better for date fields)
            try {
              await this.page.focus('#drvDOB');
              await this.page.keyboard.type(driverData.dateOfBirth, { delay: 150 });
              logger.info('DOB entered successfully using keyboard typing');
            } catch (typeError) {
              logger.warn('Keyboard typing failed, trying direct value setting');

              // Method 2: Direct value setting with multiple events
              await this.page.evaluate((selector, value) => {
                const element = document.querySelector(selector);
                if (element) {
                  element.value = value;
                  element.focus();

                  // Trigger multiple events to ensure form validation
                  const events = ['input', 'change', 'blur', 'keyup'];
                  events.forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, { bubbles: true }));
                  });

                  // Also trigger date-specific events
                  element.dispatchEvent(new Event('datechange', { bubbles: true }));
                }
              }, '#drvDOB', driverData.dateOfBirth);

              logger.info('DOB set using direct value setting with events');
            }

            // Verify the value was set
            const dobValue = await this.page.$eval('#drvDOB', el => el.value);
            logger.info(`DOB field value after setting: "${dobValue}"`);

            if (!dobValue || dobValue.trim() === '') {
              logger.error('DOB field is still empty after setting value');
            }
          }
        } catch (error) {
          logger.error('Error setting DOB field', { error: error.message });
        }

        await this.humanDelay(1500);
      }

      if (driverData.gender) {
        logger.info(`Setting gender: ${driverData.gender}`);
        await this.page.select('#drvGender', driverData.gender);
        await this.humanDelay(1500);
      }

      if (driverData.maritalStatus) {
        logger.info(`Setting marital status: ${driverData.maritalStatus}`);
        // Try different approaches for marital status
        try {
          await this.page.select('#drvMarital', driverData.maritalStatus);
        } catch (error) {
          logger.warn('Failed with select, trying click approach for marital status');
          // Try clicking on the specific option
          const optionSelector = `#drvMarital option[value="${driverData.maritalStatus}"]`;
          const optionExists = await this.page.$(optionSelector);
          if (optionExists) {
            await this.page.evaluate((selector, value) => {
              const select = document.querySelector(selector);
              if (select) {
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, '#drvMarital', driverData.maritalStatus);
          }
        }
        await this.humanDelay(1500);
      }

      // License details
      if (driverData.licenseOrigin) {
        await this.page.select('#licOrigin', driverData.licenseOrigin);
        await this.humanDelay(2000);
      }

      if (driverData.licenseState) {
        await this.page.select('#licState', driverData.licenseState);
        await this.humanDelay();
      }

      if (driverData.licenseStatus) {
        await this.page.select('#licStatus', driverData.licenseStatus);
        await this.humanDelay();
      }

      if (driverData.licenseNumber) {
        await this.clearAndType('#licNumber', driverData.licenseNumber);
      }

      // SR-22 requirement
      if (driverData.sr22 !== undefined) {
        await this.page.select('#licSR22', driverData.sr22 ? 'Yes' : 'No');
        await this.humanDelay();
      }

      // Violations and accidents
      if (driverData.hasViolations !== undefined) {
        await this.page.select('#licViolations', driverData.hasViolations ? 'Yes' : 'No');
        await this.humanDelay();
      }

      await this.takeScreenshot('driver_info_filled');

      // Click continue
      logger.info('Clicking continue button for driver information...');
      await this.clickButton('#pg4btn', 'driver information continue button');

      return {
        success: true,
        message: 'Driver information step completed',
        currentUrl: this.page.url(),
        step: 'driver_info_completed'
      };

    } catch (error) {
      logger.error('Error in handleDriverInformationStep', { error: error.message });
      await this.takeScreenshot('driver_info_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'driver_info_error'
      };
    }
  }

  // Handle driver list step (pg5)
  async handleDriverListStep() {
    try {
      logger.info('Handling driver list step (pg5)...');
      await this.page.waitForSelector('#pg5', { timeout: 10000 });
      await this.takeScreenshot('driver_list_page');

      // Check if there are drivers in the list
      const driverElements = await this.page.$$('.inputPanel .panelTitle').catch(() => []);
      logger.info(`Found ${driverElements.length - 1} drivers in list (excluding "Add Another")`);

      // For now, just continue with existing drivers
      // TODO: Add logic to add/edit/remove drivers as needed

      // Click continue
      logger.info('Clicking continue button for driver list...');
      await this.clickButton('#pg5btn', 'driver list continue button');

      return {
        success: true,
        message: 'Driver list step completed',
        currentUrl: this.page.url(),
        step: 'driver_list_completed'
      };

    } catch (error) {
      logger.error('Error in handleDriverListStep', { error: error.message });
      await this.takeScreenshot('driver_list_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'driver_list_error'
      };
    }
  }

  // Handle policy information step (pg6)
  async handlePolicyInformationStep(policyInfo = {}) {
    try {
      logger.info('Handling policy information step (pg6)...');
      await this.page.waitForSelector('#pg6', { timeout: 10000 });
      await this.takeScreenshot('policy_info_page');

      // Current insurance status
      const currentlyInsuredVisible = await this.page.$eval('#InsuredPan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (currentlyInsuredVisible && policyInfo.currentlyInsured !== undefined) {
        logger.info(`Selecting currently insured: ${policyInfo.currentlyInsured ? 'Yes' : 'No'}`);
        await this.page.select('#Insured', policyInfo.currentlyInsured ? 'Yes' : 'No');
        await this.humanDelay(2000);

        if (policyInfo.currentlyInsured) {
          // Handle prior insurance details
          if (policyInfo.priorCarrier) {
            await this.page.select('#PriorCarrier', policyInfo.priorCarrier);
            await this.humanDelay();
          }

          if (policyInfo.priorInsuranceYears !== undefined) {
            await this.page.type('#PriorInsYears', policyInfo.priorInsuranceYears.toString());
            await this.humanDelay();
          }

          if (policyInfo.priorInsuranceMonths !== undefined) {
            await this.page.type('#PriorInsMonths', policyInfo.priorInsuranceMonths.toString());
            await this.humanDelay();
          }

          if (policyInfo.priorInsuranceExpiry) {
            await this.page.type('#PriorInsExpiry', policyInfo.priorInsuranceExpiry);
            await this.humanDelay();
          }

          if (policyInfo.priorMonthlyPayment !== undefined) {
            await this.page.type('#PriorMonthlyPayment', policyInfo.priorMonthlyPayment.toString());
            await this.humanDelay();
          }
        } else if (policyInfo.reasonNoInsurance) {
          // Handle reason for no insurance
          await this.page.select('#ReasonNoInsurance', policyInfo.reasonNoInsurance);
          await this.humanDelay();
        }
      }

      // Policy start date (required)
      if (policyInfo.startDate) {
        await this.clearAndType('#startDate', policyInfo.startDate);
      }

      await this.takeScreenshot('policy_info_filled');

      // Click continue
      logger.info('Clicking continue button for policy information...');
      await this.clickButton('#pg6btn', 'policy information continue button');

      return {
        success: true,
        message: 'Policy information step completed',
        currentUrl: this.page.url(),
        step: 'policy_info_completed'
      };

    } catch (error) {
      logger.error('Error in handlePolicyInformationStep', { error: error.message });
      await this.takeScreenshot('policy_info_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'policy_info_error'
      };
    }
  }

  // Handle coverage options step (pg7)
  async handleCoverageOptionsStep(coveragePreference = 'Standard') {
    try {
      logger.info('Handling coverage options step (pg7)...');
      await this.page.waitForSelector('#pg7', { timeout: 10000 });
      await this.takeScreenshot('coverage_options_page');

      // Select coverage package (Basic, Standard/Enhanced, or Optimal/Premium)
      const coverageMap = {
        'Basic': 'Basic',
        'Standard': 'Standard',
        'Enhanced': 'Standard',
        'Premium': 'Optimal',
        'Optimal': 'Optimal'
      };

      const selectedCoverage = coverageMap[coveragePreference] || 'Standard';
      logger.info(`Selecting coverage package: ${selectedCoverage}`);

      // Click the select button for the chosen package
      const packageSelector = `[data-pkg="${selectedCoverage}"]`;
      await this.page.waitForSelector(packageSelector, { timeout: 5000 });
      await this.page.click(packageSelector);
      await this.humanDelay(3000);

      await this.takeScreenshot('coverage_selected');

      // The page might automatically continue or require additional action
      // Check if we're still on the same page or moved forward
      const currentUrl = this.page.url();
      if (currentUrl.includes('/CoverageOptions')) {
        // Still on coverage page, might need to continue manually
        const continueButton = await this.page.$('#pg7btn').catch(() => null);
        if (continueButton) {
          await this.clickButton('#pg7btn', 'coverage options continue button');
        }
      }

      return {
        success: true,
        message: 'Coverage options step completed',
        currentUrl: this.page.url(),
        step: 'coverage_options_completed'
      };

    } catch (error) {
      logger.error('Error in handleCoverageOptionsStep', { error: error.message });
      await this.takeScreenshot('coverage_options_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'coverage_options_error'
      };
    }
  }

  // Handle property info step (pg8)
  async handlePropertyInfoStep(propertyInfo = {}) {
    try {
      logger.info('Handling property info step (pg8)...');
      await this.page.waitForSelector('#pg8', { timeout: 10000 });
      await this.takeScreenshot('property_info_page');

      // Property quote preference (required)
      const wantPropertyQuote = propertyInfo.wantPropertyQuote !== undefined ?
        (propertyInfo.wantPropertyQuote ? 'Y' : 'N') : 'N';

      logger.info(`Selecting property quote preference: ${wantPropertyQuote}`);
      await this.page.select('#PropQuote', wantPropertyQuote);
      await this.humanDelay(2000);

      // Residence status (conditional)
      const residenceStatusVisible = await this.page.$eval('#ResidenceStatusPan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (residenceStatusVisible && propertyInfo.residenceStatus) {
        logger.info(`Selecting residence status: ${propertyInfo.residenceStatus}`);
        await this.page.select('#ResidenceStatus', propertyInfo.residenceStatus);
        await this.humanDelay(2000);
      }

      // Residence type (conditional)
      const residenceTypeVisible = await this.page.$eval('#SelectedResidenceTypePan', el =>
        el.style.display !== 'none'
      ).catch(() => false);

      if (residenceTypeVisible && propertyInfo.residenceType) {
        logger.info(`Selecting residence type: ${propertyInfo.residenceType}`);
        await this.page.select('#ResidenceType', propertyInfo.residenceType);
        await this.humanDelay(2000);
      }

      await this.takeScreenshot('property_info_filled');

      // Click continue
      logger.info('Clicking continue button for property information...');
      await this.clickButton('#pg8btn', 'property information continue button');

      return {
        success: true,
        message: 'Property information step completed',
        currentUrl: this.page.url(),
        step: 'property_info_completed'
      };

    } catch (error) {
      logger.error('Error in handlePropertyInfoStep', { error: error.message });
      await this.takeScreenshot('property_info_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'property_info_error'
      };
    }
  }

  // Handle contact method step (ContactMethod)
  async handleContactMethodStep(contactPreference = 'email') {
    try {
      logger.info('Handling contact method step...');

      // Check if we're already on the contact method page
      const currentUrl = this.page.url();
      logger.info(`Current URL: ${currentUrl}`);

      // Wait for the contact method page to load (more flexible selectors)
      try {
        await this.page.waitForSelector('#pgContactMethod', { timeout: 5000 });
      } catch (error) {
        logger.warn('pgContactMethod selector not found, trying alternative selectors');
        // Try alternative selectors
        await this.page.waitForSelector('body', { timeout: 5000 });
      }

      await this.takeScreenshot('contact_method_page');
      await this.humanDelay(2000);

      logger.info('Contact method page loaded - analyzing page structure');

      // Get all clickable elements on the page
      const allClickableElements = await this.page.evaluate(() => {
        const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [onclick], .btn, [class*="button"]');
        return Array.from(clickables).map((el, index) => ({
          index,
          tagName: el.tagName,
          type: el.type || '',
          id: el.id || '',
          className: el.className || '',
          textContent: (el.textContent || '').trim(),
          value: el.value || '',
          href: el.href || '',
          onclick: el.onclick ? 'has onclick' : '',
          visible: el.offsetParent !== null
        })).filter(el => el.visible); // Only visible elements
      });

      logger.info(`Found ${allClickableElements.length} clickable elements:`, allClickableElements);

      // Try multiple selector approaches based on the actual page structure
      let buttonClicked = false;

      // Determine preference - email is default
      const isPhonePreference = contactPreference.toLowerCase() === 'phone' || contactPreference.toLowerCase() === 'call';
      logger.info(`Contact preference: ${contactPreference} (phone: ${isPhonePreference})`);

      // Strategy 1: Look for buttons with specific text/patterns
      const preferredButtons = allClickableElements.filter(el => {
        const text = (el.textContent + ' ' + el.value + ' ' + el.className + ' ' + el.id).toLowerCase();
        if (isPhonePreference) {
          return text.includes('phone') || text.includes('call') || text.includes('contact') && text.includes('phone');
        } else {
          return text.includes('email') || text.includes('mail') || text.includes('contact') && text.includes('email');
        }
      });

      if (preferredButtons.length > 0) {
        logger.info(`Found ${preferredButtons.length} buttons matching preference:`, preferredButtons);
        await this.page.evaluate((index) => {
          const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [onclick], .btn, [class*="button"]');
          const visibleClickables = Array.from(clickables).filter(el => el.offsetParent !== null);
          if (visibleClickables[index]) {
            visibleClickables[index].click();
          }
        }, preferredButtons[0].index);
        buttonClicked = true;
        await this.humanDelay(3000);
      }

      // Strategy 2: If no specific preference buttons found, try positional clicking
      if (!buttonClicked && allClickableElements.length >= 2) {
        logger.info('No preference-specific buttons found, trying positional approach');
        // Typically: first button = phone, second = email
        const targetIndex = isPhonePreference ? 0 : 1;
        logger.info(`Clicking button at index ${targetIndex} for ${contactPreference} preference`);

        await this.page.evaluate((index) => {
          const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [onclick], .btn, [class*="button"]');
          const visibleClickables = Array.from(clickables).filter(el => el.offsetParent !== null);
          if (visibleClickables[index]) {
            visibleClickables[index].click();
          }
        }, targetIndex);

        buttonClicked = true;
        await this.humanDelay(3000);
      }

      // Strategy 3: If only one button, click it
      if (!buttonClicked && allClickableElements.length === 1) {
        logger.info('Found 1 clickable element, clicking it');
        await this.page.evaluate(() => {
          const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [onclick], .btn, [class*="button"]');
          const visibleClickables = Array.from(clickables).filter(el => el.offsetParent !== null);
          if (visibleClickables[0]) {
            visibleClickables[0].click();
          }
        });
        buttonClicked = true;
        await this.humanDelay(3000);
      }

      // Strategy 4: Click any clickable element if nothing else worked
      if (!buttonClicked && allClickableElements.length > 0) {
        logger.info('No specific buttons found, clicking first available clickable element');
        await this.page.evaluate(() => {
          const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a, [onclick], .btn, [class*="button"]');
          const visibleClickables = Array.from(clickables).filter(el => el.offsetParent !== null);
          if (visibleClickables[0]) {
            visibleClickables[0].click();
          }
        });
        buttonClicked = true;
        await this.humanDelay(3000);
      }

      // Log result
      if (buttonClicked) {
        logger.info('Successfully clicked an element in contact method step');

        // Wait for page to potentially change after contact method selection
        await this.humanDelay(3000);

        // Check if we moved to thank you or final page
        const finalUrl = this.page.url();
        logger.info(`URL after contact method selection: ${finalUrl}`);

        return {
          success: true,
          message: 'Contact method step completed successfully',
          currentUrl: finalUrl,
          step: 'contact_method_completed'
        };
      } else {
        logger.warn('No clickable elements found in contact method step');
        return {
          success: false,
          message: 'Could not find any clickable elements in contact method step',
          currentUrl: this.page.url(),
          step: 'contact_method_failed'
        };
      }

    } catch (error) {
      logger.error('Error in handleContactMethodStep', { error: error.message });
      await this.takeScreenshot('contact_method_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'contact_method_error'
      };
    }
  }

  // Extract quotes from current page (flexible method)
  async extractQuotesFromCurrentPage() {
    try {
      logger.info('Attempting to extract quotes from current page...');
      await this.takeScreenshot('quote_extraction_attempt');

      // Wait a bit for any dynamic content to load
      await this.humanDelay(3000);

      // Try multiple quote selectors that might be on the page
      const quotes = await this.page.evaluate(() => {
        const quoteSelectors = [
          '.resultsPanel',
          '.quote-panel',
          '.insurance-quote',
          '.quote-result',
          '[class*="quote"]',
          '[class*="result"]',
          '[class*="price"]',
          '.dollar',
          '[data-quote]',
          '.quote',
          '.carrier'
        ];

        let foundQuotes = [];

        // Try each selector
        for (const selector of quoteSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((element, index) => {
              // Extract price information
              const priceElement = element.querySelector('.dollar') ||
                                 element.querySelector('[class*="price"]') ||
                                 element.querySelector('[class*="amount"]') ||
                                 element;

              const termElement = element.querySelector('.term') ||
                                element.querySelector('[class*="term"]') ||
                                element.querySelector('[class*="month"]');

              const carrierElement = element.querySelector('.carrier') ||
                                   element.querySelector('[class*="carrier"]') ||
                                   element.querySelector('[class*="company"]');

              const priceText = priceElement ? priceElement.textContent.trim() : '';
              const termText = termElement ? termElement.textContent.trim() : '';
              const carrierText = carrierElement ? carrierElement.textContent.trim() : '';

              // If we found any price-like text, consider it a quote
              if (priceText && (priceText.includes('$') || /\d+/.test(priceText))) {
                foundQuotes.push({
                  index,
                  selector,
                  price: priceText,
                  term: termText,
                  carrier: carrierText,
                  element: element.outerHTML.substring(0, 200) + '...' // First 200 chars for debugging
                });
              }
            });

            // If we found quotes with this selector, stop looking
            if (foundQuotes.length > 0) break;
          }
        }

        // Look for premium prices (usually smaller amounts, not coverage limits)
        if (foundQuotes.length === 0) {
          const bodyText = document.body.textContent;
          const priceMatches = bodyText.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);

          if (priceMatches && priceMatches.length > 0) {
            // Filter for likely premium prices (under $2000 - typical monthly/6-month premiums)
            const premiumPrices = priceMatches.filter(price => {
              const numericValue = parseFloat(price.replace(/[$,]/g, ''));
              return numericValue > 50 && numericValue < 2000; // Typical premium range
            });

            // If we found premium-like prices, use those
            if (premiumPrices.length > 0) {
              premiumPrices.forEach((price, index) => {
                foundQuotes.push({
                  index,
                  selector: 'premium-search',
                  price: price,
                  term: 'likely premium',
                  carrier: 'unknown',
                  element: 'Found premium-like price in page text'
                });
              });
            } else {
              // Otherwise use all prices but mark as potential coverage amounts
              priceMatches.slice(0, 10).forEach((price, index) => { // Limit to first 10
                const numericValue = parseFloat(price.replace(/[$,]/g, ''));
                const priceType = numericValue > 10000 ? 'likely coverage limit' : 'potential premium';

                foundQuotes.push({
                  index,
                  selector: 'text-search',
                  price: price,
                  term: priceType,
                  carrier: 'unknown',
                  element: 'Found in page text'
                });
              });
            }
          }
        }

        return foundQuotes;
      });

      logger.info(`Quote extraction found ${quotes.length} potential quotes:`, quotes);

      if (quotes.length > 0) {
        return {
          quotesFound: quotes.length,
          quotes: quotes.map(q => ({
            index: q.index,
            price: q.price,
            term: q.term,
            carrier: q.carrier,
            available: true
          })),
          extractionMethod: quotes[0].selector,
          currentUrl: this.page.url()
        };
      }

      return null;

    } catch (error) {
      logger.error('Error in extractQuotesFromCurrentPage', { error: error.message });
      return null;
    }
  }

  // Handle quote results step (pgResults) - Extract quotes and continue
  async handleQuoteResultsStep(quotePreference = {}) {
    try {
      logger.info('Handling quote results step (pgResults)...');
      await this.page.waitForSelector('#pgResults', { timeout: 15000 });

      // Wait for quotes to load (they come from another API)
      logger.info('Waiting for quotes to load from external API...');
      await this.page.waitForFunction(() => {
        const quotes = document.querySelectorAll('.resultsPanel');
        return quotes.length > 0;
      }, { timeout: 30000 });

      await this.takeScreenshot('quote_results_page');

      // Extract quote information
      const quotes = await this.page.evaluate(() => {
        const quoteElements = document.querySelectorAll('.resultsPanel');
        return Array.from(quoteElements).map((quote, index) => {
          const priceElement = quote.querySelector('.dollar');
          const termElement = quote.querySelector('.term');
          const coverageDetails = Array.from(quote.querySelectorAll('.resultDetails li')).map(li => {
            const title = li.querySelector('.covTitle')?.textContent?.trim();
            const value = li.querySelector('span:last-child')?.textContent?.trim();
            return { title, value };
          });

          return {
            index,
            price: priceElement?.textContent?.trim(),
            term: termElement?.textContent?.trim(),
            coverageDetails,
            available: true
          };
        });
      });

      logger.info(`Found ${quotes.length} insurance quotes`, { quotes: quotes.map(q => ({ price: q.price, term: q.term })) });

      // Sort quotes if preference specified
      if (quotePreference.sortBy) {
        const sortOptions = {
          'price': 'TotalPremium',
          'downPayment': 'DownPayment',
          'monthly': 'PaymentAmount'
        };

        const sortValue = sortOptions[quotePreference.sortBy];
        if (sortValue) {
          logger.info(`Sorting quotes by: ${sortValue}`);
          await this.page.select('#ComparisonSortList', sortValue);
          await this.humanDelay(3000);
          await this.takeScreenshot('quotes_sorted');
        }
      }

      // Select a quote if preference specified
      if (quotePreference.selectQuote !== undefined) {
        const quoteIndex = typeof quotePreference.selectQuote === 'number' ?
          quotePreference.selectQuote : 0; // Default to first quote

        if (quoteIndex < quotes.length) {
          logger.info(`Selecting quote ${quoteIndex} - ${quotes[quoteIndex].price}`);

          const contactButtons = await this.page.$$('.carrierSelectAu');
          if (contactButtons[quoteIndex]) {
            await contactButtons[quoteIndex].click();
            await this.humanDelay(5000);
            await this.takeScreenshot('quote_selected');
          }
        }
      }

      return {
        success: true,
        message: 'Quote results retrieved successfully',
        currentUrl: this.page.url(),
        step: 'quote_results_completed',
        data: {
          quotesFound: quotes.length,
          quotes: quotes,
          selectedQuote: quotePreference.selectQuote !== undefined ? quotes[quotePreference.selectQuote || 0] : null
        }
      };

    } catch (error) {
      logger.error('Error in handleQuoteResultsStep', { error: error.message });
      await this.takeScreenshot('quote_results_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'quote_results_error'
      };
    }
  }

  // Handle thank you step (final confirmation page)
  async handleThankYouStep() {
    try {
      logger.info('Handling thank you step (final confirmation)...');

      // Wait a moment for page to load
      await this.humanDelay(3000);
      await this.takeScreenshot('thank_you_page');

      // Look for thank you indicators
      const thankYouContent = await this.page.evaluate(() => {
        const pageText = document.body.textContent.toLowerCase();
        const isThankYou = pageText.includes('thank you') ||
                          pageText.includes('confirmation') ||
                          pageText.includes('complete') ||
                          pageText.includes('submitted') ||
                          pageText.includes('success');

        return {
          isThankYouPage: isThankYou,
          pageTitle: document.title,
          currentUrl: window.location.href
        };
      });

      logger.info('Thank you page analysis:', thankYouContent);

      return {
        success: true,
        message: 'Thank you step completed - automation finished successfully!',
        currentUrl: this.page.url(),
        step: 'thank_you_completed',
        data: thankYouContent
      };

    } catch (error) {
      logger.error('Error in handleThankYouStep', { error: error.message });
      await this.takeScreenshot('thank_you_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'thank_you_error'
      };
    }
  }

  // TODO: Implement remaining conditional steps

  // TODO: Handle driver information step (pg2)
  // This step typically includes:
  // - Driver's license information
  // - Driving history
  // - Prior insurance information

  // TODO: Handle policy details step (pg3)
  // This step typically includes:
  // - Coverage selections
  // - Deductible choices
  // - Policy limits

  // TODO: Handle quote comparison step (pg4)
  // This step typically includes:
  // - Multiple quote options
  // - Coverage comparison
  // - Final selection

  // TODO: Handle final submission step (pg5)
  // This step typically includes:
  // - Review all information
  // - Payment method selection
  // - Final submission and confirmation
}

module.exports = InsuranceFormAutomator;