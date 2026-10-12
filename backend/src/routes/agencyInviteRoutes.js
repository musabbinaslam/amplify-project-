const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const {
  agencyInviteResolveLimiter,
  agencyInviteClaimLimiter,
} = require('../middleware/security');
const agencyController = require('../controllers/agencyController');

const router = express.Router();

// Public resolve (also mirrored under /api/public/agency-invites/:code)
router.get('/resolve/:code', agencyInviteResolveLimiter, agencyController.resolveAgencyInvite);

router.use(verifyFirebaseToken);
router.post('/claim', agencyInviteClaimLimiter, agencyController.claimAgencyInvite);

module.exports = router;
