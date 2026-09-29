const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { postSupportEmail } = require('../controllers/supportEmailController');
const supportLiveController = require('../controllers/supportLiveController');
const {
  supportEmailLimiter,
  supportLiveLimiter,
} = require('../middleware/security');
const { handleSupportUpload } = require('../middleware/supportUpload');
const { handleSupportChatUpload } = require('../middleware/supportChatUpload');

const router = express.Router();
router.post(
  '/email',
  verifyFirebaseToken,
  supportEmailLimiter,
  handleSupportUpload,
  postSupportEmail
);

router.get('/conversations/me', verifyFirebaseToken, supportLiveController.getMyConversation);
router.get('/conversations/:id/messages', verifyFirebaseToken, supportLiveController.getMessages);
router.post(
  '/conversations/:id/messages',
  verifyFirebaseToken,
  supportLiveLimiter,
  supportLiveController.postMessage
);
router.post('/conversations/:id/read', verifyFirebaseToken, supportLiveController.markRead);
router.post(
  '/conversations/:id/media',
  verifyFirebaseToken,
  supportLiveLimiter,
  handleSupportChatUpload,
  supportLiveController.uploadMedia
);
router.get(
  '/conversations/:id/media/:mediaId',
  verifyFirebaseToken,
  supportLiveController.getMedia
);

module.exports = router;
