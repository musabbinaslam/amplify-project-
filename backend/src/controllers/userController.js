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

function parseRange(query) {
  const now = new Date();
  const end = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(end.getTime() - (29 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
    throw new Error('Invalid date range');
  }
  return { from, end };
}

function toMsFromLog(row) {
  const ts = row?.createdAt || row?.timestamp;
  if (!ts) return NaN;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.toDate) return ts.toDate().getTime();
  return NaN;
}

function dayKeyFromMs(ms) {
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

async function readUserLogsInRange(uid, from, end, limit = 500) {
  const db = admin.firestore();
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('callLogs')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const fromMs = from.getTime();
  const endMs = end.getTime();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((row) => {
      const ms = toMsFromLog(row);
      return !Number.isNaN(ms) && ms >= fromMs && ms <= endMs;
    });
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

async function getMeBootstrap(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const [data, apiKey, activity] = await Promise.all([
      getUserDoc(req.user.uid),
      getOrCreateApiKey(req.user.uid),
      listActivity(req.user.uid, 20),
    ]);
    const payload = serializeFirestoreData(data ?? {});
    payload.memberSince = payload.createdAt || null;
    payload.lastUpdated = payload.updatedAt || null;
    if (!payload.role) payload.role = 'agent';
    res.json({
      profile: payload,
      apiKey,
      activity: serializeFirestoreData(activity || []),
    });
  } catch (err) {
    console.error('[Users] getMeBootstrap:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load profile bootstrap' });
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
    if ('licensedStates' in body) {
      const raw = body.licensedStates;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ error: 'licensedStates must be an array of state codes' });
      }
      const allowed = new Set([
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
        'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
        'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
      ]);
      const cleaned = [];
      for (const v of raw) {
        const code = String(v || '').trim().toUpperCase();
        if (!code) continue;
        if (!allowed.has(code)) continue;
        cleaned.push(code);
        if (cleaned.length >= 60) break;
      }
      body.licensedStates = cleaned;
    }
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

async function getQaSummary(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const { from, end } = parseRange(req.query || {});
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1000);
    const reviewed = rows.filter((r) => r?.qaInsight?.score != null);
    const scores = reviewed.map((r) => Number(r.qaInsight.score || 0));
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    const needsImprovement = reviewed.filter((r) =>
      Number(r.qaInsight.score || 0) < 70 || (Array.isArray(r.qaInsight.flags) && r.qaInsight.flags.length > 0)
    ).length;
    res.json({
      summary: {
        avgScore,
        reviewedCalls: reviewed.length,
        needsImprovement,
      },
      range: {
        from: from.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      },
    });
  } catch (err) {
    console.error('[Users] getQaSummary:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load QA summary' });
  }
}

async function getQaTrend(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const { from, end } = parseRange(req.query || {});
    const limit = Math.min(Number(req.query.limit || 12), 100);
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1000);
    const reviewed = rows
      .filter((r) => r?.qaInsight?.score != null)
      .sort((a, b) => toMsFromLog(a) - toMsFromLog(b));
    const points = reviewed.slice(-limit).map((r, idx) => ({
      call: idx + 1,
      score: Number(r.qaInsight.score || 0),
      callId: r.id,
      timestamp: serializeFirestoreData(r.createdAt || r.timestamp),
    }));
    res.json({ points });
  } catch (err) {
    console.error('[Users] getQaTrend:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load QA trend' });
  }
}

async function getQaScorecards(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const { from, end } = parseRange(req.query || {});
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1200);
    const out = rows
      .filter((r) => r?.qaInsight?.score != null)
      .sort((a, b) => toMsFromLog(b) - toMsFromLog(a))
      .slice(0, limit)
      .map((r) => {
        const score = Number(r.qaInsight.score || 0);
        return {
          id: r.id,
          date: new Date(toMsFromLog(r)).toISOString(),
          caller: r.from || 'Unknown',
          duration: Number(r.duration || 0),
          score,
          confidence: Number(r?.qaInsight?.confidence || 0),
          flags: Array.isArray(r?.qaInsight?.flags) ? r.qaInsight.flags : [],
          status: score >= 70 ? 'good' : 'needs-improvement',
          summary: String(r?.qaInsight?.summary || ''),
          pending: false,
          campaign: r.campaignLabel || r.campaign || 'unknown',
          state: r?.qaInsight?.signals?.state || null,
        };
      });
    res.json({ rows: out });
  } catch (err) {
    console.error('[Users] getQaScorecards:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load QA scorecards' });
  }
}

async function getQaPatterns(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const { from, end } = parseRange(req.query || {});
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1200);
    const reviewed = rows.filter((r) => r?.qaInsight?.score != null);
    const byCampaign = new Map();
    const byState = new Map();
    const dayScores = new Map();

    reviewed.forEach((r) => {
      const score = Number(r.qaInsight.score || 0);
      const campaign = r.campaignLabel || r.campaign || 'unknown';
      const state = r?.qaInsight?.signals?.state || 'unknown';
      const dKey = dayKeyFromMs(toMsFromLog(r));
      if (dKey) {
        if (!dayScores.has(dKey)) dayScores.set(dKey, []);
        dayScores.get(dKey).push(score);
      }

      if (!byCampaign.has(campaign)) byCampaign.set(campaign, { key: campaign, volume: 0, scoreSum: 0 });
      if (!byState.has(state)) byState.set(state, { key: state, volume: 0, scoreSum: 0 });
      const c = byCampaign.get(campaign);
      c.volume += 1;
      c.scoreSum += score;
      const s = byState.get(state);
      s.volume += 1;
      s.scoreSum += score;
    });

    const campaignPatterns = [...byCampaign.values()]
      .map((r) => ({ ...r, avgScore: r.volume ? Math.round(r.scoreSum / r.volume) : 0 }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8);
    const statePatterns = [...byState.values()]
      .map((r) => ({ ...r, avgScore: r.volume ? Math.round(r.scoreSum / r.volume) : 0 }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8);

    const daily = [...dayScores.entries()]
      .map(([day, list]) => ({ day, avg: list.reduce((a, b) => a + b, 0) / list.length }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const baseline = daily.length ? daily.reduce((a, b) => a + b.avg, 0) / daily.length : 0;
    const anomalies = daily
      .filter((d) => Math.abs(d.avg - baseline) >= 10)
      .map((d) => ({
        day: d.day,
        avgScore: Math.round(d.avg),
        deltaFromBaseline: Math.round(d.avg - baseline),
      }))
      .slice(-6);

    const summary = reviewed.length
      ? `Reviewed ${reviewed.length} calls. Baseline score is ${Math.round(baseline)}/100 with ${
        anomalies.length
          ? `${anomalies.length} notable daily variance point${anomalies.length > 1 ? 's' : ''}`
          : 'stable day-to-day performance'
      }.`
      : 'No reviewed calls in this range yet.';

    res.json({ summary, campaignPatterns, statePatterns, anomalies });
  } catch (err) {
    console.error('[Users] getQaPatterns:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load QA patterns' });
  }
}

module.exports = {
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
};
