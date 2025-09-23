const express = require('express');
const AutomationController = require('../controllers/automationController');
const DiagnosticController = require('../controllers/diagnosticController');

const router = express.Router();

// Health and diagnostic endpoints
router.get('/health', DiagnosticController.healthCheck);
router.get('/browser-check', DiagnosticController.browserCheck);
router.get('/simple-test', DiagnosticController.simpleTest);
router.get('/quick-url-test', DiagnosticController.quickUrlTest);
router.post('/test', DiagnosticController.basicTest);

// Main automation endpoints
router.post('/submit-insurance-form', AutomationController.submitInsuranceForm);
router.post('/submit-complete-form', AutomationController.submitCompleteForm);
router.post('/debug-form-fill', AutomationController.debugFormFill);

router.post('/get-quotes', (req, res) => {
  res.json({
    success: false,
    message: 'Quote retrieval not yet implemented',
    nextSteps: [
      'Implement coverage selection',
      'Handle quote comparison',
      'Add final submission process'
    ]
  });
});

module.exports = router;