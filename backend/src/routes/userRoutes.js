const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const {
  getMe,
  getMeBootstrap,
  patchMe,
  patchSettings,
  patchScript,
  postApiKey,
  postRegenerateApiKey,
  getSlugAvailability,
  getActivity,
  getQaSummary,
  getQaTrend,
  getQaScorecards,
  getQaPatterns,
} = require('../controllers/userController');

const router = express.Router();

router.use(verifyFirebaseToken);

router.get('/me', getMe);
router.get('/me/bootstrap', getMeBootstrap);
router.patch('/me', patchMe);
router.get('/me/slug-availability', getSlugAvailability);
router.get('/me/activity', getActivity);
router.get('/me/qa/summary', getQaSummary);
router.get('/me/qa/trend', getQaTrend);
router.get('/me/qa/scorecards', getQaScorecards);
router.get('/me/qa/patterns', getQaPatterns);
router.patch('/me/settings', patchSettings);
router.patch('/me/scripts/:scriptId', patchScript);
router.post('/me/api-key', postApiKey);
router.post('/me/api-key/regenerate', postRegenerateApiKey);

module.exports = router;
