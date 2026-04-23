const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { postSupportChat } = require('../controllers/supportChatController');
const { postSupportEmail } = require('../controllers/supportEmailController');
const { supportChatLimiter, supportEmailLimiter } = require('../middleware/security');
const { handleSupportUpload } = require('../middleware/supportUpload');

const router = express.Router();

router.post('/chat', verifyFirebaseToken, supportChatLimiter, postSupportChat);
router.post(
    '/email',
    verifyFirebaseToken,
    supportEmailLimiter,
    handleSupportUpload,
    postSupportEmail
);

module.exports = router;
