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
const { getDb } = require('../config/firestoreDb');
const AI_TRAINING_CACHE_TTL_MS = 30 * 1000;
const aiTrainingCache = new Map();

function buildAiTrainingCacheKey(uid, scope, query = {}) {
  const normalized = {};
  Object.keys(query || {})
    .sort()
    .forEach((k) => {
      normalized[k] = String(query[k]);
    });
  return `${uid}|ai-training|${scope}|${JSON.stringify(normalized)}`;
}

function readAiTrainingCache(key) {
  const hit = aiTrainingCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > AI_TRAINING_CACHE_TTL_MS) {
    aiTrainingCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeAiTrainingCache(key, payload) {
  aiTrainingCache.set(key, { ts: Date.now(), payload });
}

function invalidateAiTrainingCacheForUser(uid) {
  const prefix = `${uid}|ai-training|`;
  [...aiTrainingCache.keys()].forEach((k) => {
    if (k.startsWith(prefix)) aiTrainingCache.delete(k);
  });
}

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

function startOfDayIso(d) {
  return new Date(`${d}T00:00:00.000Z`);
}

function endOfDayIso(d) {
  return new Date(`${d}T23:59:59.999Z`);
}

function deriveOutcome(row) {
  if (row?.isBillable) return 'sale';
  const status = String(row?.status || '').toLowerCase();
  if (status === 'completed') return 'no-sale';
  if (status === 'busy' || status === 'failed' || status === 'no-answer') return 'hangup';
  return 'callback';
}

function buildRubric(row, score) {
  const signals = row?.qaInsight?.signals || {};
  const pick = (k, fallback) => {
    const v = Number(signals?.[k]);
    if (Number.isFinite(v) && v >= 0 && v <= 100) return Math.round(v);
    return fallback;
  };
  return [
    { key: 'opening', label: 'Opening', score: pick('opening', Math.max(35, Math.min(100, Math.round(score * 0.95)))) },
    { key: 'discovery', label: 'Discovery', score: pick('discovery', Math.max(30, Math.min(100, Math.round(score * 0.9)))) },
    { key: 'compliance', label: 'Compliance', score: pick('compliance', Math.max(45, Math.min(100, Math.round(score * 1.03)))) },
    { key: 'objectionHandling', label: 'Objection Handling', score: pick('objectionHandling', Math.max(25, Math.min(100, Math.round(score * 0.85)))) },
    { key: 'closing', label: 'Closing', score: pick('closing', Math.max(25, Math.min(100, Math.round(score * 0.88)))) },
  ];
}

function inferDrillTemplate(rubricKey) {
  const map = {
    opening: {
      title: 'Opening consistency drill',
      focus: 'Opening',
      recommendedScript: 'Set agenda in 15 seconds, confirm caller context, ask one commitment question.',
    },
    discovery: {
      title: 'Discovery depth drill',
      focus: 'Discovery',
      recommendedScript: 'Use two open-ended qualifying questions before presenting options.',
    },
    compliance: {
      title: 'Compliance wording drill',
      focus: 'Compliance',
      recommendedScript: 'Use mandatory disclaimer phrasing before recommendation segments.',
    },
    objectionHandling: {
      title: 'Objection response drill',
      focus: 'Objection Handling',
      recommendedScript: 'Acknowledge concern, clarify root issue, then bridge to plan-fit statement.',
    },
    closing: {
      title: 'Closing confidence drill',
      focus: 'Closing',
      recommendedScript: 'Summarize value, confirm intent, ask for concrete next action.',
    },
  };
  return map[rubricKey] || map.discovery;
}

function coachingTemplateForCompetency(key) {
  const templates = {
    opening: {
      rootCauseSummary: 'Openings are inconsistent and skip agenda-setting, causing weak control early in the call.',
      steps: [
        'Open with role + call purpose in under 12 seconds.',
        'Confirm caller context before quoting options.',
        'Use one commitment question before moving to discovery.',
      ],
      scriptExample: 'Hi, this is {{agent}} from CallsFlow. In 2 minutes I will confirm coverage fit and pricing options, then we can decide the best next step together. Sound good?',
      antiPatterns: ['Jumping to pricing before context', 'Overlong opener with no agenda'],
    },
    discovery: {
      rootCauseSummary: 'Discovery is too shallow, leading to weak recommendation confidence later in the call.',
      steps: [
        'Ask at least two open-ended qualification questions.',
        'Repeat back one key caller need to confirm understanding.',
        'Only then present plan options and trade-offs.',
      ],
      scriptExample: 'Before I recommend anything, what matters most to you: monthly cost, provider flexibility, or deductible level?',
      antiPatterns: ['Binary yes/no discovery only', 'Presenting plans before need mapping'],
    },
    compliance: {
      rootCauseSummary: 'Required phrasing appears late or inconsistently, creating avoidable compliance risk.',
      steps: [
        'Deliver disclosure language before recommendation blocks.',
        'Pause for acknowledgment after compliance statements.',
        'Use exact wording for mandatory disclaimers.',
      ],
      scriptExample: 'Quick disclosure before we continue: plan availability and pricing can vary by state and eligibility rules. I will verify details before any enrollment step.',
      antiPatterns: ['Paraphrasing regulated lines', 'Stacking disclosures at call end'],
    },
    objectionHandling: {
      rootCauseSummary: 'Objections are answered reactively without a structured bridge back to value.',
      steps: [
        'Acknowledge concern in one sentence.',
        'Clarify root objection with one follow-up question.',
        'Bridge to a tailored value statement and close for next step.',
      ],
      scriptExample: 'Totally fair concern. Is your biggest issue monthly premium or uncertainty about coverage use? Based on that, I can show the safer option.',
      antiPatterns: ['Defensive tone', 'Repeating the same pitch after objection'],
    },
    closing: {
      rootCauseSummary: 'Closings miss clear next-step asks, so intent drops even after strong mid-call performance.',
      steps: [
        'Recap the top two matched benefits.',
        'Ask a specific next-step question (not a generic “any questions?”).',
        'Confirm timeline and owner for follow-up.',
      ],
      scriptExample: 'Given your budget and provider preference, this plan is the best match. Should we complete the eligibility confirmation now so you can lock this in today?',
      antiPatterns: ['Soft/unclear close', 'No explicit next-step ownership'],
    },
  };
  return templates[key] || templates.discovery;
}

function summarizeCompetencies(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const score = Number(r?.qaInsight?.score || 0);
    buildRubric(r, score).forEach((rubricRow) => {
      const existing = map.get(rubricRow.key) || {
        key: rubricRow.key,
        label: rubricRow.label,
        total: 0,
        count: 0,
      };
      existing.total += Number(rubricRow.score || 0);
      existing.count += 1;
      map.set(rubricRow.key, existing);
    });
  });
  return [...map.values()].map((row) => ({
    key: row.key,
    label: row.label,
    avgScore: row.count ? Math.round(row.total / row.count) : 0,
    callCount: row.count,
  }));
}

