const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { aiTrainingReadLimiter, aiTrainingWriteLimiter } = require('../middleware/security');
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
  getAiTrainingSummary,
  getAiTrainingTrend,
  getAiTrainingScorecards,
  getAiTrainingDrills,
  postAiTrainingDrillStatus,
  getAiCoachingPlan,
  patchAiCoachingTask,
  getAiCoachingImpact,
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
router.get('/me/ai-training/summary', aiTrainingReadLimiter, getAiTrainingSummary);
router.get('/me/ai-training/trend', aiTrainingReadLimiter, getAiTrainingTrend);
router.get('/me/ai-training/scorecards', aiTrainingReadLimiter, getAiTrainingScorecards);
router.get('/me/ai-training/drills', aiTrainingReadLimiter, getAiTrainingDrills);
router.post('/me/ai-training/drills/:drillId/status', aiTrainingWriteLimiter, postAiTrainingDrillStatus);
router.get('/me/ai-training/coaching-plan', aiTrainingReadLimiter, getAiCoachingPlan);
router.patch('/me/ai-training/coaching-plan/tasks/:taskId', aiTrainingWriteLimiter, patchAiCoachingTask);
router.get('/me/ai-training/coaching-plan/impact', aiTrainingReadLimiter, getAiCoachingImpact);
router.patch('/me/settings', patchSettings);
router.patch('/me/scripts/:scriptId', patchScript);
router.post('/me/api-key', postApiKey);
router.post('/me/api-key/regenerate', postRegenerateApiKey);

module.exports = router;
