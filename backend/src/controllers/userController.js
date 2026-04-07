const {
  getUserDoc,
  mergeUserDoc,
  mergeSettings,
  mergeScriptValues,
  getOrCreateApiKey,
  regenerateApiKey,
  isSlugAvailable,
  addActivity,
  listActivity,
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
    const payload = serializeFirestoreData(data ?? {});
    payload.memberSince = payload.createdAt || null;
    payload.lastUpdated = payload.updatedAt || null;
    if (!payload.role) payload.role = 'agent';
    res.json(payload);
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
    const body = { ...req.body };
    delete body.role;
    await mergeUserDoc(req.user.uid, body);
    const data = await getUserDoc(req.user.uid);
    const changed = Object.keys(body || {});
    if (changed.length > 0) {
      await addActivity(req.user.uid, {
        type: 'profile.updated',
        message: `Updated ${changed.join(', ')}`,
        meta: { fields: changed },
      });
    }
    const payload = serializeFirestoreData(data ?? {});
    if (!payload.role) payload.role = 'agent';
    res.json(payload);
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
    await addActivity(req.user.uid, {
      type: 'settings.updated',
      message: 'Updated profile settings',
      meta: { fields: Object.keys(partial) },
    });
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

async function postRegenerateApiKey(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const apiKey = await regenerateApiKey(req.user.uid);
    await addActivity(req.user.uid, {
      type: 'apikey.regenerated',
      message: 'Regenerated API key',
    });
    const data = await getUserDoc(req.user.uid);
    res.json({
      apiKey,
      apiKeyRotatedAt: serializeFirestoreData(data?.apiKeyRotatedAt || null),
    });
  } catch (err) {
    console.error('[Users] postRegenerateApiKey:', err.message);
    res.status(500).json({ error: err.message || 'Failed to regenerate API key' });
  }
}

async function getSlugAvailability(req, res) {
  if (!ensureAdmin(req, res)) return;
  const slug = String(req.query.slug || '').trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'slug query is required' });
  try {
    const available = await isSlugAvailable(req.user.uid, slug);
    res.json({ available });
  } catch (err) {
    console.error('[Users] getSlugAvailability:', err.message);
    res.status(500).json({ error: err.message || 'Failed to validate slug' });
  }
}

async function getActivity(req, res) {
  if (!ensureAdmin(req, res)) return;
  const limit = Math.min(Number(req.query.limit || 20), 100);
  try {
    const items = await listActivity(req.user.uid, limit);
    res.json({ activity: serializeFirestoreData(items) });
  } catch (err) {
    console.error('[Users] getActivity:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load activity' });
  }
}

module.exports = {
  getMe,
  patchMe,
  patchSettings,
  patchScript,
  postApiKey,
  postRegenerateApiKey,
  getSlugAvailability,
  getActivity,
};
