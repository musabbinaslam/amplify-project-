const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireQaOrAdmin } = require('../middleware/requireQaOrAdmin');
const adminController = require('../controllers/adminController');
const qaReviewController = require('../controllers/qaReviewController');

const router = express.Router();

// All QA routes require a valid Firebase token AND either 'admin' or 'qa' role.
router.use(verifyFirebaseToken);
router.use(requireQaOrAdmin);

// ── Read-only analytics & live ops (same controllers as /api/admin) ────────
router.get('/overview-lite', adminController.getOverviewLite);
router.get('/analytics-bundle', adminController.getAnalyticsBundle);
router.get('/analytics-drilldown', adminController.getAnalyticsDrilldown);
router.get('/live-calls', adminController.getLiveCalls);

// AI coaching visibility (read-only)
router.get('/ai-training/coaching-overview', adminController.getAiCoachingOverview);
router.get('/ai-training/agent-plans', adminController.getAiCoachingAgentPlans);

// Agent emergency management (operational tool, QA-accessible)
router.post('/agents/:agentId/force-remove', adminController.forceRemoveAgent);

router.get('/reviews', qaReviewController.listQaReviews);
router.get('/reviews/pending-count', qaReviewController.countPendingQaReviews);
router.get('/reviews/status', qaReviewController.getQaPipelineStatus);
router.post('/reviews/:agentId/:callLogId/confirm', qaReviewController.confirmQaReview);
router.post('/reviews/:agentId/:callLogId/dismiss', qaReviewController.dismissQaReview);

module.exports = router;
