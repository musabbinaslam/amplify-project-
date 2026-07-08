const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAgencyAdmin } = require('../middleware/requireAgencyAdmin');
const { scopeToAgency } = require('../middleware/scopeToAgency');
const agencyController = require('../controllers/agencyController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAgencyAdmin);
router.use(scopeToAgency);

router.get('/me', agencyController.getAgencyMe);
router.get('/agents', agencyController.getMyAgents);
router.get('/analytics', agencyController.getAnalytics);
router.get('/analytics-drilldown', agencyController.getAnalyticsDrilldown);
router.get('/call-logs', agencyController.getCallLogs);

module.exports = router;
