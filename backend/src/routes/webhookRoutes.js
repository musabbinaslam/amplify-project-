const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Define the Trackdrive incoming webhook posting endpoint
router.post('/trackdrive', webhookController.handleTrackdrivePost);

module.exports = router;
