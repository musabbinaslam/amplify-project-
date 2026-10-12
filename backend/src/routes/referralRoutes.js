const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const referralController = require('../controllers/referralController');

const router = express.Router();

// Authenticated routes
router.use(verifyFirebaseToken);
router.get('/me', referralController.getMyReferralDashboard);
router.post('/claim', referralController.claimReferralCode);
router.get('/discount/status', referralController.getDiscountStatus);
router.get('/leaderboard', referralController.getLeaderboard);

module.exports = router;
