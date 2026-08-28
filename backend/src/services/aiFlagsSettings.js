const { getDb } = require('../config/firestoreDb');
const admin = require('../config/firebaseAdmin');

const COLLECTION = 'config';
const DOC_ID = 'aiFlags';

let runtimeEnabled = true;

function envEnabled() {
  const raw = process.env.AI_FLAGS_GEMINI_ENABLED;
  if (raw == null || raw === '') return true;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function isRuntimeEnabled() {
  return runtimeEnabled !== false;
}

function isAiFlagsGeminiEnabled() {
  return envEnabled() && isRuntimeEnabled();
}

function snapshot() {
  const envOn = envEnabled();
  return {
    enabled: envOn && isRuntimeEnabled(),
    runtimeEnabled: isRuntimeEnabled(),
    envEnabled: envOn,
    envLocked: !envOn,
  };
}

function disabledError() {
  if (!envEnabled()) {
    return 'AI Flags Gemini is disabled. Set AI_FLAGS_GEMINI_ENABLED=true to re-enable.';
  }
  return 'AI Flags is turned off. Turn it back on from the AI Flags page.';
}

async function loadAiFlagsSettings() {
  const db = getDb();
  if (!db) return snapshot();
  try {
    const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
    runtimeEnabled = snap.exists ? snap.data()?.enabled !== false : true;
  } catch (err) {
    console.warn('[AI Flags] Failed to load settings:', err.message);
    runtimeEnabled = true;
  }
  const out = snapshot();
  console.log(`[AI Flags] Runtime ${out.runtimeEnabled ? 'on' : 'off'} (env ${out.envEnabled ? 'on' : 'off'})`);
  return out;
}

async function setAiFlagsEnabled(enabled, uid) {
  if (!envEnabled()) {
    const err = new Error(disabledError());
    err.code = 'UNAVAILABLE';
    throw err;
  }
  const next = enabled !== false;
  const db = getDb();
  if (!db) {
    const err = new Error('Database unavailable');
    err.code = 'UNAVAILABLE';
    throw err;
  }
  const payload = {
    enabled: next,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid || null,
  };
  await db.collection(COLLECTION).doc(DOC_ID).set(payload, { merge: true });
  runtimeEnabled = next;
  return snapshot();
}

module.exports = {
  loadAiFlagsSettings,
  setAiFlagsEnabled,
  isAiFlagsGeminiEnabled,
  isAiFlagsEnvEnabled: envEnabled,
  getAiFlagsSnapshot: snapshot,
  aiFlagsDisabledError: disabledError,
};
