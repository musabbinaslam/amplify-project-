const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireSupportOrAdmin } = require('../middleware/requireSupportOrAdmin');
const { supportLiveLimiter } = require('../middleware/security');
const { handleSupportChatUpload } = require('../middleware/supportChatUpload');
const supportDeskController = require('../controllers/supportDeskController');

const router = express.Router();

router.use(verifyFirebaseToken);
router.use(requireSupportOrAdmin);

router.get('/conversations', supportDeskController.listConversations);
router.get('/kpis', supportDeskController.getKpis);
router.get('/conversations/:id/messages', supportDeskController.getMessages);
router.post(
  '/conversations/:id/media',
  supportLiveLimiter,
  handleSupportChatUpload,
  supportDeskController.uploadMedia
);
router.get('/conversations/:id/media/:mediaId', supportDeskController.getMedia);
router.post('/conversations/:id/messages', supportLiveLimiter, supportDeskController.postMessage);
router.post('/conversations/:id/read', supportDeskController.markRead);
router.post('/conversations/:id/claim', supportDeskController.claimConversation);
router.post('/conversations/:id/close', supportDeskController.closeConversation);

module.exports = router;
