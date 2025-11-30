const express = require('express');
const AutomationController = require('../controllers/automationController');
const DiagnosticController = require('../controllers/diagnosticController');
const apiAuth = require('../middleware/apiAuth');
const dataStore = require('../utils/dataStore');

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

// Submission history endpoints
router.get('/submissions', apiAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const submissions = dataStore.getRecentSubmissions(limit);
  res.json({
    success: true,
    count: submissions.length,
    submissions
  });
});

router.get('/submissions/stats', apiAuth, (req, res) => {
  const stats = dataStore.getStats();
  res.json({
    success: true,
    stats
  });
});

router.get('/submissions/:id', apiAuth, (req, res) => {
  const submission = dataStore.getSubmissionById(req.params.id);
  if (!submission) {
    return res.status(404).json({
      success: false,
      error: 'Submission not found'
    });
  }
  res.json({
    success: true,
    submission
  });
});

router.delete('/submissions/:id', apiAuth, (req, res) => {
  const deleted = dataStore.deleteSubmission(req.params.id);
  res.json({
    success: deleted,
    message: deleted ? 'Submission deleted' : 'Submission not found'
  });
});

router.delete('/submissions', apiAuth, (req, res) => {
  const cleared = dataStore.clearAll();
  res.json({
    success: cleared,
    message: cleared ? 'All submissions cleared' : 'Failed to clear submissions'
  });
});

module.exports = router;