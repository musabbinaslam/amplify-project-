const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { referralResolveLimiter } = require('../middleware/security');
const referralController = require('../controllers/referralController');

const router = express.Router();

// Public (rate-limited, no auth) — for signup page code validation
router.get('/resolve/:code', referralResolveLimiter, referralController.resolveReferralCode);

// Authenticated routes
router.use(verifyFirebaseToken);
router.get('/me', referralController.getMyReferralDashboard);
router.post('/claim', referralController.claimReferralCode);
router.get('/discount/status', referralController.getDiscountStatus);
router.get('/leaderboard', referralController.getLeaderboard);

module.exports = router;
