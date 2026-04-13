const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { postSupportChat } = require('../controllers/supportChatController');
const { supportChatLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/chat', verifyFirebaseToken, supportChatLimiter, postSupportChat);

module.exports = router;
