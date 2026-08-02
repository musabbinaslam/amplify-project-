const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const leaderboardController = require('../controllers/leaderboardController');

const router = express.Router();

// Leaderboard is visible to every authenticated user (no role guard).
router.use(verifyFirebaseToken);

router.get('/', leaderboardController.getLeaderboard);

module.exports = router;
