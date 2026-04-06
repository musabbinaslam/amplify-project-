const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { postSupportChat } = require('../controllers/supportChatController');

const router = express.Router();

router.post('/chat', verifyFirebaseToken, postSupportChat);

module.exports = router;