function buildGuidedPlan(rows, baselineWindow, owner) {
  const competencyRows = summarizeCompetencies(rows)
    .filter((row) => row.callCount > 0)
    .sort((a, b) => a.avgScore - b.avgScore);
  const weak = competencyRows.filter((row) => row.avgScore < 78).slice(0, 3);
  const focusAreas = (weak.length ? weak : competencyRows.slice(0, 2)).map((row) => {
    const tpl = coachingTemplateForCompetency(row.key);
    return {
      competencyKey: row.key,
      competency: row.label,
      baselineScore: row.avgScore,
      callCount: row.callCount,
      rootCauseSummary: tpl.rootCauseSummary,
      steps: tpl.steps,
      scriptExample: tpl.scriptExample,
      antiPatterns: tpl.antiPatterns,
      taskId: `task_${row.key}`,
    };
  });

  const tasks = focusAreas.map((area) => ({
    id: area.taskId,
    competency: area.competency,
    competencyKey: area.competencyKey,
    title: `${area.competency} improvement task`,
    instructions: area.steps,
    status: 'new',
    evidenceNote: '',
  }));

  return {
    status: 'active',
    owner,
    baselineWindow,
    focusAreas,
    tasks,
  };
}

async function readCoachingPlanWithTasks(uid) {
  const db = getDb();
  const planRef = db.collection('users').doc(uid).collection('aiCoachingPlan').doc('current');
  const [planSnap, tasksSnap] = await Promise.all([
    planRef.get(),
    planRef.collection('tasks').orderBy('updatedAt', 'desc').get(),
  ]);
  const plan = planSnap.exists ? serializeFirestoreData(planSnap.data() || {}) : null;
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...serializeFirestoreData(d.data() || {}) }));
  return { planRef, plan, tasks };
}

async function listAiTrainingDrillStatuses(uid) {
  const db = getDb();
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('aiTrainingDrills')
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  const byId = new Map();
  snap.docs.forEach((d) => {
    byId.set(d.id, { id: d.id, ...d.data() });
  });
  return byId;
}

