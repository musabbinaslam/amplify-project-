const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const {
  getMe,
  patchMe,
  patchSettings,
  patchScript,
  postApiKey,
} = require('../controllers/userController');

const router = express.Router();

router.use(verifyFirebaseToken);

router.get('/me', getMe);
router.patch('/me', patchMe);
router.patch('/me/settings', patchSettings);
router.patch('/me/scripts/:scriptId', patchScript);
router.post('/me/api-key', postApiKey);

module.exports = router;
