const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireManager } = require('../middleware/requireManager');
const managerController = require('../controllers/managerController');

const router = express.Router();

// All manager routes require a valid Firebase token AND either 'manager' or 'admin' role.
// requireManager also attaches req.managedAgents (the allowlist) for per-request scoping.
router.use(verifyFirebaseToken);
router.use(requireManager);

router.get('/my-agents', managerController.getMyAgents);
router.get('/assignable-agents', managerController.getAssignableAgents);
router.patch('/team', managerController.patchMyTeam);
router.get('/analytics', managerController.getAnalytics);
router.get('/analytics-drilldown', managerController.getAnalyticsDrilldown);
router.get('/call-logs', managerController.getCallLogs);

module.exports = router;