async function readUserLogsInRange(uid, from, end, limit = 500) {
  const db = getDb();
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
    const existingProfile = await getUserDoc(req.user.uid);
    if (!existingProfile) {
      body.role = 'agent';
    }
    if ('averageAp' in body) {
      const n = Number(body.averageAp);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'averageAp must be a non-negative number' });
      }
      body.averageAp = Math.min(Math.round(n * 100) / 100, 100000);
    }
    if ('brandColor' in body) {
      const raw = body.brandColor;
      if (raw === null || raw === '') {
        body.brandColor = null;
      } else {
        const v = String(raw || '').trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(v)) {
          return res.status(400).json({ error: 'brandColor must be a 6-digit hex like #25f425' });
        }
        body.brandColor = v;
      }
    }
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

async function getAiTrainingSummary(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'summary', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const { from, end } = parseRange(req.query || {});
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1500);
    const reviewed = rows
      .filter((r) => r?.qaInsight?.score != null)
      .sort((a, b) => toMsFromLog(a) - toMsFromLog(b));
    const scores = reviewed.map((r) => Number(r?.qaInsight?.score || 0));
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const mid = Math.max(1, Math.floor(scores.length / 2));
    const first = scores.slice(0, mid);
    const second = scores.slice(mid);
    const avgFirst = first.length ? first.reduce((a, b) => a + b, 0) / first.length : 0;
    const avgSecond = second.length ? second.reduce((a, b) => a + b, 0) / second.length : avgFirst;
    const improvementPct = avgFirst > 0
      ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
      : 0;

    const drillStatuses = await listAiTrainingDrillStatuses(req.user.uid);
    const pendingDrills = [...drillStatuses.values()].filter((d) => d.status !== 'completed').length;

    const payload = {
      summary: {
        avgScore,
        reviewedCalls: reviewed.length,
        improvementPct,
        pendingDrills,
      },
      range: {
        from: from.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      },
    };
    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiTrainingSummary:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load AI training summary' });
  }
}

async function getAiTrainingTrend(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'trend', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const { from, end } = parseRange(req.query || {});
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1500);
    const reviewed = rows.filter((r) => r?.qaInsight?.score != null);
    const days = new Map();
    reviewed.forEach((r) => {
      const day = dayKeyFromMs(toMsFromLog(r));
      if (!day) return;
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(Number(r?.qaInsight?.score || 0));
    });
    const points = [...days.entries()]
      .map(([day, list]) => ({
        day,
        score: Math.round(list.reduce((a, b) => a + b, 0) / list.length),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const payload = { points };
    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiTrainingTrend:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load AI training trend' });
  }
}

async function getAiTrainingScorecards(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'scorecards', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const { from, end } = parseRange(req.query || {});
    const limit = Math.min(Number(req.query.limit || 100), 250);
    const campaignFilter = String(req.query.campaign || '').trim().toLowerCase();
    const outcomeFilter = String(req.query.outcome || '').trim().toLowerCase();
    const minScore = req.query.minScore != null ? Number(req.query.minScore) : null;

    const rows = await readUserLogsInRange(req.user.uid, from, end, 2000);
    const out = rows
      .filter((r) => r?.qaInsight?.score != null)
      .map((r) => {
        const score = Number(r?.qaInsight?.score || 0);
        const campaign = r.campaignLabel || r.campaign || 'unknown';
        const outcome = deriveOutcome(r);
        return {
          id: r.id,
          callId: String(r.callSid || r.id),
          date: new Date(toMsFromLog(r)).toISOString(),
          campaign,
          state: r?.qaInsight?.signals?.state || null,
          caller: r.from || 'Unknown',
          outcome,
          durationSec: Number(r.duration || 0),
          score,
          confidence: Number(r?.qaInsight?.confidence || 0),
          rubric: buildRubric(r, score),
          strengths: Array.isArray(r?.qaInsight?.signals?.strengths)
            ? r.qaInsight.signals.strengths
            : (score >= 75 ? ['Strong call flow', 'Good compliance phrasing'] : ['Good effort maintaining call flow']),
          improvements: Array.isArray(r?.qaInsight?.signals?.improvements)
            ? r.qaInsight.signals.improvements
            : (score >= 75 ? ['Tighten objection response sequence'] : ['Improve opening clarity', 'Strengthen close confidence']),
          flags: Array.isArray(r?.qaInsight?.flags) ? r.qaInsight.flags : [],
        };
      })
      .filter((row) => {
        if (campaignFilter && campaignFilter !== 'all' && String(row.campaign).toLowerCase() !== campaignFilter) return false;
        if (outcomeFilter && outcomeFilter !== 'all' && row.outcome !== outcomeFilter) return false;
        if (Number.isFinite(minScore) && row.score < minScore) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
    const payload = { rows: out };
    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiTrainingScorecards:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load AI training scorecards' });
  }
}

async function getAiTrainingDrills(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'drills', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const { from, end } = parseRange(req.query || {});
    const rows = await readUserLogsInRange(req.user.uid, from, end, 1200);
    const reviewed = rows
      .filter((r) => r?.qaInsight?.score != null)
      .map((r) => {
        const score = Number(r?.qaInsight?.score || 0);
        return buildRubric(r, score);
      });
    const aggregates = new Map();
    reviewed.forEach((rubric) => {
      rubric.forEach((r) => {
        if (!aggregates.has(r.key)) aggregates.set(r.key, { key: r.key, label: r.label, count: 0, total: 0 });
        const item = aggregates.get(r.key);
        item.count += 1;
        item.total += Number(r.score || 0);
      });
    });

    const weak = [...aggregates.values()]
      .map((a) => ({ ...a, avg: a.count ? Math.round(a.total / a.count) : 0 }))
      .filter((a) => a.count > 0 && a.avg < 75)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 6);

    const statusMap = await listAiTrainingDrillStatuses(req.user.uid);
    const drills = weak.map((w) => {
      const id = `drill_${w.key}`;
      const tpl = inferDrillTemplate(w.key);
      const persisted = statusMap.get(id);
      return {
        id,
        title: tpl.title,
        focus: tpl.focus,
        reason: `${w.label} average is ${w.avg}/100 across ${w.count} reviewed calls`,
        recommendedScript: tpl.recommendedScript,
        status: String(persisted?.status || 'new'),
      };
    });
    const payload = { rows: drills };
    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiTrainingDrills:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load AI training drills' });
  }
}

