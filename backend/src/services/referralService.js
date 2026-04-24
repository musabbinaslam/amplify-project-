/**
 * Referral Service
 *
 * Core business logic for the three-stage referral program.
 * All Firestore state transitions run inside transactions to prevent
 * double-rewarding on webhook retries.
 */

const crypto = require('crypto');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { FieldValue } = require('firebase-admin/firestore');
const { REFERRAL_CONFIG, SHARE_TEXT_TEMPLATE, REFERRAL_BASE_URL } = require('../config/referrals');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userRef(uid) {
  const db = getDb();
  if (!db) return null;
  return db.collection('users').doc(uid);
}

function generateRandomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function buildShareUrl(code) {
  return `${REFERRAL_BASE_URL}/signup?ref=${code}`;
}

function buildShareText(code) {
  const percent = Math.round(REFERRAL_CONFIG.discountPercent * REFERRAL_CONFIG.discountMultiplier);
  return SHARE_TEXT_TEMPLATE
    .replace('{{code}}', code)
    .replace('{{percent}}', String(percent))
    .replace('{{url}}', buildShareUrl(code));
}

// ─── Code Generation ──────────────────────────────────────────────────────────

/**
 * Lazily generates a referral code for a user if they don't already have one.
 * Handles collision by retrying up to 5 times.
 */
