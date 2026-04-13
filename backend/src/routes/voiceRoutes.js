const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validateTwilioWebhook, voiceTokenLimiter, webhookCallLimiter } = require('../middleware/security');

// Ensure token generation routes correctly
// POST /api/voice/token
router.post('/token', verifyFirebaseToken, voiceTokenLimiter, voiceController.generateToken);

// Webhook for incoming Twilio calls (Secured)
router.post('/incoming-call', webhookCallLimiter, validateTwilioWebhook, voiceController.handleIncomingCall);

// Handle call completion for billing (Secured)
router.post('/call-completed', webhookCallLimiter, validateTwilioWebhook, voiceController.handleCallCompleted);

// Fetch history (authenticated — per-user from Firestore)
router.get('/logs', verifyFirebaseToken, voiceController.getLogs);

module.exports = router;
