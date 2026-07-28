const leaderboardService = require('../services/leaderboardService');

/**
 * GET /api/leaderboard
 * Query: period=today|week|month|all (default month), tz=IANA timezone
 * Returns the platform-agent leaderboard ranked by Total Billable Calls.
 * Available to any authenticated user.
 */
async function getLeaderboard(req, res) {
  try {
    const { period, tz } = req.query || {};
    const data = await leaderboardService.getLeaderboard({
      period,
      tz,
      viewerUid: req.user?.uid || null,
    });
    res.json(data);
  } catch (err) {
    console.error('[Leaderboard] getLeaderboard:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load leaderboard' });
  }
}

module.exports = { getLeaderboard };
