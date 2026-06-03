const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const { verifyFirebaseToken } = require('../middleware/auth');
const { validateTwilioWebhook, voiceTokenLimiter, webhookCallLimiter } = require('../middleware/security');
const { handleContestUpload } = require('../middleware/contestUpload');

// Ensure token generation routes correctly
// POST /api/voice/token
router.post('/token', verifyFirebaseToken, voiceTokenLimiter, voiceController.generateToken);

// Webhook for incoming Twilio calls (Secured)
router.post('/incoming-call', webhookCallLimiter, validateTwilioWebhook, voiceController.handleIncomingCall);

// Handle call completion for billing (Secured)
router.post('/call-completed', webhookCallLimiter, validateTwilioWebhook, voiceController.handleCallCompleted);

// Dial leg status (answered / completed) — promotes IN_CALL without browser socket
router.post('/dial-status', webhookCallLimiter, validateTwilioWebhook, voiceController.handleDialStatus);

// Fetch history (authenticated — per-user from Firestore)
router.get('/logs', verifyFirebaseToken, voiceController.getLogs);

// Update call log (disposition)
router.patch('/logs/:callSid', verifyFirebaseToken, voiceController.updateCallLog);

// Contest a billable call charge
router.post('/logs/:callLogId/contest', verifyFirebaseToken, handleContestUpload, voiceController.submitCallContest);
router.get('/logs/:callLogId/contest', verifyFirebaseToken, voiceController.getCallContestStatus);
router.get('/contest-proof', verifyFirebaseToken, voiceController.serveContestProof);


// Proxy a Twilio recording so the browser doesn't need to auth directly with Twilio
router.get('/recording/:recordingSid', verifyFirebaseToken, voiceController.proxyRecording);

// ACA Transfer Endpoints
router.post('/initiate-transfer', verifyFirebaseToken, voiceController.initiateAcaTransfer);
router.post('/transfer-dtmf', verifyFirebaseToken, voiceController.sendDtmfToConference);
router.post('/kill-call', verifyFirebaseToken, voiceController.killCall);

module.exports = router;
