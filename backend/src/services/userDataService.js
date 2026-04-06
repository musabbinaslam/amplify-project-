const admin = require('../config/firebaseAdmin');
const crypto = require('crypto');

function getDb() {
  if (!admin) return null;
  return admin.firestore();
}

function usersRef(uid) {
  const db = getDb();
  if (!db) return null;
  return db.collection('users').doc(uid);
}

async function getUserDoc(uid) {
  const ref = usersRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data();
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

module.exports = {
  getUserDoc,
  mergeUserDoc,
  mergeSettings,
  mergeScriptValues,
  getOrCreateApiKey,
};
