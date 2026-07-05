const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAdmin);

router.get('/overview-lite', adminController.getOverviewLite);
router.get('/users/all-lite', adminController.listAllUsersLite);
router.get('/analytics-bundle', adminController.getAnalyticsBundle);
router.get('/analytics-drilldown', adminController.getAnalyticsDrilldown);
router.get('/live-calls', adminController.getLiveCalls);
router.post('/agents/:agentId/force-remove', adminController.forceRemoveAgent);

// Manager role administration — list all users + set role/managedAgents allowlist
router.get('/users', adminController.getAllUsers);
router.get('/managers', adminController.listManagerTeams);
router.get('/managers/:uid', adminController.getManagerTeam);
router.patch('/users/:uid/manager-settings', adminController.patchManagerSettings);

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

module.exports = router;
