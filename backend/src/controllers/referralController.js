/**
 * Referral Controller
 *
 * Express handler functions for all referral API endpoints.
 */

const referralService = require('../services/referralService');

/**
 * GET /api/referrals/me
 * Returns the authenticated user's referral dashboard.
 */
async function getMyReferralDashboard(req, res) {
  try {
    const dashboard = await referralService.getReferralDashboard(req.user.uid);
    res.json(dashboard);
  } catch (err) {
    console.error('[Referral] getMyReferralDashboard:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load referral dashboard' });
  }
}

/**
 * GET /api/referrals/resolve/:code
 * Resolves a referral code. Rate-limited, no auth required.
 */
async function resolveReferralCode(req, res) {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Referral code is required' });

    const result = await referralService.resolveCode(code);
    res.json(result);
  } catch (err) {
    console.error('[Referral] resolveReferralCode:', err.message);
    res.status(500).json({ error: 'Failed to resolve referral code' });
  }
}

/**
 * POST /api/referrals/claim
 * Claims a referral code for the authenticated user (post-signup).
 * Body: { code: "AGENT-XXXXXX" }
 */
async function claimReferralCode(req, res) {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const result = await referralService.claimReferral(req.user.uid, code);
    res.json(result);
  } catch (err) {
    console.error('[Referral] claimReferralCode:', err.message);
    const status = err.message.includes('Invalid') || err.message.includes('cannot') || err.message.includes('already')
      ? 400
      : 500;
    res.status(status).json({ error: err.message || 'Failed to claim referral code' });
  }
}

/**
 * GET /api/referrals/discount/status
 * Returns the current discount status for the authenticated user.
 */
async function getDiscountStatusHandler(req, res) {
  try {
    const status = await referralService.getDiscountStatus(req.user.uid);
    res.json(status);
  } catch (err) {
    console.error('[Referral] getDiscountStatus:', err.message);
    res.status(500).json({ error: 'Failed to load discount status' });
  }
}

/**
 * GET /api/referrals/leaderboard
 * Returns top referrers (anonymized).
 */
async function getLeaderboard(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit || 10), 25);
    const leaderboard = await referralService.getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (err) {
    console.error('[Referral] getLeaderboard:', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
}

module.exports = {
  getMyReferralDashboard,
  resolveReferralCode,
  claimReferralCode,
  getDiscountStatus: getDiscountStatusHandler,
  getLeaderboard,
};
