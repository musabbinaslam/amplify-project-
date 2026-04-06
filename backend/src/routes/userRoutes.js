const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const {
  getMe,
  patchMe,
  patchSettings,
  patchScript,
  postApiKey,
  postRegenerateApiKey,
  getSlugAvailability,
  getActivity,
} = require('../controllers/userController');

const router = express.Router();

router.use(verifyFirebaseToken);

router.get('/me', getMe);
router.patch('/me', patchMe);
router.get('/me/slug-availability', getSlugAvailability);
router.get('/me/activity', getActivity);
router.patch('/me/settings', patchSettings);
router.patch('/me/scripts/:scriptId', patchScript);
router.post('/me/api-key', postApiKey);
router.post('/me/api-key/regenerate', postRegenerateApiKey);

module.exports = router;
