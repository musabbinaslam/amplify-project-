const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const crypto = require('crypto');

const USER_DOC_TTL_MS = 20_000;
const userDocCache = new Map();

function usersRef(uid) {
  const db = getDb();
  if (!db) return null;
  return db.collection('users').doc(uid);
}

function rememberUserDoc(uid, data) {
  const key = String(uid);
  userDocCache.set(key, { at: Date.now(), data });
  if (userDocCache.size > 400) {
    const oldest = userDocCache.keys().next().value;
    userDocCache.delete(oldest);
  }
}

function invalidateUserDoc(uid) {
  userDocCache.delete(String(uid));
}

async function getUserDoc(uid) {
  const key = String(uid);
  const cached = userDocCache.get(key);
  if (cached && Date.now() - cached.at < USER_DOC_TTL_MS) return cached.data;
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  rememberUserDoc(key, data);
  return data;
}

/**
 * @param {string} uid
 * @param {Record<string, unknown>} data
 */
async function mergeUserDoc(uid, data) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  await ref.set(
    {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  invalidateUserDoc(uid);
}

async function mergeSettings(uid, partial) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  const snap = await ref.get();
  const existing = snap.exists ? snap.data()?.settings : null;
  const merged = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...partial,
  };
  await ref.set(
    {
      settings: merged,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function mergeScriptValues(uid, scriptId, values) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  await ref.set(
    {
      scriptValues: { [scriptId]: values },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function getOrCreateApiKey(uid) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  const snap = await ref.get();
  const existing = snap.exists ? snap.data()?.apiKey : null;
  if (existing) return existing;

  const bytes = crypto.randomBytes(32);
  const hex = bytes.toString('hex');
  const apiKey = `ak_${hex}`;

  await ref.set({ apiKey, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  return apiKey;
}

async function regenerateApiKey(uid) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;

  const bytes = crypto.randomBytes(32);
  const apiKey = `ak_${bytes.toString('hex')}`;
  await ref.set(
    {
      apiKey,
      apiKeyRotatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return apiKey;
}

async function isSlugAvailable(uid, slug) {
  const db = getDb();
  if (!db) throw new Error('Database unavailable');
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return false;
  const snap = await db.collection('users').where('landingPageSlug', '==', normalized).limit(1).get();
  if (snap.empty) return true;
  const takenBy = snap.docs[0].id;
  return takenBy === uid;
}

function activityRef(uid) {
  const ref = usersRef(uid);
  if (!ref) return null;
  return ref.collection('activity');
}

async function addActivity(uid, entry) {
  const ref = activityRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  await ref.add({
    type: entry.type || 'profile.updated',
    message: entry.message || 'Profile updated',
    meta: entry.meta || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function listActivity(uid, limit = 20) {
  const ref = activityRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const snap = await ref.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  getUserDoc,
  mergeUserDoc,
  mergeSettings,
  mergeScriptValues,
  getOrCreateApiKey,
  regenerateApiKey,
  isSlugAvailable,
  addActivity,
  listActivity,
};
