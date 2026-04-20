const agentManager = require('../services/agentManager');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const phoneRouteService = require('../services/phoneRouteService');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const ANALYTICS_CACHE_TTL_MS = 30000;
const READ_CONCURRENCY = 10;
const analyticsCache = new Map();
const coachingCache = new Map();

function getCampaigns() {
  return Object.entries(CAMPAIGN_CONFIG).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    buffer: cfg.buffer,
    price: cfg.price,
  }));
}

function parseRange(query) {
  const now = new Date();
  const end = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(end.getTime() - (6 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
    throw new Error('Invalid date range');
  }
  return { from, end };
}

function dayKey(isoLike) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function getCallCreatedAt(log) {
  if (typeof log.createdAt === 'string') return log.createdAt;
  if (log.createdAt?.toDate) return log.createdAt.toDate().toISOString();
  if (typeof log.timestamp === 'string') return log.timestamp;
  return null;
}

function normalizeCall(doc) {
  const data = doc.data() || {};
  const createdAt = getCallCreatedAt(data);
  return {
    id: doc.id,
    agentId: data.agentId || null,
    campaign: data.campaign || 'unknown',
    campaignLabel: data.campaignLabel || data.campaign || 'unknown',
    status: data.status || 'unknown',
    duration: Number(data.duration || 0),
    isBillable: Boolean(data.isBillable),
    cost: Number(data.cost || 0),
    createdAt,
  };
}

async function readLogsInRange(from, end) {
  if (!admin) throw new Error('Database service unavailable');
  const db = getDb();
  const fromMs = from.getTime();
  const endMs = end.getTime();
  const usersSnap = await db.collection('users').get();
  const out = [];
  const docs = usersSnap.docs || [];
  let cursor = 0;

  async function worker() {
    while (cursor < docs.length) {
      const idx = cursor;
      cursor += 1;
      const userDoc = docs[idx];
      // eslint-disable-next-line no-await-in-loop
      const callsSnap = await userDoc.ref
        .collection('callLogs')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();
      callsSnap.docs.forEach((doc) => {
        const row = normalizeCall(doc);
        if (!row.createdAt) return;
        const t = new Date(row.createdAt).getTime();
        if (Number.isNaN(t)) return;
        if (t >= fromMs && t <= endMs) out.push(row);
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, Math.max(1, docs.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  return out;
}

function aggregateAnalytics(rows, from, end) {
  const byDayMap = new Map();
  const byCampaign = new Map();
  const byAgent = new Map();
  let totalCalls = 0;
  let answeredCalls = 0;
  let missedCalls = 0;
  let billableCalls = 0;
  let totalDuration = 0;
  let totalCost = 0;

  rows.forEach((r) => {
    const dKey = dayKey(r.createdAt);
    if (dKey) {
      if (!byDayMap.has(dKey)) {
        byDayMap.set(dKey, {
          day: dKey,
          totalCalls: 0,
          answeredCalls: 0,
          missedCalls: 0,
          billableCalls: 0,
          totalDuration: 0,
          totalCost: 0,
        });
      }
      const d = byDayMap.get(dKey);
      d.totalCalls += 1;
      if (r.status === 'completed') d.answeredCalls += 1;
      else d.missedCalls += 1;
      if (r.isBillable) d.billableCalls += 1;
      d.totalDuration += r.duration;
      d.totalCost += r.cost;
    }

    totalCalls += 1;
    if (r.status === 'completed') answeredCalls += 1;
    else missedCalls += 1;
    if (r.isBillable) billableCalls += 1;
    totalDuration += r.duration;
    totalCost += r.cost;

    const campaignId = r.campaign || 'unknown';
    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, {
        campaign: campaignId,
        campaignLabel: r.campaignLabel || campaignId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      });
    }
    const c = byCampaign.get(campaignId);
    c.calls += 1;
    if (r.status === 'completed') c.answeredCalls += 1;
    if (r.isBillable) c.billableCalls += 1;
    c.totalDuration += r.duration;
    c.totalCost += r.cost;

    const agentId = r.agentId || 'unknown';
    if (!byAgent.has(agentId)) {
      byAgent.set(agentId, {
        agentId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      });
    }
    const a = byAgent.get(agentId);
    a.calls += 1;
    if (r.status === 'completed') a.answeredCalls += 1;
    if (r.isBillable) a.billableCalls += 1;
    a.totalDuration += r.duration;
    a.totalCost += r.cost;
  });

  const byDay = [...byDayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const campaigns = [...byCampaign.values()]
    .map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
  const agents = [...byAgent.values()]
    .map((r) => ({
      ...r,
      answerRate: r.calls ? Number((r.answeredCalls / r.calls).toFixed(4)) : 0,
      billableRate: r.calls ? Number((r.billableCalls / r.calls).toFixed(4)) : 0,
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  return {
    from: from.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    summary: {
      totalCalls,
      answeredCalls,
      missedCalls,
      billableCalls,
      totalDuration,
      totalCost,
      answerRate: totalCalls ? Number((answeredCalls / totalCalls).toFixed(4)) : 0,
      billableRate: totalCalls ? Number((billableCalls / totalCalls).toFixed(4)) : 0,
    },
    byDay,
    campaigns,
    agents,
  };
}

function cacheKey(from, end) {
  return `${from.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}`;
}

function enumerateDayKeys(from, end) {
  const keys = [];
  const cur = new Date(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const endKey = end.toISOString().slice(0, 10);
  while (cur.toISOString().slice(0, 10) <= endKey) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

async function buildUserNameMap(agentIds = []) {
  const ids = [...new Set((agentIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const db = getDb();
  const refs = ids.map((id) => db.collection('users').doc(id));
  const snaps = await db.getAll(...refs);
  const map = new Map();
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const data = snap.data() || {};
    const candidate = data.fullName || data.name || data.email || null;
    if (candidate) map.set(snap.id, candidate);
  });
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const chunks = [];
    for (let i = 0; i < missing.length; i += 100) {
      chunks.push(missing.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      out.users.forEach((u) => {
        map.set(u.uid, u.displayName || u.email || u.uid);
      });
      chunk.forEach((uid) => {
        if (!map.has(uid)) map.set(uid, uid);
      });
    }
  }
  return map;
}

function aggregateFromDailyDocs(docs, from, end) {
  const byDay = [];
  const campaignsMap = new Map();
  const agentsMap = new Map();
  const summary = {
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    billableCalls: 0,
    totalDuration: 0,
    totalCost: 0,
    answerRate: 0,
    billableRate: 0,
  };

  docs.forEach((d) => {
    const data = d.data() || {};
    const day = data.day || d.id;
    const s = data.summary || {};
    const row = {
      day,
      totalCalls: Number(s.totalCalls || 0),
      answeredCalls: Number(s.answeredCalls || 0),
      missedCalls: Number(s.missedCalls || 0),
      billableCalls: Number(s.billableCalls || 0),
      totalDuration: Number(s.totalDuration || 0),
      totalCost: Number(s.totalCost || 0),
    };
    byDay.push(row);
    summary.totalCalls += row.totalCalls;
    summary.answeredCalls += row.answeredCalls;
    summary.missedCalls += row.missedCalls;
    summary.billableCalls += row.billableCalls;
    summary.totalDuration += row.totalDuration;
    summary.totalCost += row.totalCost;

    Object.entries(data.campaigns || {}).forEach(([campaignId, val]) => {
      const prev = campaignsMap.get(campaignId) || {
        campaign: campaignId,
        campaignLabel: val?.campaignLabel || campaignId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      };
      prev.calls += Number(val?.calls || 0);
      prev.answeredCalls += Number(val?.answeredCalls || 0);
      prev.billableCalls += Number(val?.billableCalls || 0);
      prev.totalDuration += Number(val?.totalDuration || 0);
      prev.totalCost += Number(val?.totalCost || 0);
      campaignsMap.set(campaignId, prev);
    });
    Object.entries(data.agents || {}).forEach(([agentId, val]) => {
      const prev = agentsMap.get(agentId) || {
        agentId,
        calls: 0,
        answeredCalls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      };
      prev.calls += Number(val?.calls || 0);
      prev.answeredCalls += Number(val?.answeredCalls || 0);
      prev.billableCalls += Number(val?.billableCalls || 0);
      prev.totalDuration += Number(val?.totalDuration || 0);
      prev.totalCost += Number(val?.totalCost || 0);
      agentsMap.set(agentId, prev);
    });
  });

  summary.answerRate = ratio(summary.answeredCalls, summary.totalCalls);
  summary.billableRate = ratio(summary.billableCalls, summary.totalCalls);

  const campaigns = [...campaignsMap.values()]
    .map((r) => ({
      ...r,
      answerRate: ratio(r.answeredCalls, r.calls),
      billableRate: ratio(r.billableCalls, r.calls),
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  const agents = [...agentsMap.values()]
    .map((r) => ({
      ...r,
      answerRate: ratio(r.answeredCalls, r.calls),
      billableRate: ratio(r.billableCalls, r.calls),
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  return {
    from: from.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    summary,
    byDay: byDay.sort((a, b) => a.day.localeCompare(b.day)),
    campaigns,
    agents,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'adminMetrics.daily',
      window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    },
  };
}

function getMetricEntryById(bucket = {}, id = '') {
  const target = String(id || '').trim().toLowerCase();
  if (!target) return null;
  const direct = bucket[id];
  if (direct) return direct;
  const foundKey = Object.keys(bucket).find((k) => String(k).toLowerCase() === target);
  return foundKey ? bucket[foundKey] : null;
}

function buildDrilldownFromDailyDocs(type, id, docs = []) {
  const byDay = [];
  const outcomes = { completed: 0, missed: 0, billable: 0 };
  docs
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    .forEach((d) => {
      const data = d.data() || {};
      const day = data.day || d.id;
      const bucket = type === 'campaign' ? (data.campaigns || {}) : (data.agents || {});
      const entry = getMetricEntryById(bucket, id);
      if (!entry) return;
      const calls = Number(entry.calls || 0);
      const answered = Number(entry.answeredCalls || 0);
      const billable = Number(entry.billableCalls || 0);
      if (calls <= 0) return;
      byDay.push({
        day,
        calls,
        answerRate: ratio(answered, calls),
        billableRate: ratio(billable, calls),
      });
      outcomes.completed += answered;
      outcomes.missed += Math.max(0, calls - answered);
      outcomes.billable += billable;
    });
  const totalCalls = byDay.reduce((acc, row) => acc + row.calls, 0);
  return {
    summary: {
      calls: totalCalls,
      answerRate: ratio(outcomes.completed, totalCalls),
      billableRate: ratio(outcomes.billable, totalCalls),
    },
    outcomes,
    trend: byDay,
    rowCount: totalCalls,
  };
}

function coachingCacheKey(scope, query = {}) {
  const normalized = {};
  Object.keys(query || {}).sort().forEach((k) => {
    normalized[k] = String(query[k]);
  });
  return `${scope}|${JSON.stringify(normalized)}`;
}

function readCoachingCache(key) {
  const hit = coachingCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    coachingCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCoachingCache(key, payload) {
  coachingCache.set(key, {
    payload,
    expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
  });
}

async function readCoachingRows(query = {}) {
  if (!admin) throw new Error('Database service unavailable');
  const db = getDb();
  const usersSnap = await db.collection('users').get();
  const docs = usersSnap.docs || [];
  const rows = [];
  let cursor = 0;

  function metricTs(data = {}) {
    if (data.updatedAt?.toDate) return data.updatedAt.toDate().getTime();
    if (typeof data.dayKey === 'string') return new Date(`${data.dayKey}T23:59:59.999Z`).getTime();
    return 0;
  }

  async function worker() {
    while (cursor < docs.length) {
      const idx = cursor;
      cursor += 1;
      const userDoc = docs[idx];
      // eslint-disable-next-line no-await-in-loop
      const planSnap = await userDoc.ref.collection('aiCoachingPlan').doc('current').get();
      if (!planSnap.exists) continue;
      // eslint-disable-next-line no-await-in-loop
      const [tasksSnap, metricsSnap] = await Promise.all([
        userDoc.ref.collection('aiCoachingPlan').doc('current').collection('tasks').get(),
        userDoc.ref.collection('aiCoachingPlan').doc('current').collection('metrics').limit(14).get(),
      ]);
      const userData = userDoc.data() || {};
      const plan = planSnap.data() || {};
      const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t) => t.status === 'completed').length;
      const completionRate = totalTasks ? completedTasks / totalTasks : 0;
      const metrics = metricsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a, b) => metricTs(b) - metricTs(a));
      const recent = metrics.slice(0, 7).map((m) => Number(m.overallScore || 0));
      const prior = metrics.slice(7, 14).map((m) => Number(m.overallScore || 0));
      const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
      const priorAvg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : recentAvg;
      const scoreDelta = Math.round(recentAvg - priorAvg);
      const risk = completionRate < 0.4 && recentAvg < 70 ? 'high' : completionRate < 0.65 ? 'medium' : 'low';
      const riskReasons = [];
      if (completionRate < 0.4) riskReasons.push('Low task completion');
      if (recentAvg < 70) riskReasons.push('Low recent coaching score');
      if (scoreDelta < 0) riskReasons.push('Negative trend vs prior period');
      if (!riskReasons.length) riskReasons.push('No acute blockers detected');
      const trendPoints = metrics
        .slice(0, 14)
        .map((m) => ({
          day: String(m.dayKey || '').slice(5),
          score: Number(m.overallScore || 0),
          callCount: Number(m.callCount || 0),
        }))
        .filter((p) => p.day)
        .reverse();
      rows.push({
        uid: userDoc.id,
        name: userData.fullName || userData.name || userData.email || userDoc.id,
        email: userData.email || '',
        status: plan.status || 'active',
        focusAreas: Array.isArray(plan.focusAreas) ? plan.focusAreas : [],
        totalTasks,
        completedTasks,
        completionRate: Number(completionRate.toFixed(4)),
        recentScoreAvg: Math.round(recentAvg),
        scoreDelta,
        risk,
        riskReasons,
        trendPoints,
        updatedAt: plan.updatedAt?.toDate ? plan.updatedAt.toDate().toISOString() : null,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, Math.max(1, docs.length)) }, () => worker()));

  const qStatus = String(query.status || '').trim().toLowerCase();
  const qRisk = String(query.risk || '').trim().toLowerCase();
  const qSearch = String(query.search || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (qStatus && qStatus !== 'all' && String(row.status || '').toLowerCase() !== qStatus) return false;
    if (qRisk && qRisk !== 'all' && String(row.risk || '').toLowerCase() !== qRisk) return false;
    if (qSearch && !(`${row.name} ${row.email}`.toLowerCase().includes(qSearch))) return false;
    return true;
  });
}

async function getAnalyticsBundle(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const key = cacheKey(from, end);
    const cached = analyticsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({
        ...cached.payload,
        cached: true,
        meta: {
          ...(cached.payload.meta || {}),
          generatedAt: cached.payload.meta?.generatedAt || new Date().toISOString(),
          cacheAgeMs: Date.now() - (cached.createdAt || Date.now()),
        },
      });
    }
    const db = getDb();
    const keys = enumerateDayKeys(from, end);
    const dayRefs = keys.map((k) => db.collection('adminMetrics').doc('daily').collection('days').doc(k));
    const snaps = await db.getAll(...dayRefs);
    const existing = snaps.filter((s) => s.exists);
    let payload;
    if (existing.length > 0) {
      payload = aggregateFromDailyDocs(existing, from, end);
    } else {
      const rows = await readLogsInRange(from, end);
      payload = {
        ...aggregateAnalytics(rows, from, end),
        meta: {
          generatedAt: new Date().toISOString(),
          source: 'firestore.users.callLogs.fanout',
          window: { from: from.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
        },
      };
    }
    const nameMap = await buildUserNameMap((payload.agents || []).map((a) => a.agentId));
    const enrichedPayload = {
      ...payload,
      agents: (payload.agents || []).map((a) => ({
        ...a,
        agentName: nameMap.get(a.agentId) || a.agentId,
      })),
    };

    analyticsCache.set(key, {
      payload: enrichedPayload,
      createdAt: Date.now(),
      expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
    });
    res.json({
      ...enrichedPayload,
      cached: false,
      meta: {
        ...(enrichedPayload.meta || {}),
        cacheAgeMs: 0,
      },
    });
  } catch (err) {
    console.error('[Admin] getAnalyticsBundle:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load analytics bundle' });
  }
}

async function getOverviewLite(req, res) {
  try {
    const overview = await agentManager.getOverview();
    const activeCalls = await agentManager.listActiveCalls();
    const nameMap = await buildUserNameMap([
      ...(overview.agents || []).map((a) => a.id),
      ...activeCalls.map((c) => c.agentId),
    ]);
    res.json({
      totalAgents: overview.totalAgents || 0,
      agents: (overview.agents || []).map((a) => ({
        ...a,
        displayName: nameMap.get(a.id) || a.id,
      })),
      pool: overview.pool || { available: [], ringing: [], busy: [] },
      byCampaign: overview.byCampaign || {},
      campaigns: getCampaigns(),
      live: {
        activeCalls: activeCalls.length,
        generatedAt: new Date().toISOString(),
        source: 'redis.activeCalls',
        rowCount: activeCalls.length,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'redis.agentPool+activeCalls',
      },
      liveCalls: activeCalls.map((row) => ({
        ...row,
        agentName: nameMap.get(row.agentId) || row.agentId,
      })),
    });
  } catch (err) {
    console.error('[Admin] getOverviewLite:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load overview lite' });
  }
}

async function listDids(req, res) {
  try {
    const routes = await phoneRouteService.listPhoneRoutes();
    res.json({ dids: routes });
  } catch (err) {
    console.error('[Admin] listDids:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load phone routes' });
  }
}

async function createDid(req, res) {
  try {
    const { phoneE164, campaignId, label, active } = req.body || {};
    const row = await phoneRouteService.createPhoneRoute({
      phoneE164,
      campaignId,
      label,
      active,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[Admin] createDid:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create route' });
  }
}

async function patchDid(req, res) {
  try {
    const { id } = req.params;
    const row = await phoneRouteService.updatePhoneRoute(id, req.body || {});
    res.json(row);
  } catch (err) {
    console.error('[Admin] patchDid:', err.message);
    const status = err.message === 'Route not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to update route' });
  }
}

async function deleteDid(req, res) {
  try {
    const { id } = req.params;
    const out = await phoneRouteService.deletePhoneRoute(id);
    res.json(out);
  } catch (err) {
    console.error('[Admin] deleteDid:', err.message);
    const status = err.message === 'Route not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to delete route' });
  }
}

async function getLiveCalls(req, res) {
  try {
    const rows = await agentManager.listActiveCalls();
    const nameMap = await buildUserNameMap(rows.map((r) => r.agentId));
    res.json({
      rows: rows.map((r) => ({
        ...r,
        agentName: nameMap.get(r.agentId) || r.agentId,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'redis.activeCalls',
        rowCount: rows.length,
      },
    });
  } catch (err) {
    console.error('[Admin] getLiveCalls:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load live calls' });
  }
}

async function getAnalyticsDrilldown(req, res) {
  try {
    const { from, end } = parseRange(req.query || {});
    const type = String(req.query.type || '').trim().toLowerCase();
    const id = String(req.query.id || '').trim();
    if (!['campaign', 'agent'].includes(type)) {
      return res.status(400).json({ error: 'type must be campaign or agent' });
    }
    if (!id) return res.status(400).json({ error: 'id is required' });

    const db = getDb();
    const dayKeys = enumerateDayKeys(from, end);
    const dayRefs = dayKeys.map((k) => db.collection('adminMetrics').doc('daily').collection('days').doc(k));
    const daySnaps = await db.getAll(...dayRefs);
    const existing = daySnaps.filter((s) => s.exists);
    if (existing.length) {
      const rollup = buildDrilldownFromDailyDocs(type, id, existing);
      if (rollup.summary.calls > 0) {
        return res.json({
          type,
          id,
          summary: rollup.summary,
          outcomes: rollup.outcomes,
          trend: rollup.trend,
          meta: {
            generatedAt: new Date().toISOString(),
            source: 'adminMetrics.daily',
            rowCount: rollup.rowCount,
          },
        });
      }
    }

    const rows = await readLogsInRange(from, end);
    const filtered = rows.filter((r) => (
      type === 'campaign' ? String(r.campaign || '').toLowerCase() === id.toLowerCase() : String(r.agentId || '').toLowerCase() === id.toLowerCase()
    ));
    const limited = filtered
      .slice()
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .slice(-5000);
    const byDay = new Map();
    const outcomes = { completed: 0, missed: 0, billable: 0 };
    limited.forEach((r) => {
      const key = dayKey(r.createdAt);
      if (!key) return;
      if (!byDay.has(key)) byDay.set(key, { day: key, calls: 0, answered: 0, billable: 0 });
      const d = byDay.get(key);
      d.calls += 1;
      if (r.status === 'completed') {
        d.answered += 1;
        outcomes.completed += 1;
      } else outcomes.missed += 1;
      if (r.isBillable) {
        d.billable += 1;
        outcomes.billable += 1;
      }
    });
    const trend = [...byDay.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        day: d.day,
        calls: d.calls,
        answerRate: ratio(d.answered, d.calls),
        billableRate: ratio(d.billable, d.calls),
      }));
    res.json({
      type,
      id,
      summary: {
        calls: limited.length,
        answerRate: ratio(outcomes.completed, limited.length),
        billableRate: ratio(outcomes.billable, limited.length),
      },
      outcomes,
      trend,
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'firestore.users.callLogs.fanout',
        rowCount: limited.length,
      },
    });
  } catch (err) {
    console.error('[Admin] getAnalyticsDrilldown:', err.message);
    const status = err.message === 'Invalid date range' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to load analytics drilldown' });
  }
}

async function getAiCoachingOverview(req, res) {
  try {
    const key = coachingCacheKey('overview', req.query || {});
    const cached = readCoachingCache(key);
    if (cached) return res.json({ ...cached, cached: true });
    const rows = await readCoachingRows(req.query || {});
    const statusDistribution = rows.reduce((acc, row) => ({
      ...acc,
      [row.status || 'unknown']: (acc[row.status || 'unknown'] || 0) + 1,
    }), {});
    const competencyTotals = new Map();
    rows.forEach((row) => {
      row.focusAreas.forEach((area) => {
        const keyName = area.competency || area.competencyKey || 'Unknown';
        if (!competencyTotals.has(keyName)) competencyTotals.set(keyName, { competency: keyName, total: 0, completed: 0 });
        const entry = competencyTotals.get(keyName);
        entry.total += 1;
        if (row.completionRate >= 0.7) entry.completed += 1;
      });
    });
    const completionByCompetency = [...competencyTotals.values()].map((row) => ({
      competency: row.competency,
      completionRate: row.total ? Number((row.completed / row.total).toFixed(4)) : 0,
      totalPlans: row.total,
    }));
    const payload = {
      summary: {
        totalAgents: rows.length,
        highRiskAgents: rows.filter((r) => r.risk === 'high').length,
        avgCompletionRate: rows.length
          ? Number((rows.reduce((acc, row) => acc + row.completionRate, 0) / rows.length).toFixed(4))
          : 0,
      },
      statusDistribution,
      completionByCompetency,
      highRiskAgents: rows
        .filter((r) => r.risk === 'high')
        .sort((a, b) => a.recentScoreAvg - b.recentScoreAvg)
        .slice(0, 10),
    };
    writeCoachingCache(key, payload);
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[Admin] getAiCoachingOverview:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load coaching overview' });
  }
}

async function getAiCoachingAgentPlans(req, res) {
  try {
    const key = coachingCacheKey('agent-plans', req.query || {});
    const cached = readCoachingCache(key);
    if (cached) return res.json({ ...cached, cached: true });
    const rows = await readCoachingRows(req.query || {});
    const payload = {
      rows: rows.sort((a, b) => {
        if (a.risk !== b.risk) return a.risk.localeCompare(b.risk);
        return b.completionRate - a.completionRate;
      }),
    };
    writeCoachingCache(key, payload);
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[Admin] getAiCoachingAgentPlans:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load coaching agent plans' });
  }
}

module.exports = {
  getOverviewLite,
  getAnalyticsBundle,
  getLiveCalls,
  getAnalyticsDrilldown,
  getAiCoachingOverview,
  getAiCoachingAgentPlans,
  listDids,
  createDid,
  patchDid,
  deleteDid,
};
