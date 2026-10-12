const crypto = require('crypto');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { normalizeAgencyId, isPlatformRole } = require('../utils/tenancy');
const agencyCampaignService = require('./agencyCampaignService');

const COLLECTION = 'agencies';
const SLUG_LOCK_COLLECTION = 'agencySlugs';
const INVITE_LOCK_COLLECTION = 'agencyInviteCodes';
const AGENCY_STATUSES = new Set(['active', 'suspended', 'pending', 'rejected']);
const INVITE_CODE_PREFIX = 'AGENCY';
const INVITE_CODE_LENGTH = 6;
const CLIENT_BASE_URL = process.env.CLIENT_URL || 'https://callsflow.io';

function serializeDoc(doc) {
  const d = doc.data();
  if (!d) return { id: doc.id };
  const out = { id: doc.id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `agency-${Date.now()}`;
}

function normalizeStatus(status, { defaultStatus = 'active' } = {}) {
  const s = String(status || defaultStatus).trim().toLowerCase();
  return AGENCY_STATUSES.has(s) ? s : defaultStatus;
}

/** Agency can take calls, invite agents, and use ops dashboards. */
function isAgencyOperable(agencyOrStatus) {
  const status = typeof agencyOrStatus === 'string'
    ? agencyOrStatus
    : agencyOrStatus?.status;
  return status === 'active';
}

function generateRandomCode(length = INVITE_CODE_LENGTH) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function normalizeInviteCode(code) {
  return String(code || '').trim().toUpperCase();
}

function buildInviteShareUrl(code) {
  return `${CLIENT_BASE_URL}/signup?agency=${encodeURIComponent(normalizeInviteCode(code))}`;
}

function buildInviteJoinUrl(code) {
  return `${CLIENT_BASE_URL}/join/${encodeURIComponent(normalizeInviteCode(code))}`;
}

async function listAgencies({ status } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  let query = db.collection(COLLECTION);
  const normalized = status ? normalizeStatus(status, { defaultStatus: null }) : null;
  if (normalized && AGENCY_STATUSES.has(normalized)) {
    query = query.where('status', '==', normalized);
  }
  const snap = await query.get();
  return snap.docs
    .map((doc) => serializeDoc(doc))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function getAgencyById(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return serializeDoc(snap);
}

async function findAgencyByInviteCode(code) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  const snap = await db.collection(COLLECTION)
    .where('inviteCode', '==', normalized)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return serializeDoc(snap.docs[0]);
}

async function releaseInviteCodeLock(code) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return;
  const db = getDb();
  if (!db) return;
  try {
    await db.collection(INVITE_LOCK_COLLECTION).doc(normalized).delete();
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Claim a unique invite code via agencyInviteCodes/{code} lock + agencies query.
 * Optional agencyId is stored on the lock for debugging / future reclaim.
 */
async function generateUniqueInviteCode(agencyId = null) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${INVITE_CODE_PREFIX}-${generateRandomCode(INVITE_CODE_LENGTH)}`;
    // eslint-disable-next-line no-await-in-loop
    const dup = await db.collection(COLLECTION).where('inviteCode', '==', code).limit(1).get();
    if (!dup.empty) continue;

    const lockRef = db.collection(INVITE_LOCK_COLLECTION).doc(code);
    try {
      // eslint-disable-next-line no-await-in-loop
      await db.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists) throw new Error('TAKEN');
        tx.set(lockRef, {
          agencyId: agencyId ? String(agencyId) : null,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return code;
    } catch {
      // Collision on lock — try another code
    }
  }
  throw new Error('Failed to generate unique invite code');
}

async function ensureInviteCode(agencyId) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(agencyId));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Agency not found');
  if (!isAgencyOperable(snap.data())) {
    throw new Error('Invite codes are only available for active agencies');
  }
  const existing = snap.data()?.inviteCode;
  if (existing) return normalizeInviteCode(existing);

  const { FieldValue } = admin.firestore;
  const candidate = await generateUniqueInviteCode(agencyId);
  let finalCode = candidate;

  await db.runTransaction(async (tx) => {
    const live = await tx.get(ref);
    if (!live.exists) throw new Error('Agency not found');
    if (!isAgencyOperable(live.data())) {
      throw new Error('Invite codes are only available for active agencies');
    }
    const current = live.data()?.inviteCode;
    if (current) {
      finalCode = normalizeInviteCode(current);
      return;
    }
    tx.set(ref, {
      inviteCode: candidate,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    finalCode = candidate;
  });

  // Lost the race — another writer set a code; free the unused candidate lock.
  if (finalCode !== candidate) {
    await releaseInviteCodeLock(candidate);
  }

  return finalCode;
}

async function rotateInviteCode(agencyId) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('Agency not found');
  if (!isAgencyOperable(agency)) {
    throw new Error('Invite codes are only available for active agencies');
  }
  const { FieldValue } = admin.firestore;
  const oldCode = agency.inviteCode ? normalizeInviteCode(agency.inviteCode) : null;
  const code = await generateUniqueInviteCode(agencyId);
  await db.collection(COLLECTION).doc(String(agencyId)).set({
    inviteCode: code,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (oldCode && oldCode !== code) {
    await releaseInviteCodeLock(oldCode);
  }
  return {
    code,
    shareUrl: buildInviteShareUrl(code),
    joinUrl: buildInviteJoinUrl(code),
  };
}

async function resolveInviteCode(code) {
  const agency = await findAgencyByInviteCode(code);
  if (!agency || !isAgencyOperable(agency)) {
    return { valid: false };
  }
  return {
    valid: true,
    code: agency.inviteCode,
    name: agency.name,
    agencyId: agency.id,
  };
}

async function createAgency({
  name,
  slug,
  status = 'active',
  lockedCampaignIds = [],
  settings = {},
  createdByUid = null,
  application = null,
  inviteCode = null,
} = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Agency name is required');

  const { FieldValue } = admin.firestore;
  const finalSlug = slugify(slug || trimmedName);
  const agencyRef = db.collection(COLLECTION).doc();
  const slugRef = db.collection(SLUG_LOCK_COLLECTION).doc(finalSlug);

  const existingBySlug = await db.collection(COLLECTION).where('slug', '==', finalSlug).limit(1).get();
  if (!existingBySlug.empty) {
    await slugRef.set({
      agencyId: existingBySlug.docs[0].id,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new Error('An agency with this slug already exists');
  }

  const finalStatus = normalizeStatus(status, { defaultStatus: 'active' });
  let resolvedInvite = inviteCode ? normalizeInviteCode(inviteCode) : null;
  if (!resolvedInvite && finalStatus === 'active') {
    resolvedInvite = await generateUniqueInviteCode(agencyRef.id);
  }

  await db.runTransaction(async (tx) => {
    const slugSnap = await tx.get(slugRef);
    if (slugSnap.exists) throw new Error('An agency with this slug already exists');

    const payload = {
      name: trimmedName,
      slug: finalSlug,
      status: finalStatus,
      lockedCampaignIds: Array.isArray(lockedCampaignIds) ? lockedCampaignIds.filter(Boolean) : [],
      settings: settings && typeof settings === 'object' ? settings : {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (createdByUid) payload.createdByUid = String(createdByUid);
    if (application && typeof application === 'object') payload.application = application;
    if (resolvedInvite) payload.inviteCode = resolvedInvite;

    tx.set(slugRef, {
      agencyId: agencyRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(agencyRef, payload);
  });

  const created = await agencyRef.get();
  return serializeDoc(created);
}

/**
 * Self-serve agency-admin signup: pending agency + founder as agency_admin.
 * Runs in a transaction so parallel submits cannot create orphan agencies
 * or leave the user on a different membership.
 */
async function registerAgencyApplication(uid, { name, website } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Agency name is required');
  const websiteTrimmed = String(website || '').trim().slice(0, 200) || null;
  const finalSlug = slugify(trimmedName);

  const { FieldValue } = admin.firestore;
  const userRef = db.collection('users').doc(String(uid));
  const agencyRef = db.collection(COLLECTION).doc();
  const slugRef = db.collection(SLUG_LOCK_COLLECTION).doc(finalSlug);

  // Backfill slug lock for agencies created before agencySlugs existed.
  const existingBySlug = await db.collection(COLLECTION).where('slug', '==', finalSlug).limit(1).get();
  if (!existingBySlug.empty) {
    await slugRef.set({
      agencyId: existingBySlug.docs[0].id,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new Error('An agency with this slug already exists');
  }

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const slugSnap = await tx.get(slugRef);
    if (!userSnap.exists) throw new Error('Complete your profile before starting an agency');
    const user = userSnap.data() || {};

    if (normalizeAgencyId(user.agencyId)) {
      throw new Error('You are already assigned to an agency');
    }
    if (isPlatformRole(user.role)) {
      throw new Error('Platform staff cannot start an agency from this form');
    }
    if (slugSnap.exists) {
      throw new Error('An agency with this slug already exists');
    }

    const onboarding = user.onboarding && typeof user.onboarding === 'object' ? user.onboarding : {};
    const application = {
      founderUid: String(uid),
      founderName: user.fullName || user.displayName || user.name || null,
      founderEmail: user.email || null,
      phone: onboarding.phone || null,
      weeklySpend: onboarding.weeklySpend || null,
      usedInbound: onboarding.usedInbound || null,
      verticals: onboarding.verticals || null,
      hearAbout: onboarding.hearAbout || null,
      website: websiteTrimmed,
      submittedAt: new Date().toISOString(),
    };

    tx.set(slugRef, {
      agencyId: agencyRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(agencyRef, {
      name: trimmedName,
      slug: finalSlug,
      status: 'pending',
      lockedCampaignIds: [],
      settings: {},
      createdByUid: String(uid),
      application,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(userRef, {
      agencyId: agencyRef.id,
      agencyRole: 'agency_admin',
      role: 'agency_admin',
      managedAgents: [],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return getAgencyById(agencyRef.id);
}

async function approveAgency(agencyId, { reviewedBy } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('Agency not found');
  if (agency.status === 'active') {
    const code = await ensureInviteCode(agencyId);
    return { ...agency, inviteCode: code, status: 'active' };
  }
  if (agency.status !== 'pending' && agency.status !== 'rejected') {
    throw new Error(`Cannot approve agency with status "${agency.status}"`);
  }

  // After reapply, rejected shells are retired (slug rejected-{id}) and often empty —
  // approving them would create an active zombie with no founder.
  if (agency.status === 'rejected') {
    const slug = String(agency.slug || '');
    if (slug === `rejected-${agencyId}` || slug.startsWith('rejected-')) {
      throw new Error('This application was cleared for re-apply and can no longer be approved');
    }
    const memberCount = await countAgencyMembers(agencyId);
    if (memberCount === 0) {
      throw new Error('Cannot approve an agency with no members');
    }
  }

  const { FieldValue } = admin.firestore;
  const inviteCode = agency.inviteCode || await generateUniqueInviteCode(agencyId);
  await db.collection(COLLECTION).doc(String(agencyId)).set({
    status: 'active',
    inviteCode,
    rejectReason: null,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: reviewedBy || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return getAgencyById(agencyId);
}

/**
 * Force-remove every agency member from the live Redis pool and notify sockets.
 * Used when an agency leaves operable status (suspend / reject) so in-flight
 * agents stop receiving calls immediately.
 */
async function evictAgencyMembersFromPool(agencyId, {
  code = 'AGENCY_NOT_ACTIVE',
  message = 'Your agency is no longer active. You have been taken offline.',
} = {}) {
  const id = normalizeAgencyId(agencyId);
  if (!id) return { evicted: 0 };

  // Lazy requires avoid circular load with sockets ↔ services.
  const agentManager = require('./agentManager');
  const socketRegistry = require('../sockets/socketRegistry');
  const memberIds = await listAgencyMemberIds(id);
  let evicted = 0;

  await Promise.all(memberIds.map(async (uid) => {
    try {
      await agentManager.removeAgent(uid);
      await socketRegistry.emitToAgent(uid, 'agent:go_live_error', {
        code,
        message,
      });
      evicted += 1;
    } catch (err) {
      console.warn(`[Agency] Failed to evict member ${uid} from pool:`, err.message);
    }
  }));

  if (evicted > 0) {
    console.log(`[Agency] Evicted ${evicted}/${memberIds.length} member(s) from pool for agency ${id} (${code})`);
  }
  return { evicted, memberCount: memberIds.length };
}

async function rejectAgency(agencyId, { reason, reviewedBy } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('Agency not found');
  if (agency.status === 'rejected') return agency;
  if (agency.status !== 'pending') {
    throw new Error(`Cannot reject agency with status "${agency.status}"`);
  }

  const { FieldValue } = admin.firestore;
  const rejectReason = String(reason || '').trim().slice(0, 500) || null;
  await db.collection(COLLECTION).doc(String(agencyId)).set({
    status: 'rejected',
    rejectReason,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: reviewedBy || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // Pending agencies should not be live, but clear any stray pool entries.
  await evictAgencyMembersFromPool(agencyId, {
    code: 'AGENCY_REJECTED',
    message: 'Your agency application was not approved. You have been taken offline.',
  }).catch((err) => {
    console.warn('[Agency] reject pool eviction failed:', err.message);
  });

  return getAgencyById(agencyId);
}

/**
 * Rejected founder clears membership so they can submit a new application.
 * Only allowed when their current agency is rejected (or missing).
 * Releases the agencySlugs lock and retires the rejected shell's slug so the
 * company name can be reused on a new application (admin history is kept).
 */
async function clearRejectedMembershipForReapply(uid) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const { FieldValue } = admin.firestore;
  const userRef = db.collection('users').doc(String(uid));
  let retiredInviteCode = null;

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('User profile not found');
    const user = userSnap.data() || {};
    const agencyId = normalizeAgencyId(user.agencyId);
    if (!agencyId) {
      throw new Error('You are not assigned to an agency');
    }

    const agencyRef = db.collection(COLLECTION).doc(agencyId);
    const agencySnap = await tx.get(agencyRef);
    let oldSlug = null;
    let slugRef = null;
    let slugSnap = null;

    if (!agencySnap.exists) {
      // Orphan membership — clear anyway
    } else {
      const agencyData = agencySnap.data() || {};
      const status = agencyData.status;
      if (status !== 'rejected') {
        throw new Error('Only rejected applications can be cleared for re-apply');
      }
      const founderUid = agencyData.createdByUid
        || agencyData.application?.founderUid;
      if (!founderUid) {
        throw new Error('Cannot clear application: founder identity is missing');
      }
      if (String(founderUid) !== String(uid)) {
        throw new Error('Only the agency founder can clear this application');
      }
      oldSlug = agencyData.slug ? String(agencyData.slug) : null;
      if (oldSlug) {
        slugRef = db.collection(SLUG_LOCK_COLLECTION).doc(oldSlug);
        slugSnap = await tx.get(slugRef);
      }
      retiredInviteCode = agencyData.inviteCode
        ? normalizeInviteCode(agencyData.inviteCode)
        : null;
    }

    const existingRole = user.role || 'agent';
    const patch = {
      agencyId: null,
      agencyRole: null,
      managedAgents: [],
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existingRole === 'agency_admin' || existingRole === 'agency_agent') {
      patch.role = 'agent';
    }
    tx.set(userRef, patch, { merge: true });

    if (agencySnap.exists) {
      // Free brand slug for a new application; keep rejected row for Applications history.
      if (slugRef && slugSnap?.exists && String(slugSnap.data()?.agencyId) === String(agencyId)) {
        tx.delete(slugRef);
      }
      tx.set(agencyRef, {
        slug: `rejected-${agencyId}`,
        inviteCode: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  if (retiredInviteCode) {
    await releaseInviteCodeLock(retiredInviteCode);
  }

  return { ok: true };
}

async function claimInviteCode(uid, code) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');

  const resolved = await resolveInviteCode(code);
  if (!resolved.valid) {
    throw new Error('Invalid or inactive invite code');
  }

  const { FieldValue } = admin.firestore;
  const userRef = db.collection('users').doc(String(uid));
  const agencyRef = db.collection(COLLECTION).doc(String(resolved.agencyId));
  const expectedCode = normalizeInviteCode(resolved.code);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const agencySnap = await tx.get(agencyRef);

    if (!userSnap.exists) throw new Error('User profile not found');
    const user = userSnap.data() || {};

    if (normalizeAgencyId(user.agencyId)) {
      throw new Error('You are already in an agency. Ask a platform admin to remove you before joining another.');
    }
    if (isPlatformRole(user.role)) {
      throw new Error('Platform staff cannot join an agency with an invite code');
    }

    if (!agencySnap.exists) throw new Error('Invalid or inactive invite code');
    const agency = agencySnap.data() || {};
    if (!isAgencyOperable(agency)) throw new Error('Invalid or inactive invite code');
    if (normalizeInviteCode(agency.inviteCode) !== expectedCode) {
      throw new Error('Invalid or inactive invite code');
    }

    const existingRole = user.role || 'agent';
    tx.set(userRef, {
      agencyId: resolved.agencyId,
      agencyRole: 'agency_agent',
      role: isPlatformRole(existingRole) ? existingRole : 'agency_agent',
      managedAgents: [],
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return {
    uid: String(uid),
    agencyId: resolved.agencyId,
    membershipRole: 'agency_agent',
    agencyName: resolved.name,
    inviteCode: resolved.code,
  };
}

async function updateAgency(id, patch = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Agency not found');

  const { FieldValue } = admin.firestore;
  const update = { updatedAt: FieldValue.serverTimestamp() };
  const previous = snap.data() || {};
  const previousStatus = previous.status;
  const previousSlug = previous.slug ? String(previous.slug) : null;

  if (patch.name !== undefined) {
    const trimmedName = String(patch.name || '').trim();
    if (!trimmedName) throw new Error('Agency name cannot be empty');
    update.name = trimmedName;
  }

  let nextSlug = null;
  if (patch.slug !== undefined) {
    nextSlug = slugify(patch.slug);
    if (nextSlug !== previousSlug) {
      // Backfill lock for agencies created before agencySlugs existed.
      const dup = await db.collection(COLLECTION).where('slug', '==', nextSlug).limit(2).get();
      const other = dup.docs.find((d) => d.id !== id);
      if (other) {
        await db.collection(SLUG_LOCK_COLLECTION).doc(nextSlug).set({
          agencyId: other.id,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        throw new Error('Another agency already uses this slug');
      }
      update.slug = nextSlug;
    }
  }

  if (patch.status !== undefined) {
    update.status = normalizeStatus(patch.status);
  }
  if (patch.lockedCampaignIds !== undefined) {
    if (!Array.isArray(patch.lockedCampaignIds)) throw new Error('lockedCampaignIds must be an array');
    update.lockedCampaignIds = patch.lockedCampaignIds.filter(Boolean);
  }
  if (patch.settings !== undefined) {
    update.settings = patch.settings && typeof patch.settings === 'object' ? patch.settings : {};
  }

  // Flipping to active via admin PATCH must mirror approveAgency guards
  // (reject abandoned shells / empty members) and still bootstrap invite.
  if (update.status === 'active' && previousStatus !== 'active') {
    if (previousStatus === 'rejected') {
      const slug = String(previous.slug || '');
      if (slug === `rejected-${id}` || slug.startsWith('rejected-')) {
        throw new Error('This application was cleared for re-apply and can no longer be approved');
      }
      const memberCount = await countAgencyMembers(id);
      if (memberCount === 0) {
        throw new Error('Cannot approve an agency with no members');
      }
    }
    const existingCode = previous.inviteCode;
    update.inviteCode = existingCode
      ? normalizeInviteCode(existingCode)
      : await generateUniqueInviteCode(id);
  }

  if (update.slug && update.slug !== previousSlug) {
    const newSlugRef = db.collection(SLUG_LOCK_COLLECTION).doc(update.slug);
    const oldSlugRef = previousSlug
      ? db.collection(SLUG_LOCK_COLLECTION).doc(previousSlug)
      : null;

    await db.runTransaction(async (tx) => {
      const agencySnap = await tx.get(ref);
      if (!agencySnap.exists) throw new Error('Agency not found');
      const newSlugSnap = await tx.get(newSlugRef);
      const oldSlugSnap = oldSlugRef ? await tx.get(oldSlugRef) : null;

      if (newSlugSnap.exists && String(newSlugSnap.data()?.agencyId) !== String(id)) {
        throw new Error('Another agency already uses this slug');
      }

      tx.set(newSlugRef, {
        agencyId: String(id),
        createdAt: FieldValue.serverTimestamp(),
      });
      if (
        oldSlugRef
        && oldSlugSnap?.exists
        && String(oldSlugSnap.data()?.agencyId) === String(id)
      ) {
        tx.delete(oldSlugRef);
      }
      tx.set(ref, update, { merge: true });
    });
  } else {
    await ref.set(update, { merge: true });
  }

  const updated = await ref.get();
  const serialized = serializeDoc(updated);

  // Leaving operable status must kick live agents out of Redis immediately.
  const nextStatus = serialized.status;
  if (previousStatus === 'active' && nextStatus && nextStatus !== 'active') {
    const suspendMsg = nextStatus === 'suspended'
      ? 'Your agency has been suspended. You have been taken offline.'
      : 'Your agency is no longer active. You have been taken offline.';
    await evictAgencyMembersFromPool(id, {
      code: nextStatus === 'suspended' ? 'AGENCY_SUSPENDED' : 'AGENCY_NOT_ACTIVE',
      message: suspendMsg,
    }).catch((err) => {
      console.warn('[Agency] updateAgency pool eviction failed:', err.message);
    });
  }

  return serialized;
}

async function deleteAgency(id) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Agency not found');

  // Fast-fail before opening a transaction.
  const earlyMembers = await db.collection('users').where('agencyId', '==', String(id)).limit(1).get();
  if (!earlyMembers.empty) throw new Error('Cannot delete agency with assigned users');

  const agencyData = snap.data() || {};
  const lockedCampaignIds = Array.isArray(agencyData.lockedCampaignIds)
    ? agencyData.lockedCampaignIds.filter(Boolean)
    : [];
  const slug = agencyData.slug ? String(agencyData.slug) : null;
  const slugRef = slug ? db.collection(SLUG_LOCK_COLLECTION).doc(slug) : null;
  const membersQuery = db.collection('users').where('agencyId', '==', String(id)).limit(1);

  // Atomic: re-check members + clear matching slug lock + delete agency doc.
  // Release campaign resources only AFTER delete commits so a failed txn cannot
  // leave an alive agency with unlocked exclusives.
  await db.runTransaction(async (tx) => {
    const agencySnap = await tx.get(ref);
    if (!agencySnap.exists) throw new Error('Agency not found');

    const membersSnap = await tx.get(membersQuery);
    if (!membersSnap.empty) {
      throw new Error('Cannot delete agency with assigned users');
    }

    if (slugRef) {
      const slugSnap = await tx.get(slugRef);
      if (slugSnap.exists && String(slugSnap.data()?.agencyId) === String(id)) {
        tx.delete(slugRef);
      }
    }

    tx.delete(ref);
  });

  const released = await agencyCampaignService.releaseAgencyResources(id, { lockedCampaignIds });

  return {
    id,
    unlockedCampaignIds: released.unlockedCampaignIds,
    updatedRouteIds: released.updatedRouteIds,
  };
}

async function countAgencyMembers(agencyId) {
  const db = getDb();
  if (!db) return 0;
  const agg = await db.collection('users').where('agencyId', '==', String(agencyId)).count().get();
  return agg.data().count || 0;
}

async function listAgencyMemberIds(agencyId) {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection('users').where('agencyId', '==', String(agencyId)).select().get();
  return snap.docs.map((d) => d.id);
}

async function assignUserToAgency(uid, { agencyId, role = 'agency_agent', allowPending = false } = {}) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  const allowedRoles = ['agency_agent', 'agency_admin'];
  if (!allowedRoles.includes(role)) throw new Error('Invalid agency role');

  if (normalizedAgencyId) {
    const agency = await getAgencyById(normalizedAgencyId);
    if (!agency) throw new Error('Agency not found');
    if (agency.status === 'suspended') throw new Error('Agency is suspended');
    if (agency.status === 'rejected') throw new Error('Agency application was rejected');
    if (agency.status === 'pending' && !allowPending) {
      throw new Error('Agency is pending approval');
    }
    if (!isAgencyOperable(agency) && !allowPending) {
      throw new Error('Agency is not active');
    }
  }

  const userRef = db.collection('users').doc(String(uid));
  const existingSnap = await userRef.get();
  const existing = existingSnap.exists ? existingSnap.data() || {} : {};
  const existingRole = existing.role || 'agent';

  const { FieldValue } = admin.firestore;
  const patch = {
    agencyId: normalizedAgencyId,
    managedAgents: [],
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (normalizedAgencyId) {
    patch.agencyRole = role;
    // Platform admins/qa/managers keep their platform role when added to an agency.
    patch.role = isPlatformRole(existingRole) ? existingRole : role;
  } else {
    patch.agencyRole = null;
    if (existingRole === 'agency_admin' || existingRole === 'agency_agent') {
      patch.role = 'agent';
    }
  }

  await userRef.set(patch, { merge: true });
  return { uid, ...patch, membershipRole: patch.agencyRole || role };
}

module.exports = {
  COLLECTION,
  AGENCY_STATUSES,
  listAgencies,
  getAgencyById,
  createAgency,
  updateAgency,
  deleteAgency,
  countAgencyMembers,
  listAgencyMemberIds,
  assignUserToAgency,
  slugify,
  isAgencyOperable,
  normalizeInviteCode,
  buildInviteShareUrl,
  buildInviteJoinUrl,
  findAgencyByInviteCode,
  resolveInviteCode,
  ensureInviteCode,
  rotateInviteCode,
  registerAgencyApplication,
  approveAgency,
  rejectAgency,
  clearRejectedMembershipForReapply,
  evictAgencyMembersFromPool,
  claimInviteCode,
};
