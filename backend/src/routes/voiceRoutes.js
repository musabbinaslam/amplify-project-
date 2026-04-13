const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validateTwilioWebhook } = require('../middleware/security');

// Ensure token generation routes correctly
// POST /api/voice/token
router.post('/token', voiceController.generateToken);

// Webhook for incoming Twilio calls (Secured)
router.post('/incoming-call', validateTwilioWebhook, voiceController.handleIncomingCall);

// Handle call completion for billing (Secured)
router.post('/call-completed', validateTwilioWebhook, voiceController.handleCallCompleted);

// Fetch history (authenticated — per-user from Firestore)
router.get('/logs', verifyFirebaseToken, voiceController.getLogs);

// Proxy a Twilio recording so the browser doesn't need to auth directly with Twilio
router.get('/recording/:recordingSid', verifyFirebaseToken, voiceController.proxyRecording);

module.exports = router;