async function postAiTrainingDrillStatus(req, res) {
  if (!ensureAdmin(req, res)) return;
  const drillId = String(req.params.drillId || '').trim();
  const status = String(req.body?.status || '').trim();
  const allowed = new Set(['new', 'in-progress', 'completed', 'snoozed']);
  if (!drillId) return res.status(400).json({ error: 'drillId is required' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const db = getDb();
    const { FieldValue } = admin.firestore;
    const ref = db
      .collection('users')
      .doc(req.user.uid)
      .collection('aiTrainingDrills')
      .doc(drillId);
    await ref.set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(status === 'completed' ? { completedAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    const snap = await ref.get();
    invalidateAiTrainingCacheForUser(req.user.uid);
    res.json({ row: { id: snap.id, ...serializeFirestoreData(snap.data() || {}) } });
  } catch (err) {
    console.error('[Users] postAiTrainingDrillStatus:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update drill status' });
  }
}

async function getAiCoachingPlan(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'coaching-plan', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const { from, end } = parseRange(req.query || {});
    const shouldRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const baselineWindow = {
      from: from.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
    const db = getDb();
    const { FieldValue } = admin.firestore;
    const userRef = db.collection('users').doc(req.user.uid);
    const planRef = userRef.collection('aiCoachingPlan').doc('current');

    let { plan, tasks } = await readCoachingPlanWithTasks(req.user.uid);
    if (!plan || shouldRefresh || !Array.isArray(plan.focusAreas) || plan.focusAreas.length === 0) {
      const rows = await readUserLogsInRange(req.user.uid, from, end, 1800);
      const reviewed = rows.filter((r) => r?.qaInsight?.score != null);
      const guided = buildGuidedPlan(reviewed, baselineWindow, req.user.uid);
      await planRef.set(
        {
          ...guided,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      const batch = db.batch();
      guided.tasks.forEach((task) => {
        const taskRef = planRef.collection('tasks').doc(task.id);
        batch.set(taskRef, {
          ...task,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      const readBack = await readCoachingPlanWithTasks(req.user.uid);
      plan = readBack.plan;
      tasks = readBack.tasks;
      invalidateAiTrainingCacheForUser(req.user.uid);
    }

    const payload = {
      plan: {
        ...(plan || {}),
        baselineWindow: plan?.baselineWindow || baselineWindow,
        focusAreas: Array.isArray(plan?.focusAreas) ? plan.focusAreas : [],
      },
      tasks: Array.isArray(tasks) ? tasks : [],
    };
    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiCoachingPlan:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load coaching plan' });
  }
}

async function patchAiCoachingTask(req, res) {
  if (!ensureAdmin(req, res)) return;
  const taskId = String(req.params.taskId || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const evidenceNote = req.body?.evidenceNote != null ? String(req.body.evidenceNote).trim() : undefined;
  const allowed = new Set(['new', 'in-progress', 'completed', 'blocked']);
  if (!taskId) return res.status(400).json({ error: 'taskId is required' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid task status' });
  if (status === 'completed' && (!evidenceNote || evidenceNote.length < 10)) {
    return res.status(400).json({ error: 'Evidence note (min 10 chars) is required to complete a task' });
  }
  try {
    const db = getDb();
    const { FieldValue } = admin.firestore;
    const taskRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('aiCoachingPlan')
      .doc('current')
      .collection('tasks')
      .doc(taskId);
    await taskRef.set(
      {
        status,
        ...(evidenceNote !== undefined ? { evidenceNote } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        ...(status === 'completed' ? { completedAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    const snap = await taskRef.get();
    invalidateAiTrainingCacheForUser(req.user.uid);
    res.json({ row: { id: snap.id, ...serializeFirestoreData(snap.data() || {}) } });
  } catch (err) {
    console.error('[Users] patchAiCoachingTask:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update coaching task' });
  }
}

async function getAiCoachingImpact(req, res) {
  if (!ensureAdmin(req, res)) return;
  try {
    const cacheKey = buildAiTrainingCacheKey(req.user.uid, 'coaching-impact', req.query || {});
    const cached = readAiTrainingCache(cacheKey);
    if (cached) return res.json(cached);
    const requested = parseRange(req.query || {});
    const { planRef, plan, tasks } = await readCoachingPlanWithTasks(req.user.uid);
    const baselineFrom = plan?.baselineWindow?.from;
    const baselineTo = plan?.baselineWindow?.to;
    const baselineRange = (baselineFrom && baselineTo)
      ? { from: startOfDayIso(baselineFrom), end: endOfDayIso(baselineTo) }
      : requested;
    const [baselineRows, currentRows] = await Promise.all([
      readUserLogsInRange(req.user.uid, baselineRange.from, baselineRange.end, 2000),
      readUserLogsInRange(req.user.uid, requested.from, requested.end, 2000),
    ]);
    const baselineComp = summarizeCompetencies(baselineRows.filter((r) => r?.qaInsight?.score != null));
    const currentComp = summarizeCompetencies(currentRows.filter((r) => r?.qaInsight?.score != null));
    const currentMap = new Map(currentComp.map((row) => [row.key, row]));
    const focusKeys = Array.isArray(plan?.focusAreas) && plan.focusAreas.length
      ? plan.focusAreas.map((f) => f.competencyKey)
      : baselineComp.map((row) => row.key);
    const competencies = focusKeys.map((key) => {
      const base = baselineComp.find((row) => row.key === key);
      const curr = currentMap.get(key);
      const baselineScore = Number(base?.avgScore || 0);
      const currentScore = Number(curr?.avgScore || 0);
      return {
        key,
        competency: base?.label || curr?.label || key,
        baselineScore,
        currentScore,
        delta: currentScore - baselineScore,
      };
    });
    const completedTasks = (tasks || []).filter((t) => t.status === 'completed').length;
    const payload = {
      baselineWindow: plan?.baselineWindow || {
        from: baselineRange.from.toISOString().slice(0, 10),
        to: baselineRange.end.toISOString().slice(0, 10),
      },
      currentWindow: {
        from: requested.from.toISOString().slice(0, 10),
        to: requested.end.toISOString().slice(0, 10),
      },
      completedTasks,
      totalTasks: Array.isArray(tasks) ? tasks.length : 0,
      competencies,
    };

    const dayKey = requested.end.toISOString().slice(0, 10);
    const overallScore = competencies.length
      ? Math.round(competencies.reduce((acc, row) => acc + row.currentScore, 0) / competencies.length)
      : 0;
    await planRef.collection('metrics').doc(dayKey).set({
      dayKey,
      competencyScores: competencies.reduce((acc, row) => ({ ...acc, [row.key]: row.currentScore }), {}),
      overallScore,
      callCount: currentRows.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    writeAiTrainingCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error('[Users] getAiCoachingImpact:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load coaching impact' });
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
  getAiTrainingSummary,
  getAiTrainingTrend,
  getAiTrainingScorecards,
  getAiTrainingDrills,
  postAiTrainingDrillStatus,
  getAiCoachingPlan,
  patchAiCoachingTask,
  getAiCoachingImpact,
};
