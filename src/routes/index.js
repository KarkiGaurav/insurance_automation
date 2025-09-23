const express = require('express');
const AutomationController = require('../controllers/automationController');
const DiagnosticController = require('../controllers/diagnosticController');
const apiAuth = require('../middleware/apiAuth');

const router = express.Router();

// Health and diagnostic endpoints (no auth required)
router.get('/health', DiagnosticController.healthCheck);
router.get('/browser-check', DiagnosticController.browserCheck);

// Protected diagnostic endpoints (auth required)
router.get('/simple-test', apiAuth, DiagnosticController.simpleTest);
router.get('/quick-url-test', apiAuth, DiagnosticController.quickUrlTest);
router.post('/test', apiAuth, DiagnosticController.basicTest);

// Main automation endpoints (auth required)
router.post('/submit-insurance-form', apiAuth, AutomationController.submitInsuranceForm);
router.post('/submit-complete-form', apiAuth, AutomationController.submitCompleteForm);
router.post('/debug-form-fill', apiAuth, AutomationController.debugFormFill);

router.post('/get-quotes', apiAuth, (req, res) => {
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