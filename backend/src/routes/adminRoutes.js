const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const qaReviewController = require('../controllers/qaReviewController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAdmin);

router.get('/overview-lite', adminController.getOverviewLite);
router.get('/users/all-lite', adminController.listAllUsersLite);
router.get('/analytics-bundle', adminController.getAnalyticsBundle);
router.get('/analytics-drilldown', adminController.getAnalyticsDrilldown);
router.get('/live-calls', adminController.getLiveCalls);
router.get('/agents', adminController.listAgentsDirectory);
router.post('/agents/:agentId/force-remove', adminController.forceRemoveAgent);

// Manager role administration — list all users + set role/managedAgents allowlist
router.get('/users', adminController.getAllUsers);
router.get('/managers', adminController.listManagerTeams);
router.get('/managers/:uid', adminController.getManagerTeam);
router.patch('/users/:uid/manager-settings', adminController.patchManagerSettings);

router.post('/agents/:agentId/flag', adminController.flagAgent);
router.post('/agents/:agentId/resume', adminController.resumeAgent);
router.patch('/agents/:agentId/pause', adminController.toggleAgentPause);
router.get('/ai-training/coaching-overview', adminController.getAiCoachingOverview);
router.get('/ai-training/agent-plans', adminController.getAiCoachingAgentPlans);
router.get('/dids', adminController.listDids);
router.post('/dids', adminController.createDid);
// router.patch('/users/:uid/notes/:noteId', adminController.patchUserNote);
// router.delete('/users/:uid/notes/:noteId', adminController.deleteUserNote);

router.patch('/users/:uid/call-logs/:callLogId/disposition', adminController.patchAdminCallLogDisposition);

// Settings & Config
// router.get('/settings', adminController.getAdminSettings);
router.patch('/dids/:id', adminController.patchDid);
router.delete('/dids/:id', adminController.deleteDid);

// Referral admin
router.get('/referrals', adminController.getReferralOverview);
router.get('/referrals/search', adminController.searchReferrals);
router.patch('/referrals/:referralId/status', adminController.updateReferralStatus);
router.post('/referrals/grant-discount', adminController.grantDiscount);
router.post('/referrals/revoke-discount', adminController.revokeDiscount);
router.post('/notifications/broadcast', adminController.postBroadcastNotification);
router.post('/notifications/targeted', adminController.postTargetedNotification);
router.get('/notifications/broadcasts', adminController.getBroadcastNotifications);
router.get('/notifications/broadcasts/:id', adminController.getBroadcastNotification);
router.patch('/notifications/broadcasts/:id', adminController.patchBroadcastNotification);
router.delete('/notifications/broadcasts/:id', adminController.deleteBroadcastNotification);
router.get('/maintenance', adminController.getMaintenance);
router.patch('/maintenance', adminController.patchMaintenance);
router.get('/campaign-controls', adminController.getCampaignControls);
router.patch('/campaign-controls/:campaignId', adminController.patchCampaignControls);
router.post('/campaigns', adminController.upsertCampaign);
router.delete('/campaigns/:campaignId', adminController.deleteCampaign);



// Pool debug — dumps full Redis routing state for diagnosis
router.get('/pool-debug', adminController.getPoolDebug);
router.get('/call-contests', adminController.listCallContests);
router.get('/call-contests/:contestId', adminController.getCallContest);
router.post('/call-contests/:contestId/approve', adminController.approveCallContest);
router.post('/call-contests/:contestId/deny', adminController.denyCallContest);
router.post('/call-logs/refund', adminController.refundCall);

router.get('/qa-rules', qaReviewController.listQaRules);
router.post('/qa-rules', qaReviewController.createQaRule);
router.patch('/qa-rules/:ruleId', qaReviewController.updateQaRule);
router.delete('/qa-rules/:ruleId', qaReviewController.deleteQaRule);
router.get('/qa-reviews', qaReviewController.listQaReviews);
router.get('/qa-reviews/pending-count', qaReviewController.countPendingQaReviews);
router.get('/qa-reviews/status', qaReviewController.getQaPipelineStatus);
router.patch('/qa-reviews/enabled', qaReviewController.setQaReviewsEnabled);
router.post('/qa-reviews/backfill', qaReviewController.backfillQaAudioReviews);
router.post('/qa-reviews/reanalyze-batch', qaReviewController.reanalyzeQaAudioReviewBatch);
router.post('/qa-reviews/:agentId/:callLogId/reanalyze', qaReviewController.reanalyzeQaAudioReview);
router.post('/qa-reviews/:agentId/:callLogId/confirm', qaReviewController.confirmQaReview);
router.post('/qa-reviews/:agentId/:callLogId/dismiss', qaReviewController.dismissQaReview);

// Agency management
const agencyController = require('../controllers/agencyController');
router.get('/agencies', agencyController.listAgencies);
router.post('/agencies', agencyController.createAgency);
router.get('/agencies/:id', agencyController.getAgency);
router.patch('/agencies/:id', agencyController.updateAgency);
router.delete('/agencies/:id', agencyController.deleteAgency);
router.get('/agencies/:id/members', agencyController.listAgencyMembers);
router.post('/agencies/:id/members', agencyController.assignAgencyMember);
router.patch('/agencies/:id/members/:uid', agencyController.updateAgencyMemberRole);
router.delete('/agencies/:id/members/:uid', agencyController.removeAgencyMember);
router.post('/agencies/:id/lock-campaigns', agencyController.lockCampaignsForAgency);
router.get('/agencies/:id/dids', agencyController.listAgencyDids);
router.post('/agencies/:id/dids', agencyController.assignAgencyDid);

// Suspicious drop pattern review
const suspiciousController = require('../controllers/suspiciousController');
router.get('/suspicious-agents', suspiciousController.listSuspiciousAgents);
router.post('/suspicious-agents/:agentId/dismiss', suspiciousController.dismissSuspiciousAgent);
router.post('/suspicious-agents/:agentId/force-charge', suspiciousController.forceChargeSuspiciousAgent);

module.exports = router;