async function ensureReferralCode(uid) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const ref = userRef(uid);
  const snap = await ref.get();
  const existing = snap.data()?.referralCode;
  if (existing) return existing;

  // Generate + collision check
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${REFERRAL_CONFIG.codePrefix}-${generateRandomCode(REFERRAL_CONFIG.codeLength)}`;

    // Check uniqueness
    const dup = await db.collection('users')
      .where('referralCode', '==', code)
      .limit(1)
      .get();

    if (dup.empty) {
      await ref.set({ referralCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log(`[Referral] Generated code ${code} for user ${uid}`);
      return code;
    }
  }

  throw new Error('Failed to generate unique referral code after 5 attempts');
}

// ─── Code Resolution ──────────────────────────────────────────────────────────

/**
 * Resolves a referral code to its owner.
 * Returns { valid, referrerUid, referrerName } or { valid: false }.
 */
async function resolveCode(code) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { valid: false };

  const snap = await db.collection('users')
    .where('referralCode', '==', normalized)
    .limit(1)
    .get();

  if (snap.empty) return { valid: false };

  const doc = snap.docs[0];
  const data = doc.data() || {};

  // Check if referrer is blocked from referrals
  if (data.blockedFromReferrals) return { valid: false };

  return {
    valid: true,
    referrerUid: doc.id,
    referrerName: data.fullName || data.name || data.email?.split('@')[0] || 'A CallsFlow agent',
  };
}

// ─── Stage 1: Claim Referral ──────────────────────────────────────────────────

/**
 * Post-signup: attach a referral code to the newly created user.
 * Idempotent — calling twice with the same code is a no-op.
 */
async function claimReferral(refereeUid, referralCode) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const normalized = String(referralCode || '').trim().toUpperCase();
  if (!normalized) throw new Error('Referral code is required');

  // Resolve the code to a referrer
  const resolution = await resolveCode(normalized);
  if (!resolution.valid) throw new Error('Invalid referral code');

  const referrerUid = resolution.referrerUid;

  // ── Anti-Abuse: Self-referral block ──
  if (referrerUid === refereeUid) {
    throw new Error('You cannot use your own referral code');
  }

  // Check referee email vs referrer email
  const [refereeSnap, referrerSnap] = await Promise.all([
    userRef(refereeUid).get(),
    userRef(referrerUid).get(),
  ]);

  const refereeData = refereeSnap.data() || {};
  const referrerData = referrerSnap.data() || {};

  if (refereeData.email && referrerData.email &&
      refereeData.email.toLowerCase() === referrerData.email.toLowerCase()) {
    throw new Error('Cannot use a referral code from an account with the same email');
  }

  // Check if referee already has a referral
  if (refereeData.referredBy) {
    // Idempotent — if same code, just return silently
    if (refereeData.referredByCode === normalized) return { alreadyClaimed: true };
    throw new Error('You have already used a referral code');
  }

  // Check if referee is blocked
  if (refereeData.blockedFromReferrals) {
    throw new Error('Your account is not eligible for referral rewards');
  }

  // Check referrer's referral cap
  const referrerStats = referrerData.referralStats || {};
  if ((referrerStats.signups || 0) >= REFERRAL_CONFIG.maxReferralsPerUser) {
    throw new Error('This referral code has reached its maximum usage limit');
  }

  // ── Write in a transaction ──
  await db.runTransaction(async (t) => {
    // Re-read inside transaction
    const freshReferee = await t.get(userRef(refereeUid));
    if (freshReferee.data()?.referredBy) return; // already claimed

    // Update referee doc (track who referred them, no discount fields here)
    t.set(userRef(refereeUid), {
      referredBy: referrerUid,
      referredByCode: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create referral entry in referrer's subcollection
    const referralRef = userRef(referrerUid).collection('referrals').doc(refereeUid);
    t.set(referralRef, {
      refereeUid,
      refereeName: refereeData.fullName || refereeData.name || null,
      refereeEmail: refereeData.email || null,
      status: 'pending',
      discountPercent: Math.round(REFERRAL_CONFIG.discountPercent * REFERRAL_CONFIG.discountMultiplier),
      signupAt: FieldValue.serverTimestamp(),
      firstPaymentAt: null,
      wentLiveAt: null,
      discountAppliedAt: null,
      discountSavedCents: null,
    });

    // Increment referrer's signup count
    t.set(userRef(referrerUid), {
      referralStats: { signups: FieldValue.increment(1) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  console.log(`[Referral] Stage 1: User ${refereeUid} claimed code ${normalized} (referrer: ${referrerUid})`);
  return { claimed: true };
}

// ─── Stage 2: First Payment → Qualified ───────────────────────────────────────

/**
 * Called from Stripe webhook after a successful payment.
 * Only advances if the user was referred and status is 'pending'.
 */
async function advanceToQualified(refereeUid, amountCents = 0) {
  const db = getDb();
  if (!db) return;

  const refereeSnap = await userRef(refereeUid).get();
  const refereeData = refereeSnap.data() || {};

  // Not a referred user — skip silently
  if (!refereeData.referredBy) return;

  const referrerUid = refereeData.referredBy;

  // Check minimum spend
  if (amountCents < REFERRAL_CONFIG.minQualifyingSpendCents) {
    console.log(`[Referral] Stage 2 skipped: payment $${(amountCents / 100).toFixed(2)} below minimum $${(REFERRAL_CONFIG.minQualifyingSpendCents / 100).toFixed(2)}`);
    return;
  }

  // Check current referral status
  const referralRef = userRef(referrerUid).collection('referrals').doc(refereeUid);

  await db.runTransaction(async (t) => {
    const referralSnap = await t.get(referralRef);
    if (!referralSnap.exists) return;

    const referralData = referralSnap.data() || {};
    if (referralData.status !== 'pending') return; // already advanced

    t.update(referralRef, {
      status: 'qualified',
      firstPaymentAt: FieldValue.serverTimestamp(),
    });
  });

  console.log(`[Referral] Stage 2: User ${refereeUid} qualified (first payment ≥ $${(REFERRAL_CONFIG.minQualifyingSpendCents / 100).toFixed(2)})`);
}

// ─── Stage 3: Goes Live → Unlock Discount ─────────────────────────────────────

/**
 * Called from voice controller after a completed call.
 * Only advances if the user was referred and status is 'qualified'.
 * The discount is awarded to the REFERRER (the person who sent the link).
 */
async function advanceToLive(refereeUid) {
  const db = getDb();
  if (!db) return;

  const refereeSnap = await userRef(refereeUid).get();
  const refereeData = refereeSnap.data() || {};

  if (!refereeData.referredBy) return;

  const referrerUid = refereeData.referredBy;

  // Check if referrer already has an active discount from this referral
  const referrerSnap = await userRef(referrerUid).get();
  const referrerData = referrerSnap.data() || {};
  // If referrer already has a pending discount, still update the referral status
  // but don't overwrite their existing discount

  const referralRef = userRef(referrerUid).collection('referrals').doc(refereeUid);

  const discountPercent = Math.round(REFERRAL_CONFIG.discountPercent * REFERRAL_CONFIG.discountMultiplier);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFERRAL_CONFIG.discountExpiryDays);

  await db.runTransaction(async (t) => {
    const referralSnap = await t.get(referralRef);
    if (!referralSnap.exists) return;

    const referralData = referralSnap.data() || {};
    if (referralData.status !== 'qualified') return;

    // Update referral doc
    t.update(referralRef, {
      status: 'live',
      wentLiveAt: FieldValue.serverTimestamp(),
    });

    // Set pending discount on REFERRER's user doc (not the referee!)
    // Only set if referrer doesn't already have an unused discount
    const freshReferrer = await t.get(userRef(referrerUid));
    const freshReferrerData = freshReferrer.data() || {};
    if (!freshReferrerData.pendingDiscountPercent || freshReferrerData.discountUsed) {
      t.set(userRef(referrerUid), {
        pendingDiscountPercent: discountPercent,
        pendingDiscountExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        discountUsed: false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // Increment referrer's qualified count
    t.set(userRef(referrerUid), {
      referralStats: { qualified: FieldValue.increment(1) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  console.log(`[Referral] Stage 3: Referee ${refereeUid} went live — ${discountPercent}% discount unlocked for REFERRER ${referrerUid} (expires ${expiresAt.toISOString().slice(0, 10)})`);
}

// ─── Discount Logic ───────────────────────────────────────────────────────────

/**
 * Returns the current discount status for a user.
 */
async function getDiscountStatus(uid) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');

  const snap = await ref.get();
  const data = snap.data() || {};

  const percent = data.pendingDiscountPercent || 0;
  const expiresAt = data.pendingDiscountExpiresAt?.toDate?.() || null;
  const used = data.discountUsed === true;

  if (!percent || used) {
    return { hasDiscount: false, percent: 0, expiresAt: null, expired: false, used };
  }

  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  return {
    hasDiscount: !expired,
    percent,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    expired,
    used,
  };
}

/**
 * Calculates the discounted amount.
 */
function calculateDiscount(originalAmountCents, discountPercent) {
  const savings = Math.round(originalAmountCents * (discountPercent / 100));
  return {
    originalAmountCents,
    discountedAmountCents: originalAmountCents - savings,
    savedCents: savings,
    discountPercent,
  };
}

/**
 * Marks the discount as used after a successful discounted purchase.
 * The discount lives on the REFERRER's doc (the person making the purchase).
 * Writes a referral_discount wallet transaction for the bonus credits.
 */
async function markDiscountUsed(uid, savedCents, metadata = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const ref = userRef(uid);
  const snap = await ref.get();
  const data = snap.data() || {};

  // uid here is the referrer (the person who has the discount on their doc)
  if (!data.pendingDiscountPercent || data.discountUsed) return;

  await db.runTransaction(async (t) => {
    // Clear discount on the user's doc
    t.set(ref, {
      pendingDiscountPercent: 0,
      discountUsed: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Find and update the referral entry that triggered this discount
    // We look through the user's referrals subcollection for a 'live' status entry
    const referralsSnap = await t.get(
      ref.collection('referrals').where('status', '==', 'live').limit(1)
    );
    // Note: Firestore transactions don't support queries directly in all SDKs.
    // We'll update outside the transaction if needed.
  });

  // Update the referral entry outside transaction (find the 'live' one)
  try {
    const referralsSnap = await ref.collection('referrals')
      .where('status', '==', 'live')
      .limit(1)
      .get();
    if (!referralsSnap.empty) {
      await referralsSnap.docs[0].ref.update({
        status: 'discount_applied',
        discountAppliedAt: FieldValue.serverTimestamp(),
        discountSavedCents: savedCents,
      });
    }
  } catch (err) {
    console.warn('[Referral] Failed to update referral entry status:', err.message);
  }

  // Write a bonus wallet transaction for the saved amount
  const walletService = require('./walletService');
  const idempotencyKey = `referral_discount_${uid}_${Date.now()}`;
  await walletService.addCredits(uid, savedCents, 'referral_discount', {
    idempotencyKey,
    ...metadata,
  });

  console.log(`[Referral] Discount applied for REFERRER ${uid}: saved $${(savedCents / 100).toFixed(2)} as bonus credits`);
}

// ─── Dashboard / API ──────────────────────────────────────────────────────────

/**
 * Returns the referral dashboard data for a user.
 */
async function getReferralDashboard(uid) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const code = await ensureReferralCode(uid);
  const shareUrl = buildShareUrl(code);
  const shareText = buildShareText(code);

  // Get stats
  const snap = await userRef(uid).get();
  const data = snap.data() || {};
  const stats = data.referralStats || { signups: 0, qualified: 0 };

  // Get recent referrals
  const referralsSnap = await userRef(uid)
    .collection('referrals')
    .orderBy('signupAt', 'desc')
    .limit(50)
    .get();

  const recent = referralsSnap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      refereeUid: doc.id,
      refereeName: maskName(d.refereeName),
      refereeEmail: maskEmail(d.refereeEmail),
      status: d.status || 'pending',
      discountPercent: d.discountPercent || 0,
      signupAt: d.signupAt?.toDate?.() ? d.signupAt.toDate().toISOString() : null,
      firstPaymentAt: d.firstPaymentAt?.toDate?.() ? d.firstPaymentAt.toDate().toISOString() : null,
      wentLiveAt: d.wentLiveAt?.toDate?.() ? d.wentLiveAt.toDate().toISOString() : null,
      discountAppliedAt: d.discountAppliedAt?.toDate?.() ? d.discountAppliedAt.toDate().toISOString() : null,
      discountSavedCents: d.discountSavedCents || null,
    };
  });

  // Get pending count
  const pendingCount = recent.filter((r) => r.status === 'pending' || r.status === 'qualified').length;

  return {
    code,
    shareUrl,
    shareText,
    stats: {
      signups: stats.signups || 0,
      qualified: stats.qualified || 0,
      pending: pendingCount,
    },
    recent,
    config: {
      discountPercent: Math.round(REFERRAL_CONFIG.discountPercent * REFERRAL_CONFIG.discountMultiplier),
      expiryDays: REFERRAL_CONFIG.discountExpiryDays,
    },
  };
}

/**
 * Returns top N referrers for the leaderboard.
 */
async function getLeaderboard(limit = 10) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const snap = await db.collection('users')
    .where('referralStats.qualified', '>', 0)
    .orderBy('referralStats.qualified', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc, index) => {
    const data = doc.data() || {};
    const name = data.fullName || data.name || data.email?.split('@')[0] || 'Agent';
    const parts = name.split(' ');
    const displayName = parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1][0]}.`
      : parts[0];

    return {
      rank: index + 1,
      displayName,
      qualified: data.referralStats?.qualified || 0,
      signups: data.referralStats?.signups || 0,
    };
  });
}

