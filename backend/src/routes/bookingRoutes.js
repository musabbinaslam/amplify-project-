const express = require('express');
const { handleCalendlyWebhook, getBookings } = require('../controllers/bookingController');
const { verifyFirebaseToken } = require('../middleware/auth');

const router = express.Router();

// Calendly webhook endpoint (unauthed, secured by signing key)
router.post('/calendly-webhook', express.json({ type: '*/*' }), handleCalendlyWebhook);

// Internal bookings list (requires Firebase auth)
router.get('/', verifyFirebaseToken, getBookings);

module.exports = router;

