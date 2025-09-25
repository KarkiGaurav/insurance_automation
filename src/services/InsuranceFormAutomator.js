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

      logger.info('Navigating to form...');
      await this.page.goto(this.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for form to be ready
      logger.info('Waiting for page to fully load...');

      // Add debugging information about current page state
      const currentUrl = this.page.url();
      const title = await this.page.title();
      logger.info(`Current URL: ${currentUrl}, Title: ${title}`);

      const formReady = await Promise.race([
        this.page.waitForSelector('#FirstName', { timeout: 15000 }).then(() => 'firstname'),
        this.page.waitForSelector('#residence', { timeout: 15000 }).then(() => 'form'),
        this.page.waitForSelector('input[type="text"]', { timeout: 15000 }).then(() => 'input'),
        this.page.waitForSelector('#container', { timeout: 15000 }).then(() => 'container')
      ]).catch(async () => {
        // Enhanced debugging when selectors fail
        logger.error('Form selectors not found, investigating page content...');

        // Check what's actually on the page
        const pageContent = await this.page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title,
            bodyText: document.body ? document.body.innerText.substring(0, 500) : 'No body found',
            inputCount: document.querySelectorAll('input').length,
            inputTypes: Array.from(document.querySelectorAll('input')).map(i => i.type),
            formCount: document.querySelectorAll('form').length,
            hasFirstName: !!document.querySelector('#FirstName'),
            hasResidence: !!document.querySelector('#residence'),
            hasContainer: !!document.querySelector('#container')
          };
        });

        logger.error('Page investigation results:', pageContent);
        await this.takeScreenshot('page_load_error');
        throw new Error(`Page failed to load properly. URL: ${pageContent.url}, Title: ${pageContent.title}`);
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

  // Multi-vehicle and multi-driver form automation
  async fillMultiVehicleDriverForm(vehicles, drivers, policyInfo = null, userData = null) {
    try {
      logger.info(`Starting multi-vehicle/driver automation`, {
        vehicleCount: vehicles.length,
        driverCount: drivers.length
      });

      // Step 1: Fill personal information using userData (has address/city/etc) or fallback to primary driver
      const formData = userData || drivers[0];
      const step1Result = await this.fillFirstStep(formData);
      if (!step1Result.success) {
        return step1Result;
      }

      // Step 2: Process all vehicles sequentially
      for (let i = 0; i < vehicles.length; i++) {
        const vehicle = vehicles[i];
        logger.info(`Processing vehicle ${i + 1} of ${vehicles.length}:`, vehicle);

        const vehicleResult = await this.handleMultiVehicleStep(vehicle, i);
        if (!vehicleResult.success) {
          return {
            ...vehicleResult,
            vehicleIndex: i,
            error: `Failed processing vehicle ${i + 1}: ${vehicleResult.error}`
          };
        }
      }

      // Step 3: Process all drivers sequentially
      for (let i = 0; i < drivers.length; i++) {
        const driver = drivers[i];
        logger.info(`Processing driver ${i + 1} of ${drivers.length}:`, driver);

        if (i === 0) {
          // Primary driver already handled in step 1, skip basic info
          continue;
        }

        const driverResult = await this.handleMultiDriverStep(driver, i);
        if (!driverResult.success) {
          return {
            ...driverResult,
            driverIndex: i,
            error: `Failed processing driver ${i + 1}: ${driverResult.error}`
          };
        }
      }

      // Step 4: Continue with remaining form steps using enhanced data
      const primaryDriver = drivers[0];  // Define primaryDriver
      const enhancedDriverData = {
        ...primaryDriver,
        policyInfo: policyInfo || primaryDriver.policyInfo,
        allDrivers: drivers,
        allVehicles: vehicles
      };

      return await this.handleConditionalSteps(vehicles[0], enhancedDriverData);

    } catch (error) {
      logger.error('Error in fillMultiVehicleDriverForm', { error: error.message });
      return {
        success: false,
        error: error.message,
        currentUrl: this.page ? this.page.url() : 'unknown',
        step: 'multi_vehicle_driver_error'
      };
    }
  }

  // Handle individual vehicle in multi-vehicle scenario
  async handleMultiVehicleStep(vehicle, vehicleIndex) {
    try {
      logger.info(`Handling vehicle ${vehicleIndex + 1}:`, vehicle);

      // If this is the first vehicle, use normal vehicle handling
      if (vehicleIndex === 0) {
        const currentUrl = this.page.url();
        if (currentUrl.includes('/Prefill')) {
          return await this.handleVehicleLookupStep(vehicle);
        } else if (currentUrl.includes('/VehicleUsage') || await this.page.$('#pg2')) {
          return await this.handleVehicleUsageStep(vehicle);
        }
        return { success: true, message: 'First vehicle processed' };
      }

      // For additional vehicles, look for "Add Vehicle" button or similar
      const addVehicleResult = await this.addAdditionalVehicle(vehicle, vehicleIndex);
      return addVehicleResult;

    } catch (error) {
      logger.error(`Error handling vehicle ${vehicleIndex + 1}:`, error.message);
      return {
        success: false,
        error: error.message,
        step: `vehicle_${vehicleIndex + 1}_error`
      };
    }
  }

  // Handle individual driver in multi-driver scenario
  async handleMultiDriverStep(driver, driverIndex) {
    try {
      logger.info(`Handling driver ${driverIndex + 1}:`, driver);

      // Look for "Add Driver" button or similar
      const addDriverResult = await this.addAdditionalDriver(driver, driverIndex);
      return addDriverResult;

    } catch (error) {
      logger.error(`Error handling driver ${driverIndex + 1}:`, error.message);
      return {
        success: false,
        error: error.message,
        step: `driver_${driverIndex + 1}_error`
      };
    }
  }

  // Add additional vehicle to the form
  async addAdditionalVehicle(vehicle, vehicleIndex) {
    try {
      // Take screenshot before attempting to add vehicle
      await this.takeScreenshot(`before_add_vehicle_${vehicleIndex + 1}`);

      // Look for add vehicle button
      const addVehicleSelectors = [
        'button[onclick*="addVehicle"]',
        'a[onclick*="addVehicle"]',
        'button:contains("Add Vehicle")',
        'a:contains("Add Vehicle")',
        '#addVehicleBtn',
        '.add-vehicle-btn',
        'input[value*="Add Vehicle"]'
      ];

      let addVehicleButton = null;
      for (const selector of addVehicleSelectors) {
        try {
          addVehicleButton = await this.page.$(selector);
          if (addVehicleButton) {
            logger.info(`Found add vehicle button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!addVehicleButton) {
        logger.warn(`No add vehicle button found for vehicle ${vehicleIndex + 1}, may be single vehicle form`);
        return { success: true, message: 'Form may not support multiple vehicles' };
      }

      // Click add vehicle button
      await addVehicleButton.click();
      await this.humanDelay(3000);

      // Fill vehicle details for the new vehicle
      const vehicleResult = await this.fillAdditionalVehicleDetails(vehicle, vehicleIndex);

      await this.takeScreenshot(`after_add_vehicle_${vehicleIndex + 1}`);

      return vehicleResult;

    } catch (error) {
      logger.error(`Error adding vehicle ${vehicleIndex + 1}:`, error.message);
      return {
        success: false,
        error: error.message,
        step: `add_vehicle_${vehicleIndex + 1}_error`
      };
    }
  }

  // Add additional driver to the form
  async addAdditionalDriver(driver, driverIndex) {
    try {
      // Take screenshot before attempting to add driver
      await this.takeScreenshot(`before_add_driver_${driverIndex + 1}`);

      // Look for add driver button
      const addDriverSelectors = [
        'button[onclick*="addDriver"]',
        'a[onclick*="addDriver"]',
        'button:contains("Add Driver")',
        'a:contains("Add Driver")',
        '#addDriverBtn',
        '.add-driver-btn',
        'input[value*="Add Driver"]'
      ];

      let addDriverButton = null;
      for (const selector of addDriverSelectors) {
        try {
          addDriverButton = await this.page.$(selector);
          if (addDriverButton) {
            logger.info(`Found add driver button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!addDriverButton) {
        logger.warn(`No add driver button found for driver ${driverIndex + 1}, may be single driver form`);
        return { success: true, message: 'Form may not support multiple drivers' };
      }

      // Click add driver button
      await addDriverButton.click();
      await this.humanDelay(3000);

      // Fill driver details for the new driver
      const driverResult = await this.fillAdditionalDriverDetails(driver, driverIndex);

      await this.takeScreenshot(`after_add_driver_${driverIndex + 1}`);

      return driverResult;

    } catch (error) {
      logger.error(`Error adding driver ${driverIndex + 1}:`, error.message);
      return {
        success: false,
        error: error.message,
        step: `add_driver_${driverIndex + 1}_error`
      };
    }
  }

  // Fill details for additional vehicle
  async fillAdditionalVehicleDetails(vehicle, vehicleIndex) {
    try {
      logger.info(`Filling details for additional vehicle ${vehicleIndex + 1}`);

      // Look for vehicle-specific fields (they might have index in ID/name)
      const vehiclePrefix = vehicleIndex > 0 ? `_${vehicleIndex}` : '';

      // Vehicle year
      if (vehicle.year) {
        const yearSelectors = [
          `#VehicleYear${vehiclePrefix}`,
          `#vehicleYear${vehicleIndex}`,
          `select[name*="year"]${vehiclePrefix}`,
          `select[name*="Year"]${vehiclePrefix}`
        ];

        for (const selector of yearSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              await this.page.select(selector, vehicle.year.toString());
              await this.humanDelay(1000);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Vehicle make
      if (vehicle.make) {
        const makeSelectors = [
          `#VehicleMake${vehiclePrefix}`,
          `#vehicleMake${vehicleIndex}`,
          `select[name*="make"]${vehiclePrefix}`,
          `select[name*="Make"]${vehiclePrefix}`
        ];

        for (const selector of makeSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              // Get available options and find best match
              const options = await this.page.$$eval(`${selector} option`, opts =>
                opts.map(opt => ({ value: opt.value, text: opt.text }))
              );

              const targetMake = vehicle.make.toLowerCase();
              let selectedMake = null;

              for (const option of options) {
                if (option.text.toLowerCase().includes(targetMake) ||
                    targetMake.includes(option.text.toLowerCase())) {
                  selectedMake = option.value;
                  break;
                }
              }

              if (selectedMake) {
                await this.page.select(selector, selectedMake);
                await this.humanDelay(2000); // Wait for model dropdown to populate
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Vehicle model
      if (vehicle.model) {
        const modelSelectors = [
          `#VehicleModel${vehiclePrefix}`,
          `#vehicleModel${vehicleIndex}`,
          `select[name*="model"]${vehiclePrefix}`,
          `select[name*="Model"]${vehiclePrefix}`
        ];

        for (const selector of modelSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              const options = await this.page.$$eval(`${selector} option`, opts =>
                opts.map(opt => ({ value: opt.value, text: opt.text }))
              );

              const targetModel = vehicle.model.toLowerCase();
              let selectedModel = null;

              for (const option of options) {
                if (option.text.toLowerCase().includes(targetModel) ||
                    targetModel.includes(option.text.toLowerCase())) {
                  selectedModel = option.value;
                  break;
                }
              }

              if (selectedModel) {
                await this.page.select(selector, selectedModel);
                await this.humanDelay(1000);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }

      return { success: true, message: `Vehicle ${vehicleIndex + 1} details filled` };

    } catch (error) {
      logger.error(`Error filling additional vehicle details:`, error.message);
      return {
        success: false,
        error: error.message,
        step: 'fill_additional_vehicle_error'
      };
    }
  }

  // Fill details for additional driver
  async fillAdditionalDriverDetails(driver, driverIndex) {
    try {
      logger.info(`Filling details for additional driver ${driverIndex + 1}`);

      const driverPrefix = driverIndex > 0 ? `_${driverIndex}` : '';

      // Driver first name
      if (driver.firstName) {
        const firstNameSelectors = [
          `#firstName${driverPrefix}`,
          `#FirstName${driverPrefix}`,
          `#driverFirstName${driverIndex}`,
          `input[name*="firstName"]${driverPrefix}`
        ];

        for (const selector of firstNameSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              await this.clearAndType(selector, driver.firstName);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Driver last name
      if (driver.lastName) {
        const lastNameSelectors = [
          `#lastName${driverPrefix}`,
          `#LastName${driverPrefix}`,
          `#driverLastName${driverIndex}`,
          `input[name*="lastName"]${driverPrefix}`
        ];

        for (const selector of lastNameSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              await this.clearAndType(selector, driver.lastName);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      // Driver date of birth
      if (driver.dateOfBirth) {
        const dobSelectors = [
          `#dateOfBirth${driverPrefix}`,
          `#dob${driverPrefix}`,
          `#driverDOB${driverIndex}`,
          `input[name*="dateOfBirth"]${driverPrefix}`,
          `input[name*="dob"]${driverPrefix}`
        ];

        for (const selector of dobSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              // Use the enhanced date handling
              await this.fillDateField(selector, driver.dateOfBirth);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }

      return { success: true, message: `Driver ${driverIndex + 1} details filled` };

    } catch (error) {
      logger.error(`Error filling additional driver details:`, error.message);
      return {
        success: false,
        error: error.message,
        step: 'fill_additional_driver_error'
      };
    }
  }

  // Enhanced date field filling method
  async fillDateField(selector, dateValue) {
    try {
      const [year, month, day] = dateValue.split('-');
      const formats = [
        dateValue,                    // ISO format (YYYY-MM-DD)
        `${month}/${day}/${year}`,    // US format (MM/DD/YYYY)
        `${day}/${month}/${year}`,    // EU format (DD/MM/YYYY)
        `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`, // Padded US
        `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`  // Padded EU
      ];

      for (const format of formats) {
        try {
          await this.page.evaluate((sel, val) => {
            const element = document.querySelector(sel);
            if (element) {
              element.value = val;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, selector, format);

          // Check if it worked
          const value = await this.page.$eval(selector, el => el.value);
          if (value && !value.includes('dd') && !value.includes('mm')) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }

      // Fallback to manual typing
      await this.clearAndType(selector, `${month}/${day}/${year}`);
      return true;

    } catch (error) {
      logger.error('Error filling date field:', error.message);
      return false;
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
      logger.info(`Step 7: Policy Information - Current URL: ${currentUrl}`);
      const policyResult = await this.handlePolicyInformationStep(driverData?.policyInfo);
      if (!policyResult.success) {
        logger.error('Policy Information step failed:', policyResult);
        return policyResult;
      }
      currentUrl = this.page.url();
      logger.info(`After Policy Information step - New URL: ${currentUrl}`);

      // CRITICAL: Extended wait for page transition to Coverage Options
      logger.info('Waiting for Coverage Options page to be ready...');

      // Wait for Coverage Options page to fully load and stabilize
      let coveragePageReady = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!coveragePageReady && attempts < maxAttempts) {
        attempts++;
        logger.info(`Coverage page readiness check attempt ${attempts}/${maxAttempts}`);

        await this.humanDelay(2000);
        currentUrl = this.page.url();

        // Check if we have Coverage Options elements
        const hasElements = await this.page.evaluate(() => {
          const pg7 = document.querySelector('#pg7');
          const selectButtons = document.querySelectorAll('input[type="button"][value="Select"]');
          const pkgButtons = document.querySelectorAll('input[type="button"].pkgSelect[data-pkg]');

          return {
            hasPg7: pg7 !== null && pg7.style.display !== 'none',
            hasSelectButtons: selectButtons.length > 0,
            hasPkgButtons: pkgButtons.length > 0,
            totalButtons: selectButtons.length + pkgButtons.length
          };
        });

        logger.info(`Coverage page elements check:`, hasElements);

        if (hasElements.hasPg7 && (hasElements.hasSelectButtons || hasElements.hasPkgButtons)) {
          coveragePageReady = true;
          logger.info('Coverage Options page is ready with selection buttons');
        } else if (attempts === maxAttempts) {
          logger.warn('Coverage Options page not ready after maximum attempts');
        }
      }

      logger.info(`After extended wait - Final URL: ${currentUrl}`);
    }

    // Step 8: Coverage options (pg7)
    logger.info(`Checking for Coverage Options step - Current URL: ${currentUrl}`);

    // Enhanced coverage step detection with proper waiting
    const coverageStepCheck = await this.page.evaluate(() => {
      const pg7 = document.querySelector('#pg7');
      const selectButtons = document.querySelectorAll('input[type="button"][value="Select"]');
      const pkgButtons = document.querySelectorAll('input[type="button"].pkgSelect[data-pkg]');

      return {
        hasPg7: pg7 !== null,
        pg7Visible: pg7 && pg7.style.display !== 'none',
        selectButtonCount: selectButtons.length,
        pkgButtonCount: pkgButtons.length,
        urlMatch: window.location.href.includes('/CoverageOptions')
      };
    });

    const hasCoverageStep = currentUrl.includes('/CoverageOptions') || coverageStepCheck.hasPg7;

    logger.info('Coverage Options step detailed check:', {
      urlMatch: currentUrl.includes('/CoverageOptions'),
      ...coverageStepCheck,
      finalDecision: hasCoverageStep
    });

    if (hasCoverageStep) {
      logger.info(`Step 8: Coverage Options - Current URL: ${currentUrl}`);
      const coverageResult = await this.handleCoverageOptionsStep(driverData?.coveragePreference);
      if (!coverageResult.success) {
        logger.error('Coverage Options step failed:', coverageResult);
        return coverageResult;
      }
      currentUrl = this.page.url();
      logger.info(`After Coverage Options step - New URL: ${currentUrl}`);
    } else {
      logger.warn(`Coverage Options step skipped - URL: ${currentUrl}, no pg7 element found`);

      // Debug: Check what elements are actually present on the page
      const pageInfo = await this.page.evaluate(() => {
        const pg6 = document.querySelector('#pg6');
        const pg7 = document.querySelector('#pg7');
        const pg8 = document.querySelector('#pg8');
        const title = document.title;
        const h1 = document.querySelector('h1')?.textContent?.trim();
        const pageClass = document.body.className;

        return {
          title,
          h1,
          pageClass,
          hasPg6: pg6 !== null,
          hasPg7: pg7 !== null,
          hasPg8: pg8 !== null,
          currentStep: pg6 ? 'pg6' : pg7 ? 'pg7' : pg8 ? 'pg8' : 'unknown'
        };
      });

      logger.info('Current page debug info:', pageInfo);
      await this.takeScreenshot('coverage_step_debug');
    }

    // Step 9: Property info (pg8)
    if (currentUrl.includes('/PropertyInfo') || await this.page.$('#pg8')) {
      const propertyResult = await this.handlePropertyInfoStep(driverData?.propertyInfo);
      if (!propertyResult.success) return propertyResult;
      currentUrl = this.page.url();
    }

    // Step 10: Wait for and handle QuoteResults page
    logger.info('Waiting for navigation to QuoteResults page...');

    // After property step, we should be redirected to QuoteResults
    // Wait for the URL to change to QuoteResults
    try {
      await this.page.waitForFunction(() => {
        return window.location.href.includes('QuoteResults') ||
               document.querySelector('#pgResults') !== null;
      }, { timeout: 30000 });

      currentUrl = this.page.url();
      logger.info(`Navigated to QuoteResults page: ${currentUrl}`);

      // Now handle the quotes page
      quoteResult = await this.handleQuoteResultsStep(driverData?.quotePreference);
      if (quoteResult.success && quoteResult.data) {
        storedQuotes = quoteResult.data;
      }
      currentUrl = this.page.url();

    } catch (error) {
      logger.warn('Did not reach QuoteResults page, checking current page for quotes', { error: error.message, currentUrl });

      // Fallback: try to extract quotes from current page
      const quotesOnCurrentPage = await this.extractQuotesFromCurrentPage();
      if (quotesOnCurrentPage && quotesOnCurrentPage.quotes && quotesOnCurrentPage.quotes.length > 0) {
        logger.info(`Found ${quotesOnCurrentPage.quotes.length} quotes on current page`);
        storedQuotes = quotesOnCurrentPage;
      }
    }

    // Step 11: Contact method (ContactMethod) - After quotes
    if (currentUrl.includes('/ContactMethod') || await this.page.$('#pgContactMethod')) {
      const contactResult = await this.handleContactMethodStep(driverData?.contactPreference || 'email');
      if (!contactResult.success) return contactResult;
      currentUrl = this.page.url();
    }

    // Step 12: AlsoInterested page (optional - appears after Contact Me)
    if (currentUrl.includes('/AlsoInterested') || await this.page.$('#pgAddlLob')) {
      const alsoInterestedResult = await this.handleAlsoInterestedStep();
      if (!alsoInterestedResult.success) return alsoInterestedResult;
      currentUrl = this.page.url();
    }

    // Step 13: Thank you page (final confirmation)
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

    // DEBUG: Get actual form field information
    const formFields = await this.page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select');
      return Array.from(inputs).map(input => ({
        tag: input.tagName,
        type: input.type,
        id: input.id,
        name: input.name,
        placeholder: input.placeholder,
        value: input.value,
        required: input.required,
        className: input.className
      }));
    });

    // logger.info('Form fields found:', JSON.stringify(formFields, null, 2));

    // Based on the form screenshot, use these specific selectors
    const fieldMappings = [
      // Name fields - appear to be filled already based on screenshot
      { data: userData.firstName, selectors: ['input[value="Michael"]', '#firstName', '#FirstName', 'input[placeholder="First Name"]'] },
      { data: userData.lastName, selectors: ['input[value="Johnson"]', '#lastName', '#LastName', 'input[placeholder="Last Name"]'] },

      // Address fields - use exact IDs from form field data
      { data: userData.address, selectors: ['#InsuredAddress', 'input[placeholder="Address"]'] },
      { data: userData.city, selectors: ['#InsuredCity', 'input[placeholder="City"]'] },

      // Contact information - use exact IDs from form field data
      { data: userData.zipCode, selectors: ['#ZIPCode'] },
      { data: userData.email, selectors: ['#EmailAddress'] },
      { data: userData.phone, selectors: ['#Phone'] }
    ];

    // DEBUG: Log userData contents
    logger.info('userData contents:', JSON.stringify(userData, null, 2));

    // Fill each field using first working selector
    for (const field of fieldMappings) {
      if (!field.data) {
        logger.warn(`Skipping field - no data:`, field.selectors[0]);
        continue;
      }

      let filled = false;
      for (const selector of field.selectors) {
        if (await this.clearAndType(selector, field.data)) {
          filled = true;
          break;
        }
      }

      if (!filled) {
        logger.warn(`Could not fill field with data: ${field.data}`);
      }
    }

    // Handle apartment if provided
    if (userData.apartment) {
      const apartmentSelectors = ['#InsuredAddress2', 'input[placeholder*="apartment" i]', 'input[placeholder*="suite" i]'];
      for (const selector of apartmentSelectors) {
        if (await this.clearAndType(selector, userData.apartment)) break;
      }
    }

    // State selection with multiple attempts
    if (userData.state) {
      const stateSelectors = ['#InsuredState', 'select[name*="state" i]'];
      const stateValue = StateMapper.codeToFullName(userData.state);
      logger.info(`Selecting state: ${userData.state} -> ${stateValue}`);

      let stateSelected = false;
      for (const selector of stateSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await this.page.select(selector, stateValue);
            stateSelected = true;
            logger.info(`State selected using ${selector}`);
            break;
          }
        } catch (e) {
          logger.warn(`State selection failed for ${selector}: ${e.message}`);
        }
      }

      if (!stateSelected) {
        logger.error('Could not select state with any selector');
      }
      await this.humanDelay();
    }

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
    try {
      // Convert to string and handle null/undefined
      const textValue = text != null ? String(text) : '';

      // Check if element exists
      const element = await this.page.$(selector);
      if (!element) {
        logger.warn(`Element not found: ${selector}`);
        return false;
      }

      // Clear and type
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.value = '';
      }, selector);

      if (textValue) {
        await this.page.type(selector, textValue, { delay: 100 });
        logger.info(`Filled ${selector} with: ${textValue}`);
      }

      await this.humanDelay();
      return true;
    } catch (error) {
      logger.error(`Error filling ${selector}: ${error.message}`);
      return false;
    }
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
              const checkmark = label && label.querySelector ? label.querySelector('.checkmark') : null;
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

    // Check for errors - multiple selectors
    const errorSelectors = ['.errMsg', '.error', '.validation-error', '.field-error', '[class*="error"]', '[id*="error"]'];
    const visibleErrors = [];

    for (const selector of errorSelectors) {
      const errorElements = await this.page.$$(selector);

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
          if (errorText && !visibleErrors.includes(errorText)) {
            visibleErrors.push(errorText);
          }
        }
      }
    }

    // Also check for required field indicators
    const requiredFields = await this.page.evaluate(() => {
      const fields = [];
      document.querySelectorAll('input[required], select[required]').forEach(field => {
        if (!field.value || field.value.trim() === '') {
          fields.push(field.id || field.name || field.type);
        }
      });
      return fields;
    });

    if (requiredFields.length > 0) {
      visibleErrors.push(`Missing required fields: ${requiredFields.join(', ')}`);
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
    if (ms) {
      // If specific delay is provided, add some variance to make it more human-like
      const variance = ms * 0.1; // 10% variance
      const actualDelay = ms + (Math.random() * variance * 2 - variance);
      await new Promise(resolve => setTimeout(resolve, Math.max(100, actualDelay)));
    } else {
      // Default random delay between 800ms and 2000ms (more realistic)
      const delay = Math.random() * 1200 + 800;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Enhanced human-like typing with realistic timing
  async humanTypeText(selector, text, clearFirst = true) {
    try {
      await this.page.focus(selector);
      await this.humanDelay(300);

      if (clearFirst) {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.humanDelay(100);
        await this.page.keyboard.press('Delete');
        await this.humanDelay(200);
      }

      // Type with human-like speed and occasional pauses
      for (let i = 0; i < text.length; i++) {
        await this.page.keyboard.type(text[i]);

        // Random micro delays between characters
        const charDelay = Math.random() * 80 + 20;
        await new Promise(resolve => setTimeout(resolve, charDelay));

        // Occasional longer pauses (simulating thinking)
        if (Math.random() < 0.1) {
          await this.humanDelay(300);
        }
      }

      // Brief pause after typing
      await this.humanDelay(200);
      return true;
    } catch (error) {
      logger.error(`Failed to type text in ${selector}:`, error.message);
      return false;
    }
  }

  // Enhanced click with mouse movement simulation
  async humanClick(selector, description = '') {
    try {
      const element = await this.page.$(selector);
      if (!element) {
        logger.error(`Element not found for human click: ${selector}`);
        return false;
      }

      // Get element position
      const box = await element.boundingBox();
      if (box) {
        // Move mouse to element with slight randomization
        const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
        const y = box.y + box.height / 2 + (Math.random() * 10 - 5);

        await this.page.mouse.move(x, y, { steps: 3 });
        await this.humanDelay(100);
        await this.page.mouse.click(x, y, { delay: Math.random() * 50 + 25 });
      } else {
        // Fallback to regular click
        await element.click();
      }

      logger.info(`Human-like click performed on ${selector}${description ? ` (${description})` : ''}`);
      return true;
    } catch (error) {
      logger.error(`Failed to perform human click on ${selector}:`, error.message);
      return false;
    }
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

      // Driver details - DOB field is type="date" with mm/dd/yyyy format
      if (driverData.dateOfBirth) {
        logger.info(`Setting date of birth: ${driverData.dateOfBirth}`);

        try {
          const dobExists = await this.page.$('#drvDOB');
          if (!dobExists) {
            logger.warn('DOB field #drvDOB not found');
          } else {
            // Convert date format: "1990-05-15" -> "05/15/1990" (mm/dd/yyyy)
            let formattedDate = driverData.dateOfBirth;
            if (driverData.dateOfBirth.includes('-')) {
              const [year, month, day] = driverData.dateOfBirth.split('-');
              formattedDate = `${month}/${day}/${year}`;
            }

            logger.info(`Converted DOB format: ${driverData.dateOfBirth} -> ${formattedDate}`);

            // Multiple approaches for date input
            let dobSet = false;

            // Method 1: Direct value setting with YYYY-MM-DD format (HTML5 date inputs prefer this)
            try {
              await this.page.evaluate((selector, isoDate) => {
                const element = document.querySelector(selector);
                if (element) {
                  element.value = isoDate; // Try ISO format first
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, '#drvDOB', driverData.dateOfBirth);

              const testValue1 = await this.page.$eval('#drvDOB', el => el.value);
              if (testValue1 && !testValue1.includes('1753')) {
                logger.info(`DOB set successfully with ISO format: ${testValue1}`);
                dobSet = true;
              }
            } catch (error) {
              logger.warn('ISO format failed', error.message);
            }

            // Method 2: Try mm/dd/yyyy format if ISO failed
            if (!dobSet) {
              try {
                await this.page.evaluate((selector, mmddyyyy) => {
                  const element = document.querySelector(selector);
                  if (element) {
                    element.value = mmddyyyy;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }, '#drvDOB', formattedDate);

                const testValue2 = await this.page.$eval('#drvDOB', el => el.value);
                if (testValue2 && !testValue2.includes('1753')) {
                  logger.info(`DOB set successfully with mm/dd/yyyy format: ${testValue2}`);
                  dobSet = true;
                }
              } catch (error) {
                logger.warn('mm/dd/yyyy format failed', error.message);
              }
            }

            // Method 3: Clear and type character by character
            if (!dobSet) {
              try {
                await this.page.focus('#drvDOB');
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('KeyA');
                await this.page.keyboard.up('Control');
                await this.page.keyboard.press('Backspace');
                await this.humanDelay(500);

                await this.page.keyboard.type(formattedDate, { delay: 100 });
                await this.humanDelay(1000);

                const testValue3 = await this.page.$eval('#drvDOB', el => el.value);
                if (testValue3 && !testValue3.includes('1753')) {
                  logger.info(`DOB set successfully with typing: ${testValue3}`);
                  dobSet = true;
                }
              } catch (error) {
                logger.warn('Typing method failed', error.message);
              }
            }

            // Verify the value was set
            const dobValue = await this.page.$eval('#drvDOB', el => el.value);
            logger.info(`DOB field value after setting: "${dobValue}"`);

            if (!dobValue || dobValue.trim() === '' || dobValue.includes('1753')) {
              logger.error('DOB field is still empty or has default value after setting');
            } else {
              logger.info('DOB field set successfully');
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
      logger.info('Policy info received:', JSON.stringify(policyInfo, null, 2));
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

      // Policy start date (required) - HTML5 date input handling
      const startDateField = await this.page.$('#startDate');
      if (startDateField) {
        // Get field information including constraints
        const fieldInfo = await this.page.$eval('#startDate', el => ({
          currentValue: el.value,
          type: el.type,
          min: el.min,
          max: el.max,
          placeholder: el.placeholder,
          name: el.name
        }));

        logger.info(`Start date field found:`, fieldInfo);

        // Use provided date or today's date, but respect min constraint
        let targetDate = policyInfo.startDate || new Date().toISOString().split('T')[0];

        // If there's a min constraint, ensure our date is not before it
        if (fieldInfo.min && targetDate < fieldInfo.min) {
          targetDate = fieldInfo.min;
          logger.info(`Adjusted start date to minimum allowed: ${targetDate}`);
        }

        // If there's a max constraint, ensure our date is not after it
        if (fieldInfo.max && targetDate > fieldInfo.max) {
          targetDate = fieldInfo.max;
          logger.info(`Adjusted start date to maximum allowed: ${targetDate}`);
        }

        // Set the date value directly for HTML5 date input
        const success = await this.page.evaluate((dateValue) => {
          const element = document.querySelector('#startDate');
          if (element && element.type === 'date') {
            // For HTML5 date inputs, set value in YYYY-MM-DD format
            element.value = dateValue;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
          return false;
        }, targetDate);

        if (success) {
          logger.info(`Start date set successfully to: ${targetDate}`);

          // Verify the value was set correctly
          const verifyValue = await this.page.$eval('#startDate', el => el.value);
          logger.info(`Verified start date value: ${verifyValue}`);
        } else {
          logger.warn('Failed to set start date using HTML5 method, trying fallback');

          // Fallback: Try manual input
          await this.page.focus('#startDate');
          await this.page.keyboard.down('Control');
          await this.page.keyboard.press('KeyA');
          await this.page.keyboard.up('Control');
          await this.page.keyboard.press('Delete');
          await this.humanDelay(500);

          // Type in MM/DD/YYYY format if placeholder suggests it
          if (fieldInfo.placeholder && fieldInfo.placeholder.includes('mm/dd')) {
            const [year, month, day] = targetDate.split('-');
            const formattedDate = `${month}/${day}/${year}`;
            await this.page.keyboard.type(formattedDate);
          } else {
            await this.page.keyboard.type(targetDate);
          }

          await this.page.keyboard.press('Tab');
          await this.humanDelay(1000);
        }
      } else if (policyInfo.startDate) {
        logger.info(`Setting policy start date: ${policyInfo.startDate}`);

        // Find the start date field with comprehensive detection
        const startDateInfo = await this.page.evaluate(() => {
          const selectors = [
            '#startDate',
            'input[type="date"]',
            'input[placeholder*="dd"]',
            'input[placeholder*="mm"]',
            'input[name*="start"]',
            'input[name*="date"]'
          ];

          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              return {
                found: true,
                selector: selector,
                type: element.type,
                placeholder: element.placeholder,
                value: element.value,
                maxLength: element.maxLength,
                className: element.className
              };
            }
          }
          return { found: false };
        });

        logger.info('Start date field info:', startDateInfo);

        if (startDateInfo.found) {
          const originalDate = policyInfo.startDate;
          const [year, month, day] = originalDate.split('-');

          // Determine format based on placeholder
          let primaryFormat, secondaryFormats;
          if (startDateInfo.placeholder && startDateInfo.placeholder.includes('dd/mm')) {
            // DD/MM/YYYY format (European style)
            primaryFormat = `${day}/${month}/${year}`;
            secondaryFormats = [
              `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`,
              originalDate,                    // ISO format
              `${month}/${day}/${year}`,      // US format
              `${day}-${month}-${year}`,      // DD-MM-YYYY
              `${month}-${day}-${year}`       // MM-DD-YYYY
            ];
          } else {
            // Default to US format MM/DD/YYYY
            primaryFormat = `${month}/${day}/${year}`;
            secondaryFormats = [
              `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`,
              `${day}/${month}/${year}`,      // EU format
              originalDate,                    // ISO format
              `${month}-${day}-${year}`,      // MM-DD-YYYY
              `${day}-${month}-${year}`       // DD-MM-YYYY
            ];
          }

          const allFormats = [primaryFormat, ...secondaryFormats];
          let dateSet = false;

          // Method 1: Try setting value directly
          for (const dateFormat of allFormats) {
            try {
              const result = await this.page.evaluate((dateValue) => {
                const selectors = [
                  '#startDate',
                  'input[type="date"]',
                  'input[placeholder*="dd"]',
                  'input[placeholder*="mm"]',
                  'input[name*="start"]',
                  'input[name*="date"]'
                ];

                for (const selector of selectors) {
                  const element = document.querySelector(selector);
                  if (element) {
                    // Clear and focus
                    element.value = '';
                    element.focus();

                    // Set value
                    element.value = dateValue;

                    // Trigger comprehensive events
                    element.dispatchEvent(new Event('focus', { bubbles: true }));
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    element.dispatchEvent(new Event('blur', { bubbles: true }));
                    element.dispatchEvent(new Event('keyup', { bubbles: true }));

                    return {
                      success: true,
                      value: element.value,
                      selector: selector
                    };
                  }
                }
                return { success: false };
              }, dateFormat);

              if (result.success && result.value && !result.value.includes('dd') && !result.value.includes('mm')) {
                logger.info(`Start date set successfully with format ${dateFormat}: ${result.value} (selector: ${result.selector})`);
                dateSet = true;
                break;
              }
            } catch (error) {
              logger.warn(`Date format ${dateFormat} failed:`, error.message);
            }
          }

          // Method 2: Manual typing if direct setting failed
          if (!dateSet) {
            logger.info('Trying manual typing approach for start date...');
            try {
              // Use the primary format for manual typing
              await this.page.focus('#startDate');

              // Clear field completely
              await this.page.keyboard.down('Control');
              await this.page.keyboard.press('KeyA');
              await this.page.keyboard.up('Control');
              await this.page.keyboard.press('Backspace');
              await this.humanDelay(500);

              // Type slowly with delays
              for (const char of primaryFormat) {
                await this.page.keyboard.type(char, { delay: 150 });
                await this.humanDelay(100);
              }

              await this.humanDelay(1000);

              // Trigger events after manual typing
              await this.page.evaluate(() => {
                const element = document.querySelector('#startDate');
                if (element) {
                  element.dispatchEvent(new Event('input', { bubbles: true }));
                  element.dispatchEvent(new Event('change', { bubbles: true }));
                  element.dispatchEvent(new Event('blur', { bubbles: true }));
                }
              });

              const finalValue = await this.page.$eval('#startDate', el => el.value);
              logger.info(`Manual typing result: ${finalValue}`);

              if (finalValue && !finalValue.includes('dd') && !finalValue.includes('mm')) {
                dateSet = true;
                logger.info('Manual typing successful');
              }
            } catch (error) {
              logger.error('Manual typing failed:', error.message);
            }
          }

          // Method 3: Click and type character by character if still not set
          if (!dateSet) {
            logger.info('Trying click and type approach...');
            try {
              await this.page.click('#startDate');
              await this.humanDelay(500);

              // Select all and delete
              await this.page.keyboard.down('Control');
              await this.page.keyboard.press('KeyA');
              await this.page.keyboard.up('Control');
              await this.page.keyboard.press('Delete');
              await this.humanDelay(300);

              // Type with longer delays
              for (let i = 0; i < primaryFormat.length; i++) {
                await this.page.keyboard.type(primaryFormat[i], { delay: 200 });
                await this.humanDelay(200);
              }

              await this.page.keyboard.press('Tab');
              await this.humanDelay(1000);

              const finalValue = await this.page.$eval('#startDate', el => el.value);
              logger.info(`Click and type result: ${finalValue}`);
            } catch (error) {
              logger.error('Click and type failed:', error.message);
            }
          }

          // Final verification
          const finalCheck = await this.page.evaluate(() => {
            const element = document.querySelector('#startDate');
            return element ? element.value : 'not found';
          });
          logger.info(`Final start date value: ${finalCheck}`);

        } else {
          logger.warn('Start date field not found');
        }
      } else {
        logger.warn('No start date provided in policyInfo');
      }

      await this.takeScreenshot('policy_info_filled');

      // Click continue
      logger.info('Clicking continue button for policy information...');

      // First check if the continue button exists and is clickable
      const continueButtonInfo = await this.page.evaluate(() => {
        const button = document.querySelector('#pg6btn');
        if (!button) return { exists: false };

        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);

        return {
          exists: true,
          disabled: button.disabled,
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          text: button.textContent || button.value,
          type: button.type,
          className: button.className,
          inViewport: rect.top >= 0 && rect.left >= 0 &&
                     rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
        };
      });

      logger.info('Continue button info:', continueButtonInfo);

      if (!continueButtonInfo.exists) {
        return {
          success: false,
          error: 'Continue button (#pg6btn) not found',
          currentUrl: this.page.url(),
          step: 'policy_info_button_missing'
        };
      }

      if (continueButtonInfo.disabled) {
        return {
          success: false,
          error: 'Continue button is disabled',
          currentUrl: this.page.url(),
          step: 'policy_info_button_disabled'
        };
      }

      // Try to click the button
      const clickResult = await this.clickButton('#pg6btn', 'policy information continue button');
      logger.info('Continue button click result:', clickResult);

      // CRITICAL: Wait for page transition to Coverage Options
      logger.info('Waiting for page transition from Policy Info to Coverage Options...');

      // Wait for pg6 to disappear (Policy Info step to finish)
      try {
        await this.page.waitForFunction(() => {
          const pg6 = document.querySelector('#pg6');
          return !pg6 || pg6.style.display === 'none';
        }, { timeout: 10000 });
        logger.info('Policy Information page (pg6) has been hidden/removed');
      } catch (error) {
        logger.warn('pg6 did not disappear within timeout:', error.message);
      }

      // Wait for pg7 (Coverage Options) to appear
      try {
        await this.page.waitForFunction(() => {
          const pg7 = document.querySelector('#pg7');
          return pg7 && pg7.style.display !== 'none';
        }, { timeout: 10000 });
        logger.info('Coverage Options page (pg7) has appeared');
      } catch (error) {
        logger.warn('pg7 did not appear within timeout:', error.message);
      }

      // Additional stabilization wait
      await this.humanDelay(2000);

      // Check where we ended up
      const finalUrl = this.page.url();
      const finalPageInfo = await this.page.evaluate(() => {
        return {
          hasPg6: document.querySelector('#pg6') !== null,
          hasPg7: document.querySelector('#pg7') !== null,
          hasPg8: document.querySelector('#pg8') !== null,
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim() || ''
        };
      });

      logger.info(`Policy Info step completed - Final URL: ${finalUrl}`, finalPageInfo);

      return {
        success: true,
        message: 'Policy information step completed',
        currentUrl: finalUrl,
        step: 'policy_info_completed',
        finalPageInfo
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

      // First check if we're actually on the coverage options page
      const currentUrl = this.page.url();
      logger.info(`Current URL in coverage step: ${currentUrl}`);

      // CRITICAL: Wait for Coverage Options page to fully load
      logger.info('Waiting for Coverage Options page to fully load...');

      // Wait for pg7 element with extended timeout
      try {
        await this.page.waitForSelector('#pg7', {
          timeout: 15000,
          visible: true
        });
        logger.info('pg7 element found and visible');
      } catch (error) {
        logger.warn('pg7 element not found within timeout:', error.message);
      }

      // Wait for coverage selection buttons to be present (most important)
      logger.info('Waiting for coverage selection buttons to load...');
      try {
        // Wait for at least one coverage selection button
        await this.page.waitForFunction(() => {
          const selectButtons = document.querySelectorAll('input[type="button"][value="Select"]');
          const pkgSelectButtons = document.querySelectorAll('input[type="button"].pkgSelect[data-pkg]');
          return selectButtons.length > 0 || pkgSelectButtons.length > 0;
        }, { timeout: 15000 });

        logger.info('Coverage selection buttons are now available');
      } catch (error) {
        logger.warn('Coverage selection buttons not found within timeout:', error.message);
      }

      // Additional wait for any dynamic content loading
      await this.humanDelay(3000);
      logger.info('Additional stabilization wait completed');

      // Comprehensive page detection
      const pageDetection = await this.page.evaluate(() => {
        const pg6 = document.querySelector('#pg6');
        const pg7 = document.querySelector('#pg7');
        const pg8 = document.querySelector('#pg8');
        const startDateField = document.querySelector('#startDate');
        const coverageSelectors = document.querySelectorAll('input[type="button"].pkgSelect[data-pkg]');
        const selectButtons = document.querySelectorAll('input[value="Select"]');

        return {
          hasPg6: pg6 !== null,
          hasPg7: pg7 !== null,
          hasPg8: pg8 !== null,
          hasStartDate: startDateField !== null,
          coverageCount: coverageSelectors.length,
          selectButtonCount: selectButtons.length,
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim() || '',
          currentStepClass: document.body.className
        };
      });

      logger.info('Page detection results:', pageDetection);

      // If we're still on pg6 (Policy Information), this is the bug!
      if (pageDetection.hasPg6 && !pageDetection.hasPg7) {
        logger.error('BUG DETECTED: We are supposed to be on Coverage Options (pg7) but we are still on Policy Information (pg6)!');
        await this.takeScreenshot('coverage_bug_still_on_policy');

        // This means the Policy Information step didn't complete properly
        return {
          success: false,
          error: 'Still on Policy Information page when expecting Coverage Options page',
          currentUrl: this.page.url(),
          step: 'coverage_step_wrong_page',
          pageDetection
        };
      }

      // If we don't have coverage options, we might have skipped to property info
      if (pageDetection.hasPg8 && !pageDetection.hasPg7) {
        logger.warn('Coverage Options step appears to have been skipped, we are on Property Info (pg8)');
        return {
          success: true,
          message: 'Coverage Options step was skipped by the form',
          currentUrl: this.page.url(),
          step: 'coverage_options_skipped',
          pageDetection
        };
      }

      await this.takeScreenshot('coverage_options_page');

      // Look for coverage selection buttons based on provided HTML structure
      // HTML shows: <input type="button" class="pkgSelect" data-pkg="Basic" value="Select" onclick="setSelPkg('Basic','True');">
      const coverageOptions = await this.page.evaluate(() => {
        const selectButtons = document.querySelectorAll('input[type="button"].pkgSelect[data-pkg][value="Select"]');
        return Array.from(selectButtons).map(btn => ({
          dataPkg: btn.getAttribute('data-pkg'),
          value: btn.value,
          class: btn.className,
          onclick: btn.onclick ? btn.onclick.toString() : null
        }));
      });

      logger.info('Found coverage options:', coverageOptions);

      if (coverageOptions.length === 0) {
        logger.warn('No pkgSelect buttons found, checking for alternative coverage selectors...');

        // Fallback: Look for any Select buttons
        const allSelectButtons = await this.page.evaluate(() => {
          const buttons = document.querySelectorAll('input[type="button"][value="Select"], button');
          return Array.from(buttons).map((btn, index) => ({
            index,
            value: btn.value || btn.textContent,
            dataPkg: btn.getAttribute('data-pkg'),
            className: btn.className
          }));
        });

        logger.info('All Select buttons found:', allSelectButtons);

        if (allSelectButtons.length > 0) {
          // Click the Standard/middle option (usually index 1)
          const targetIndex = Math.min(1, allSelectButtons.length - 1);
          logger.info(`Clicking Select button at index ${targetIndex}`);

          await this.page.evaluate((index) => {
            const buttons = document.querySelectorAll('input[type="button"][value="Select"], button');
            if (buttons[index]) {
              buttons[index].click();
            }
          }, targetIndex);

          await this.humanDelay(3000);
          await this.takeScreenshot('coverage_selected_fallback');

          return {
            success: true,
            message: 'Coverage selected using fallback method',
            currentUrl: this.page.url(),
            step: 'coverage_selected'
          };
        }

        return {
          success: false,
          error: 'No coverage selection buttons found',
          currentUrl: this.page.url(),
          step: 'coverage_options_not_found'
        };
      }

      // Map coverage preferences to available options
      const coverageMap = {
        'Basic': 'Basic',
        'Standard': 'Standard',
        'Enhanced': 'Standard',
        'Premium': 'Optimal',
        'Optimal': 'Optimal'
      };

      const selectedCoverage = coverageMap[coveragePreference] || 'Standard';
      logger.info(`Selecting coverage package: ${selectedCoverage}`);

      // Find the matching coverage option
      let targetOption = coverageOptions.find(option => option.dataPkg === selectedCoverage);

      if (!targetOption && selectedCoverage === 'Standard') {
        // If Standard not found, try Basic or first available
        targetOption = coverageOptions.find(option => option.dataPkg === 'Basic') || coverageOptions[0];
      }

      if (!targetOption) {
        // Fallback to first option
        targetOption = coverageOptions[0];
        logger.warn(`Coverage ${selectedCoverage} not found, using ${targetOption.dataPkg}`);
      }

      logger.info(`Clicking coverage option: ${targetOption.dataPkg}`);

      // Click the selected coverage option
      await this.page.evaluate((dataPkg) => {
        const button = document.querySelector(`input[type="button"].pkgSelect[data-pkg="${dataPkg}"][value="Select"]`);
        if (button) {
          button.click();
          return true;
        }
        return false;
      }, targetOption.dataPkg);

      await this.humanDelay(3000);
      await this.takeScreenshot('coverage_selected');

      // Check if we need to click a continue button
      const continueButton = await this.page.$('#pg7btn').catch(() => null);
      if (continueButton) {
        logger.info('Clicking coverage options continue button');
        await this.clickButton('#pg7btn', 'coverage options continue button');
      } else {
        logger.info('No continue button found, coverage selection might auto-proceed');
      }

      return {
        success: true,
        message: `Coverage ${targetOption.dataPkg} selected successfully`,
        currentUrl: this.page.url(),
        step: 'coverage_options_completed',
        selectedCoverage: targetOption.dataPkg
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

      // Wait a bit for page transition
      await this.humanDelay(5000);

      // Check where we landed after property step
      const afterPropertyUrl = this.page.url();
      logger.info(`After property step, current URL: ${afterPropertyUrl}`);

      return {
        success: true,
        message: 'Property information step completed',
        currentUrl: afterPropertyUrl,
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
        // For reliable email delivery, ensure we click the email option
        const targetIndex = isPhonePreference ? 0 : 1;
        logger.info(`Clicking button at index ${targetIndex} for ${contactPreference} preference (ensuring email delivery)`);

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

  // Extract quotes from current page - ONLY from .resultsPanel (no fallback dummy data)
  async extractQuotesFromCurrentPage() {
    try {
      logger.info('Attempting to extract quotes from current page...');
      await this.takeScreenshot('quote_extraction_attempt');

      // Wait a bit for any dynamic content to load
      await this.humanDelay(3000);

      // ONLY look for .resultsPanel - no fallback to avoid dummy data
      const quotes = await this.page.evaluate(() => {
        const quoteElements = document.querySelectorAll('.resultsPanel');

        if (quoteElements.length === 0) {
          console.log('No .resultsPanel elements found - not on quotes page');
          return [];
        }

        return Array.from(quoteElements).map((quote, index) => {
          // Extract price information
          const priceElement = quote.querySelector('.dollar');
          const termElement = quote.querySelector('.term');
          const vehicleInfo = quote.querySelector('.resultTextSeparator')?.textContent?.trim();

          // Extract carrier info from onclick
          const contactButton = quote.querySelector('.carrierSelectAu');
          let carrierName = 'Unknown';

          if (contactButton && contactButton.onclick) {
            const onclickStr = contactButton.onclick.toString();
            const match = onclickStr.match(/setSelCarrier\("([^|]+)/);
            if (match) {
              carrierName = match[1];
            }
          }

          const priceText = priceElement?.textContent?.trim();
          const termText = termElement?.textContent?.trim();

          // Only include if we have a valid price
          if (priceText && priceText.includes('$')) {
            return {
              index,
              selector: '.resultsPanel',
              price: priceText,
              term: termText || 'Unknown Term',
              carrier: carrierName,
              vehicle: vehicleInfo || 'Unknown Vehicle',
              available: true
            };
          }

          return null;
        }).filter(quote => quote !== null); // Remove null entries
      });

      logger.info(`Quote extraction found ${quotes.length} REAL quotes from .resultsPanel:`, quotes);

      if (quotes.length > 0) {
        return {
          quotesFound: quotes.length,
          quotes: quotes,
          extractionMethod: '.resultsPanel',
          currentUrl: this.page.url()
        };
      }

      logger.warn('No valid quotes found in .resultsPanel elements');
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

      // Wait for quotes to fully load (look for actual quote panels with prices)
      logger.info('Waiting for quotes to fully load with prices...');
      await this.page.waitForFunction(() => {
        const quotes = document.querySelectorAll('.resultsPanel');
        if (quotes.length === 0) return false;

        // Check that at least one quote has a price
        const hasPrice = Array.from(quotes).some(panel => {
          const priceElement = panel.querySelector('.dollar');
          return priceElement && priceElement.textContent.trim().includes('$');
        });

        return hasPrice;
      }, { timeout: 120000 }); // Increased timeout to 2 minutes for quote loading

      await this.takeScreenshot('quote_results_page');

      // Extract REAL quote information from .resultsPanel elements
      const quotes = await this.page.evaluate(() => {
        const quoteElements = document.querySelectorAll('.resultsPanel');
        console.log(`Found ${quoteElements.length} quote panels`);

        return Array.from(quoteElements).map((quote, index) => {
          // Extract price information
          const priceElement = quote.querySelector('.dollar');
          const termElement = quote.querySelector('.term');

          // Extract vehicle info
          const vehicleInfo = quote.querySelector('.resultTextSeparator')?.textContent?.trim() || 'Unknown Vehicle';

          // Extract carrier info - look for hidden inputs or onclick attributes
          const contactButton = quote.querySelector('.carrierSelectAu');
          let carrierName = 'Unknown';

          if (contactButton && contactButton.onclick) {
            const onclickStr = contactButton.onclick.toString();
            const match = onclickStr.match(/setSelCarrier\("([^|]+)/);
            if (match) {
              carrierName = match[1];
            }
          }

          // Extract coverage details
          const coverageDetails = Array.from(quote.querySelectorAll('.resultDetails li')).map(li => {
            const titleElement = li.querySelector('.covTitle');
            const valueElement = li.querySelector('span:last-child');
            return {
              title: titleElement?.textContent?.trim() || '',
              value: valueElement?.textContent?.trim() || ''
            };
          });

          const quoteData = {
            index,
            price: priceElement?.textContent?.trim() || 'No Price',
            term: termElement?.textContent?.trim() || 'Unknown Term',
            carrier: carrierName,
            vehicle: vehicleInfo,
            coverageDetails,
            available: true
          };

          return quoteData;
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

          // CRITICAL: Ensure proper email delivery by simulating real user quote selection
          const contactButtons = await this.page.$$('.carrierSelectAu');
          if (contactButtons[quoteIndex]) {
            // Human-like interaction before clicking the quote button
            logger.info('Preparing for quote selection with human-like behavior...');

            // Scroll quote into view first (like a real user would)
            await contactButtons[quoteIndex].scrollIntoView();
            await this.humanDelay(1000);

            // Move mouse over other quotes first (simulating comparison)
            for (let i = 0; i < Math.min(contactButtons.length, 3); i++) {
              if (i !== quoteIndex) {
                try {
                  const box = await contactButtons[i].boundingBox();
                  if (box) {
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await this.humanDelay(500);
                  }
                } catch (error) {
                  // Continue if hover fails
                }
              }
            }

            // Now click the selected quote with enhanced human simulation
            logger.info(`Clicking quote selection button for quote ${quoteIndex}...`);
            await this.humanClick('.carrierSelectAu', `quote ${quoteIndex} selection`);

            // CRITICAL: Wait longer for the email system to process
            logger.info('Waiting for email processing and form completion...');
            await this.humanDelay(8000);

            // Verify the selection was processed
            const currentUrl = this.page.url();
            logger.info(`After quote selection - URL: ${currentUrl}`);

            // Check if any success messages or confirmations appeared
            const confirmationCheck = await this.page.evaluate(() => {
              const successMessages = document.querySelectorAll('.success, .confirmation, .thank-you, [class*="success"], [class*="confirm"]');
              const bodyText = document.body.textContent.toLowerCase();

              return {
                hasSuccessElements: successMessages.length > 0,
                bodyContainsSuccess: bodyText.includes('thank you') || bodyText.includes('success') || bodyText.includes('confirm'),
                currentUrl: window.location.href,
                title: document.title
              };
            });

            logger.info('Quote selection confirmation check:', confirmationCheck);
            await this.takeScreenshot('quote_selected_with_confirmation');

            // If no success indication, this might be why emails aren't sent
            if (!confirmationCheck.hasSuccessElements && !confirmationCheck.bodyContainsSuccess) {
              logger.warn('Quote selection may not have completed properly - this could affect email delivery');
            } else {
              logger.info('Quote selection appears successful - email should be triggered');
            }
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

  // Handle AlsoInterested page (appears after Contact Me button)
  async handleAlsoInterestedStep() {
    try {
      logger.info('Handling AlsoInterested step (optional additional insurance)...');

      // Wait for the page to load
      await this.page.waitForSelector('#pgAddlLob', { timeout: 10000 });
      await this.takeScreenshot('also_interested_page');

      // Wait for continue button to be available
      await this.humanDelay(2000);

      // Click continue button without selecting any additional insurance
      logger.info('Clicking continue button on AlsoInterested page...');
      await this.clickButton('#moreLob', 'AlsoInterested continue button');

      return {
        success: true,
        message: 'AlsoInterested step completed',
        currentUrl: this.page.url(),
        step: 'also_interested_completed'
      };

    } catch (error) {
      logger.error('Error in handleAlsoInterestedStep', { error: error.message });
      await this.takeScreenshot('also_interested_error');
      return {
        success: false,
        error: error.message,
        currentUrl: this.page.url(),
        step: 'also_interested_error'
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