// ─── Admin Functions ──────────────────────────────────────────────────────────

/**
 * Admin: Get referral overview metrics.
 */
async function getAdminReferralOverview() {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const usersSnap = await db.collection('users').get();
  let totalSignupsWithCode = 0;
  let totalQualified = 0;
  let totalDiscountsRedeemed = 0;
  let totalPending = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data() || {};
    const stats = data.referralStats || {};
    totalSignupsWithCode += stats.signups || 0;
    totalQualified += stats.qualified || 0;

    // Check referrals subcollection for this user
    const referralsSnap = await doc.ref.collection('referrals').get();
    for (const refDoc of referralsSnap.docs) {
      const refData = refDoc.data() || {};
      if (refData.status === 'discount_applied') totalDiscountsRedeemed++;
      if (refData.status === 'pending' || refData.status === 'qualified') totalPending++;
    }
  }

  return {
    totalSignupsWithCode,
    totalQualified,
    totalDiscountsRedeemed,
    totalPending,
    stage2ConversionRate: totalSignupsWithCode > 0
      ? Number(((totalQualified / totalSignupsWithCode) * 100).toFixed(1))
      : 0,
  };
}

/**
 * Admin: Search referrals by uid or email.
 */
async function searchReferrals(query = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const search = String(query.search || '').trim().toLowerCase();
  const statusFilter = String(query.status || '').trim().toLowerCase();

  const usersSnap = await db.collection('users').get();
  const results = [];

  for (const doc of usersSnap.docs) {
    const referralsSnap = await doc.ref.collection('referrals').get();
    for (const refDoc of referralsSnap.docs) {
      const refData = refDoc.data() || {};
      const referrerData = doc.data() || {};

      // Status filter
      if (statusFilter && statusFilter !== 'all' && refData.status !== statusFilter) continue;

      // Search filter
      if (search) {
        const haystack = `${refDoc.id} ${refData.refereeEmail || ''} ${doc.id} ${referrerData.email || ''}`.toLowerCase();
        if (!haystack.includes(search)) continue;
      }

      results.push({
        referralId: `${doc.id}/${refDoc.id}`,
        referrerUid: doc.id,
        referrerEmail: referrerData.email || null,
        referrerName: referrerData.fullName || referrerData.name || null,
        refereeUid: refDoc.id,
        refereeEmail: refData.refereeEmail || null,
        refereeName: refData.refereeName || null,
        status: refData.status || 'pending',
        discountPercent: refData.discountPercent || 0,
        discountSavedCents: refData.discountSavedCents || null,
        signupAt: refData.signupAt?.toDate?.() ? refData.signupAt.toDate().toISOString() : null,
        firstPaymentAt: refData.firstPaymentAt?.toDate?.() ? refData.firstPaymentAt.toDate().toISOString() : null,
        wentLiveAt: refData.wentLiveAt?.toDate?.() ? refData.wentLiveAt.toDate().toISOString() : null,
        discountAppliedAt: refData.discountAppliedAt?.toDate?.() ? refData.discountAppliedAt.toDate().toISOString() : null,
      });
    }
  }

  return results.sort((a, b) => {
    const aDate = a.signupAt || '';
    const bDate = b.signupAt || '';
    return bDate.localeCompare(aDate);
  }).slice(0, 100);
}

