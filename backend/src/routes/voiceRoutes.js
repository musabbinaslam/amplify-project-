const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const { verifyFirebaseToken } = require('../middleware/auth');

// Ensure token generation routes correctly
// POST /api/voice/token
router.post('/token', voiceController.generateToken);

// Webhook for incoming Twilio calls
router.post('/incoming-call', voiceController.handleIncomingCall);

// Handle call completion for billing
router.post('/call-completed', voiceController.handleCallCompleted);

// Fetch history (authenticated — per-user from Firestore)
router.get('/logs', verifyFirebaseToken, voiceController.getLogs);

module.exports = router;
