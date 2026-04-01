const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');

// Ensure token generation routes correctly
// POST /api/voice/token
router.post('/token', voiceController.generateToken);

// Webhook for incoming Twilio calls
// POST /api/voice/incoming
router.post('/incoming', voiceController.handleIncomingCall);

module.exports = router;
