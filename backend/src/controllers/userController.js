const {
  getUserDoc,
  mergeUserDoc,
  mergeSettings,
  mergeScriptValues,
  getOrCreateApiKey,
} = require('../services/userDataService');
const admin = require('../config/firebaseAdmin');

function serializeFirestoreData(value) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => serializeFirestoreData(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = serializeFirestoreData(v);
  }
  return out;
}

function ensureAdmin(req, res) {
  if (!admin) {
    res.status(503).json({ error: 'Database service unavailable' });
    return false;
  }
  return true;
}

async function getMe(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const data = await getUserDoc(req.user.uid);
    res.json(serializeFirestoreData(data ?? {}));
  } catch (err) {
    console.error('[Users] getMe:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
}

async function patchMe(req, res) {
  if (!ensureAdmin(req, res)) return;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  try {
    await mergeUserDoc(req.user.uid, req.body);
    const data = await getUserDoc(req.user.uid);
    res.json(serializeFirestoreData(data ?? {}));
  } catch (err) {
    console.error('[Users] patchMe:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save profile' });
  }
}

async function patchSettings(req, res) {
  if (!ensureAdmin(req, res)) return;
  const partial = req.body;
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    return res.status(400).json({ error: 'Body must be a JSON object (partial settings fields)' });
  }
  try {
    await mergeSettings(req.user.uid, partial);
    const data = await getUserDoc(req.user.uid);
    res.json({ settings: data?.settings ?? {} });
  } catch (err) {
    console.error('[Users] patchSettings:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save settings' });
  }
}

async function patchScript(req, res) {
  if (!ensureAdmin(req, res)) return;
  const { scriptId } = req.params;
  if (!scriptId || typeof scriptId !== 'string') {
    return res.status(400).json({ error: 'Invalid script id' });
  }
  const values = req.body;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return res.status(400).json({ error: 'Body must be a JSON object (script field values)' });
  }
  try {
    await mergeScriptValues(req.user.uid, scriptId, values);
    const data = await getUserDoc(req.user.uid);
    res.json({ scriptValues: data?.scriptValues?.[scriptId] ?? {} });
  } catch (err) {
    console.error('[Users] patchScript:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save script' });
  }
}

async function postApiKey(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const apiKey = await getOrCreateApiKey(req.user.uid);
    res.json({ apiKey });
  } catch (err) {
    console.error('[Users] postApiKey:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create API key' });
  }
}

module.exports = {
  getMe,
  patchMe,
  patchSettings,
  patchScript,
  postApiKey,
};
