const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAgencyAdmin } = require('../middleware/requireAgencyAdmin');
const { requireActiveAgency } = require('../middleware/requireActiveAgency');
const { scopeToAgency } = require('../middleware/scopeToAgency');
const {
  agencyInviteClaimLimiter,
  agencyRegisterLimiter,
  agencyReapplyLimiter,
} = require('../middleware/security');
const agencyController = require('../controllers/agencyController');

const router = express.Router();

router.use(verifyFirebaseToken);

// Self-serve agency-admin application (any authenticated user, not yet in an agency)
router.post('/register', agencyRegisterLimiter, agencyController.registerAgency);

// Rejected founder clears membership so they can register again
router.post('/reapply', agencyReapplyLimiter, agencyController.reapplyAgency);

// Invite claim for agents (authenticated; not agency-admin-only)
router.post('/invites/claim', agencyInviteClaimLimiter, agencyController.claimAgencyInvite);

router.use(requireAgencyAdmin);
router.use(scopeToAgency);

// Pending/rejected founders may still read status via /me
router.get('/me', agencyController.getAgencyMe);

// Ops + invites require an active (operable) agency
router.use(requireActiveAgency);
router.get('/invite', agencyController.getAgencyInvite);
router.post('/invite/rotate', agencyController.rotateAgencyInvite);
router.get('/agents', agencyController.getMyAgents);
router.get('/analytics', agencyController.getAnalytics);
router.get('/analytics-drilldown', agencyController.getAnalyticsDrilldown);
router.get('/call-logs', agencyController.getCallLogs);

module.exports = router;
