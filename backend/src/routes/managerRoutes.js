const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireManager } = require('../middleware/requireManager');
const { requireActiveAgency } = require('../middleware/requireActiveAgency');
const managerController = require('../controllers/managerController');

const router = express.Router();

// All manager routes require a valid Firebase token AND either 'manager', agency_admin, or 'admin' role.
// requireManager also attaches req.managedAgents (the allowlist) for per-request scoping.
// requireActiveAgency blocks pending/rejected agency admins from the same ops handlers
// that /api/agency/* already gates (platform managers/admins still pass).
router.use(verifyFirebaseToken);
router.use(requireManager);
router.use(requireActiveAgency);

router.get('/my-agents', managerController.getMyAgents);
router.get('/assignable-agents', managerController.getAssignableAgents);
router.patch('/team', managerController.patchMyTeam);
router.get('/analytics', managerController.getAnalytics);
router.get('/analytics-drilldown', managerController.getAnalyticsDrilldown);
router.get('/call-logs', managerController.getCallLogs);

module.exports = router;
