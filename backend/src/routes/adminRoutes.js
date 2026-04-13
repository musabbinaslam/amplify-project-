const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAdmin);

router.get('/overview-lite', adminController.getOverviewLite);
router.get('/analytics-bundle', adminController.getAnalyticsBundle);
router.get('/live-calls', adminController.getLiveCalls);
router.get('/ai-training/coaching-overview', adminController.getAiCoachingOverview);
router.get('/ai-training/agent-plans', adminController.getAiCoachingAgentPlans);
router.get('/dids', adminController.listDids);
router.post('/dids', adminController.createDid);
router.patch('/dids/:id', adminController.patchDid);
router.delete('/dids/:id', adminController.deleteDid);

module.exports = router;
