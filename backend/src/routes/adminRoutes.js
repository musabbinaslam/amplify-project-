const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireAdmin);

router.get('/overview', adminController.getOverview);
router.get('/agents', adminController.getAgents);
router.get('/campaigns', adminController.getCampaignsList);
router.get('/call-stats', adminController.getCallStats);
router.get('/call-stats/campaigns', adminController.getCampaignCallStats);
router.get('/call-stats/agents', adminController.getAgentCallStats);
router.get('/live-calls', adminController.getLiveCalls);
router.get('/dids', adminController.listDids);
router.post('/dids', adminController.createDid);
router.patch('/dids/:id', adminController.patchDid);
router.delete('/dids/:id', adminController.deleteDid);

module.exports = router;