/**
 * Admin: Update referral status.
 */
async function updateReferralStatus(referrerUid, refereeUid, newStatus, reason = '') {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const validStatuses = ['pending', 'qualified', 'live', 'discount_applied', 'blocked', 'reversed'];
  if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

  const referralRef = userRef(referrerUid).collection('referrals').doc(refereeUid);
  const snap = await referralRef.get();
  if (!snap.exists) throw new Error('Referral not found');

  await referralRef.update({
    status: newStatus,
    adminOverrideReason: reason || null,
    adminOverrideAt: FieldValue.serverTimestamp(),
  });

  // If blocked or reversed, also remove the pending discount from the REFERRER
  if (newStatus === 'blocked' || newStatus === 'reversed') {
    await userRef(referrerUid).set({
      pendingDiscountPercent: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  console.log(`[Referral] Admin: Status updated to "${newStatus}" for ${referrerUid}/${refereeUid}. Reason: ${reason || 'N/A'}`);
}

/**
 * Admin: Manually grant a discount to a user.
 */
async function grantDiscount(uid, percent = REFERRAL_CONFIG.discountPercent) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFERRAL_CONFIG.discountExpiryDays);

  await userRef(uid).set({
    pendingDiscountPercent: percent,
    pendingDiscountExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    discountUsed: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`[Referral] Admin: Granted ${percent}% discount to user ${uid}`);
}

/**
 * Admin: Revoke a pending discount from a user.
 */
async function revokeDiscount(uid) {
  await userRef(uid).set({
    pendingDiscountPercent: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`[Referral] Admin: Revoked discount from user ${uid}`);
}

// ─── Privacy Helpers ──────────────────────────────────────────────────────────

function maskEmail(email) {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';
  const local = parts[0];
  const masked = local[0] + '***';
  return `${masked}@${parts[1]}`;
}

function maskName(name) {
  if (!name) return null;
  const parts = name.trim().split(' ');
  if (parts.length === 1) return `${parts[0][0]}***`;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

module.exports = {
  ensureReferralCode,
  resolveCode,
  claimReferral,
  advanceToQualified,
  advanceToLive,
  getDiscountStatus,
  calculateDiscount,
  markDiscountUsed,
  getReferralDashboard,
  getLeaderboard,
  getAdminReferralOverview,
  searchReferrals,
  updateReferralStatus,
  grantDiscount,
  revokeDiscount,
};
