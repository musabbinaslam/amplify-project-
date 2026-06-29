const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAdmin);

router.get('/overview-lite', adminController.getOverviewLite);
router.get('/analytics-bundle', adminController.getAnalyticsBundle);
router.get('/analytics-drilldown', adminController.getAnalyticsDrilldown);
router.get('/live-calls', adminController.getLiveCalls);
router.post('/agents/:agentId/force-remove', adminController.forceRemoveAgent);
router.post('/agents/:agentId/flag', adminController.flagAgent);
router.post('/agents/:agentId/resume', adminController.resumeAgent);
router.get('/ai-training/coaching-overview', adminController.getAiCoachingOverview);
router.get('/ai-training/agent-plans', adminController.getAiCoachingAgentPlans);
router.get('/dids', adminController.listDids);
router.post('/dids', adminController.createDid);
router.patch('/dids/:id', adminController.patchDid);
router.delete('/dids/:id', adminController.deleteDid);

// Referral admin
router.get('/referrals', adminController.getReferralOverview);
router.get('/referrals/search', adminController.searchReferrals);
router.patch('/referrals/:referralId/status', adminController.updateReferralStatus);
router.post('/referrals/grant-discount', adminController.grantDiscount);
router.post('/referrals/revoke-discount', adminController.revokeDiscount);
router.post('/notifications/broadcast', adminController.postBroadcastNotification);
router.get('/notifications/broadcasts', adminController.getBroadcastNotifications);
router.get('/notifications/broadcasts/:id', adminController.getBroadcastNotification);
router.patch('/notifications/broadcasts/:id', adminController.patchBroadcastNotification);
router.delete('/notifications/broadcasts/:id', adminController.deleteBroadcastNotification);
router.get('/maintenance', adminController.getMaintenance);
router.patch('/maintenance', adminController.patchMaintenance);

// Pool debug — dumps full Redis routing state for diagnosis
router.get('/pool-debug', adminController.getPoolDebug);
router.get('/call-contests', adminController.listCallContests);
router.get('/call-contests/:contestId', adminController.getCallContest);
router.post('/call-contests/:contestId/approve', adminController.approveCallContest);
router.post('/call-contests/:contestId/deny', adminController.denyCallContest);
router.post('/call-logs/refund', adminController.refundCall);

module.exports = router;
