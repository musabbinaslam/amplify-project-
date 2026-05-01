const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { aiTrainingReadLimiter, aiTrainingWriteLimiter } = require('../middleware/security');
const {
  getMe,
  getMeBootstrap,
  patchMe,
  postWelcomeEmail,
  patchSettings,
  patchScript,
  postApiKey,
  postRegenerateApiKey,
  getSlugAvailability,
  getActivity,
  getNotifications,
  patchNotificationRead,
  patchNotificationsReadAll,
  getMaintenance,
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
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listCustomScripts,
  createCustomScript,
  uploadCustomScript,
  updateCustomScript,
  deleteCustomScript,
} = require('../controllers/userController');
const multer = require('multer');
const os = require('os');

const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

router.use(verifyFirebaseToken);

router.get('/me', getMe);
router.get('/me/bootstrap', getMeBootstrap);
router.patch('/me', patchMe);
router.post('/me/welcome-email', postWelcomeEmail);
router.get('/me/slug-availability', getSlugAvailability);
router.get('/me/activity', getActivity);
router.get('/me/notifications', getNotifications);
router.patch('/me/notifications/read-all', patchNotificationsReadAll);
router.patch('/me/notifications/:id/read', patchNotificationRead);
router.get('/me/maintenance', getMaintenance);
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
router.get('/me/notes', listNotes);
router.post('/me/notes', createNote);
router.put('/me/notes/:noteId', updateNote);
router.delete('/me/notes/:noteId', deleteNote);
router.post('/me/api-key', postApiKey);
router.post('/me/api-key/regenerate', postRegenerateApiKey);

router.get('/me/custom-scripts', listCustomScripts);
router.post('/me/custom-scripts', createCustomScript);
router.post('/me/custom-scripts/upload', upload.single('file'), uploadCustomScript);
router.put('/me/custom-scripts/:scriptId', updateCustomScript);
router.delete('/me/custom-scripts/:scriptId', deleteCustomScript);

module.exports = router;
