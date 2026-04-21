const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../middleware/auth');
const stripeController = require('../controllers/stripeController');

// Authenticated routes
router.get('/wallet', verifyFirebaseToken, stripeController.getWalletInfo);
router.post('/create-checkout', verifyFirebaseToken, stripeController.createCheckout);
router.post('/verify-checkout', verifyFirebaseToken, stripeController.verifyCheckout);
router.post('/create-subscription', verifyFirebaseToken, stripeController.createSubscription);
router.post('/cancel-subscription', verifyFirebaseToken, stripeController.cancelSubscription);

// Webhook — NO auth middleware, uses Stripe signature verification instead.
// NOTE: The raw body middleware is applied in server.js before express.json()
router.post('/webhook', stripeController.handleWebhook);

module.exports = router;
