const agentManager = require('../services/agentManager');
const { getRedisKeyPrefix } = require('../config/redis');
const { CAMPAIGN_CONFIG } = require('../config/pricing');
const phoneRouteService = require('../services/phoneRouteService');
const socketRegistry = require('../sockets/socketRegistry');
const {
  broadcastNotificationToAllUsers,
  setMaintenanceState,
  getMaintenanceState,
  listBroadcasts,
  getBroadcast,
  updateBroadcast,
  revokeBroadcast,
  maintenanceDocRef,
} = require('../services/notificationService');
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

function mapRecentLogRow(r, extra = {}) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    agentId: r.agentId,
    callSid: r.callSid || null,
    campaign: r.campaignLabel || r.campaign,
    duration: r.duration,
    status: r.status,
    isBillable: r.isBillable,
    cost: r.cost,
    disposition: r.disposition,
    recordingUrl: r.recordingUrl || null,
    recordingSid: r.recordingSid || null,
    refunded: Boolean(r.refunded),
    refundReason: r.refundReason || null,
    contestId: r.contestId || null,
    contestStatus: r.contestStatus || null,
    ...extra,
  };
}

function normalizeCall(doc) {
  const data = doc.data() || {};
  const createdAt = getCallCreatedAt(data);
  return {
    id: doc.id,
    agentId: data.agentId || null,
    callSid: data.callSid || null,
    campaign: data.campaign || 'unknown',
    campaignLabel: data.campaignLabel || data.campaign || 'unknown',
    status: data.status || 'unknown',
    duration: Number(data.duration || 0),
    isBillable: Boolean(data.isBillable),
    cost: Number(data.cost || 0),
    disposition: data.disposition || null,
    recordingUrl: data.recordingUrl || null,
    recordingSid: data.recordingSid || null,
    refunded: Boolean(data.refunded),
    refundReason: data.refundReason || null,
    contestId: data.contestId || null,
    contestStatus: data.contestStatus || null,
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
        if (!row.agentId) row.agentId = userDoc.id;
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

async function buildUserMetaMap(agentIds = []) {
  const ids = [...new Set((agentIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const db = getDb();
  const refs = ids.map((id) => db.collection('users').doc(id));
  const snaps = await db.getAll(...refs);
  const map = new Map();
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    const data = snap.data() || {};
    const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    const candidate =
      data.fullName ||
      data.displayName ||
      data.name ||
      data.agentName ||
      firstLast ||
      data.email ||
      null;
    const phone = data.phoneNumber || data.phone || data.onboarding?.phone || null;
    // Wallet balance is stored in CENTS at users/{uid}.wallet.balance.
    // null = no wallet doc found; 0 = real zero balance.
    const balanceCents = typeof data.wallet?.balance === 'number' ? data.wallet.balance : null;
    if (candidate || phone || balanceCents !== null) {
      map.set(snap.id, { name: candidate, phone, balanceCents });
    }
  });
  const missing = ids.filter((id) => {
    const entry = map.get(id);
    return !entry || !entry.name || !entry.phone;
  });
  if (missing.length) {
    const chunks = [];
    for (let i = 0; i < missing.length; i += 100) {
      chunks.push(missing.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      out.users.forEach((u) => {
        const existing = map.get(u.uid) || {};
        map.set(u.uid, {
          name: existing.name || u.displayName || u.email || null,
          phone: existing.phone || u.phoneNumber || null,
          balanceCents: existing.balanceCents ?? null,
        });
      });
      chunk.forEach((uid) => {
        const existing = map.get(uid) || {};
        if (!existing.name) existing.name = uid;
        map.set(uid, existing);
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
    const metaMap = await buildUserMetaMap((payload.agents || []).map((a) => a.agentId));
    const enrichedPayload = {
      ...payload,
      agents: (payload.agents || []).map((a) => ({
        ...a,
        agentName: metaMap.get(a.agentId)?.name || a.agentId,
        phone: metaMap.get(a.agentId)?.phone || null,
        walletBalanceCents: metaMap.get(a.agentId)?.balanceCents ?? null,
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
    const routingDiagnostics = agentManager.getRoutingDiagnostics
      ? agentManager.getRoutingDiagnostics()
      : null;
    const metaMap = await buildUserMetaMap([
      ...(overview.agents || []).map((a) => a.id),
      ...activeCalls.map((c) => c.agentId),
    ]);
    res.json({
      totalAgents: overview.totalAgents || 0,
      agents: (overview.agents || []).map((a) => ({
        ...a,
        displayName: metaMap.get(a.id)?.name || a.id,
        phone: metaMap.get(a.id)?.phone || null,
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
        redisKeyPrefix: getRedisKeyPrefix() || null,
      },
      routingDiagnostics,
      liveCalls: activeCalls.map((row) => ({
        ...row,
        agentName: metaMap.get(row.agentId)?.name || row.agentId,
        phone: metaMap.get(row.agentId)?.phone || null,
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
    const metaMap = await buildUserMetaMap(rows.map((r) => r.agentId));
    res.json({
      rows: rows.map((r) => ({
        ...r,
        agentName: metaMap.get(r.agentId)?.name || r.agentId,
        phone: metaMap.get(r.agentId)?.phone || null,
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

async function forceRemoveAgent(req, res) {
  try {
    const { agentId } = req.params;
    if (!agentId || !agentId.trim()) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    // Forcefully remove the agent from the pool and clear all their state
    await agentManager.removeAgent(agentId.trim());
    const adminUid = req.user?.uid || 'unknown';
    console.log(`[Admin] 🚨 Force-removed agent ${agentId} by admin ${adminUid}`);
    res.json({ success: true, agentId: agentId.trim(), action: 'removed' });
  } catch (err) {
    console.error('[Admin] forceRemoveAgent:', err.message);
    res.status(500).json({ error: err.message || 'Failed to remove agent' });
  }
}

async function getAllUsers(req, res) {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const snap = await db.collection('users').get();
    const users = [];
    const missing = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
      const name =
        data.fullName ||
        data.displayName ||
        data.name ||
        data.agentName ||
        firstLast ||
        data.email ||
        null;
      users.push({
        uid: doc.id,
        name,
        email: data.email || null,
        role: data.role || 'agent',
        managedAgents: Array.isArray(data.managedAgents) ? data.managedAgents : [],
      });
      if (!name) missing.push(doc.id);
    });

    // Backfill display names from Firebase Auth for users with no Firestore name.
    if (missing.length && admin) {
      const byId = new Map(users.map((u) => [u.uid, u]));
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        // eslint-disable-next-line no-await-in-loop
        const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
        out.users.forEach((u) => {
          const entry = byId.get(u.uid);
          if (entry) entry.name = entry.name || u.displayName || u.email || u.uid;
        });
      }
    }
    users.forEach((u) => { if (!u.name) u.name = u.uid; });
    users.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    res.json({ users });
  } catch (err) {
    console.error('[Admin] getAllUsers:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list users' });
  }
}

async function patchManagerSettings(req, res) {
  try {
    const uid = String(req.params.uid || '').trim();
    if (!uid) return res.status(400).json({ error: 'uid is required' });

    const { role, managedAgents } = req.body || {};
    if (!['agent', 'manager'].includes(role)) {
      return res.status(400).json({ error: "role must be 'agent' or 'manager'" });
    }
    if (managedAgents != null && !Array.isArray(managedAgents)) {
      return res.status(400).json({ error: 'managedAgents must be an array of user UIDs' });
    }

    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const targetRef = db.collection('users').doc(uid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return res.status(404).json({ error: 'User not found' });

    // Sanitize the allowlist: unique, truthy, and exclude self-management.
    const cleanedAgents = role === 'manager'
      ? [...new Set((managedAgents || []).filter((id) => typeof id === 'string' && id.trim() && id !== uid))]
      : [];

    // Validate the allowlist refers to real user docs (prevents typos / stale UIDs).
    if (cleanedAgents.length) {
      const refs = cleanedAgents.map((id) => db.collection('users').doc(id));
      const snaps = await db.getAll(...refs);
      const invalid = snaps.filter((s) => !s.exists).map((s) => s.id);
      if (invalid.length) {
        return res.status(400).json({ error: `Unknown agent UID(s): ${invalid.join(', ')}` });
      }
    }

    const { FieldValue } = admin.firestore;
    await targetRef.set(
      {
        role,
        managedAgents: cleanedAgents,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`[Admin] Set role=${role} managedAgents=${cleanedAgents.length} on ${uid} by ${req.user?.uid || 'unknown'}`);
    res.json({ success: true, uid, role, managedAgents: cleanedAgents });
  } catch (err) {
    console.error('[Admin] patchManagerSettings:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update manager settings' });
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
        // Daily docs don't have individual logs, so we'll just return empty recentLogs here
        // If the admin needs logs, we should probably fetch them from the database
        // But for now, we'll fetch the most recent 50 logs from firestore directly
        const rows = await readLogsInRange(from, end);
        const filtered = rows.filter((r) => (
          type === 'campaign' ? String(r.campaign || '').toLowerCase() === id.toLowerCase() : String(r.agentId || '').toLowerCase() === id.toLowerCase()
        ));
        const recentLogs = filtered
          .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
          .slice(-50)
          .reverse();

        const metaMap = await buildUserMetaMap(recentLogs.map((r) => r.agentId));

        const enrichedLogs = recentLogs.map((r) => mapRecentLogRow(r, {
            agentName: metaMap.get(r.agentId)?.name || r.agentId,
            phone: metaMap.get(r.agentId)?.phone || null,
        }));

        return res.json({
          type,
          id,
          summary: rollup.summary,
          outcomes: rollup.outcomes,
          trend: rollup.trend,
          recentLogs: enrichedLogs,
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
      recentLogs: limited.slice(-50).reverse().map((r) => mapRecentLogRow(r)),
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

// ─── Referral Admin ──────────────────────────────────────────────────────────

const referralService = require('../services/referralService');

async function getReferralOverview(req, res) {
  try {
    const overview = await referralService.getAdminReferralOverview();
    res.json(overview);
  } catch (err) {
    console.error('[Admin] getReferralOverview:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load referral overview' });
  }
}

async function searchReferralsHandler(req, res) {
  try {
    const results = await referralService.searchReferrals(req.query || {});
    res.json({ referrals: results });
  } catch (err) {
    console.error('[Admin] searchReferrals:', err.message);
    res.status(500).json({ error: err.message || 'Failed to search referrals' });
  }
}

async function updateReferralStatusHandler(req, res) {
  try {
    const { referralId } = req.params;
    const { status, reason } = req.body || {};

    if (!referralId || !referralId.includes('/')) {
      return res.status(400).json({ error: 'referralId must be in format referrerUid/refereeUid' });
    }
    if (!status) return res.status(400).json({ error: 'status is required' });

    const [referrerUid, refereeUid] = referralId.split('/');
    await referralService.updateReferralStatus(referrerUid, refereeUid, status, reason);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] updateReferralStatus:', err.message);
    const code = err.message.includes('not found') ? 404 : 400;
    res.status(code).json({ error: err.message || 'Failed to update referral status' });
  }
}

async function grantDiscountHandler(req, res) {
  try {
    const { uid, percent } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    await referralService.grantDiscount(uid, percent || undefined);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] grantDiscount:', err.message);
    res.status(500).json({ error: err.message || 'Failed to grant discount' });
  }
}

async function revokeDiscountHandler(req, res) {
  try {
    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    await referralService.revokeDiscount(uid);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] revokeDiscount:', err.message);
    res.status(500).json({ error: err.message || 'Failed to revoke discount' });
  }
}

async function postBroadcastNotification(req, res) {
  try {
    const payload = await broadcastNotificationToAllUsers(
      {
        type: 'admin_broadcast',
        title: req.body?.title,
        body: req.body?.body,
        priority: req.body?.priority,
        expiresAt: req.body?.expiresAt,
      },
      req.user?.uid || 'admin',
      req.user?.uid || null,
    );
    payload.created.forEach(({ uid, id }) => {
      socketRegistry.emitToAgent(uid, 'notification:new', {
        id,
        broadcastId: payload.broadcastId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        source: 'admin',
        read: false,
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt || null,
      });
    });
    res.status(201).json({
      success: true,
      broadcastId: payload.broadcastId,
      recipientCount: payload.recipientCount,
      createdCount: payload.createdCount,
      message: 'Broadcast sent',
    });
  } catch (err) {
    console.error('[Admin] postBroadcastNotification:', err.message);
    const status = /required|exceeds|must|Invalid|priority/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to send broadcast' });
  }
}

async function patchMaintenance(req, res) {
  try {
    const maintenance = await setMaintenanceState(req.body || {}, req.user?.uid || null);
    const db = getDb();
    const usersSnap = await db.collection('users').select().limit(20000).get();
    usersSnap.docs.forEach((doc) => {
      socketRegistry.emitToAgent(doc.id, 'maintenance:update', maintenance);
    });

    if (maintenance.active) {
      const payload = await broadcastNotificationToAllUsers(
        {
          type: 'maintenance',
          title: maintenance.title || 'Maintenance update',
          body: maintenance.message || 'Maintenance update has been posted.',
          priority: 'high',
          expiresAt: maintenance.endsAt || null,
        },
        req.user?.uid || 'admin',
        req.user?.uid || null,
      );
      await maintenanceDocRef().set({ broadcastId: payload.broadcastId }, { merge: true });
      const linkedMaintenance = await getMaintenanceState();
      payload.created.forEach(({ uid, id }) => {
        socketRegistry.emitToAgent(uid, 'notification:new', {
          id,
          broadcastId: payload.broadcastId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          priority: payload.priority,
          source: 'admin',
          read: false,
          createdAt: payload.createdAt,
          expiresAt: payload.expiresAt || null,
        });
      });
      usersSnap.docs.forEach((doc) => {
        socketRegistry.emitToAgent(doc.id, 'maintenance:update', linkedMaintenance);
      });
      res.json({ maintenance: linkedMaintenance, broadcastId: payload.broadcastId });
      return;
    }
    res.json({ maintenance });
  } catch (err) {
    console.error('[Admin] patchMaintenance:', err.message);
    const status = /required|exceeds|must|valid date/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to update maintenance state' });
  }
}

async function getBroadcastNotifications(req, res) {
  try {
    const out = await listBroadcasts({
      limit: req.query?.limit,
      cursor: req.query?.cursor,
    });
    res.json(out);
  } catch (err) {
    console.error('[Admin] getBroadcastNotifications:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list broadcasts' });
  }
}

async function getBroadcastNotification(req, res) {
  try {
    const out = await getBroadcast(req.params.id);
    res.json(out);
  } catch (err) {
    console.error('[Admin] getBroadcastNotification:', err.message);
    const status = /not found/i.test(err.message) ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to read broadcast' });
  }
}

async function patchBroadcastNotification(req, res) {
  try {
    const out = await updateBroadcast(req.params.id, req.body || {}, req.user?.uid || null);
    const syncPayload = {
      broadcastId: out.row.id,
      type: out.row.type,
      title: out.row.title,
      body: out.row.body,
      priority: out.row.priority,
      expiresAt: out.row.expiresAt || null,
    };
    out.affectedUids.forEach((uid) => {
      socketRegistry.emitToAgent(uid, 'notification:updated', syncPayload);
    });
    if (out.maintenance) {
      const db = getDb();
      const usersSnap = await db.collection('users').select().limit(20000).get();
      usersSnap.docs.forEach((doc) => {
        socketRegistry.emitToAgent(doc.id, 'maintenance:update', out.maintenance);
      });
    }
    res.json({ row: out.row, updatedCount: out.affectedUids.length });
  } catch (err) {
    console.error('[Admin] patchBroadcastNotification:', err.message);
    const status = /not found/i.test(err.message) ? 404 : (/revoked|required|exceeds|must|Invalid|priority/i.test(err.message) ? 400 : 500);
    res.status(status).json({ error: err.message || 'Failed to update broadcast' });
  }
}

async function deleteBroadcastNotification(req, res) {
  try {
    const out = await revokeBroadcast(req.params.id, req.user?.uid || null);
    out.affectedUids.forEach((uid) => {
      socketRegistry.emitToAgent(uid, 'notification:removed', { broadcastId: req.params.id });
    });
    res.json({ row: out.row, removedCount: out.affectedUids.length });
  } catch (err) {
    console.error('[Admin] deleteBroadcastNotification:', err.message);
    const status = /not found/i.test(err.message) ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to revoke broadcast' });
  }
}

async function getMaintenance(req, res) {
  try {
    const maintenance = await getMaintenanceState();
    res.json({ maintenance });
  } catch (err) {
    console.error('[Admin] getMaintenance:', err.message);
    res.status(500).json({ error: err.message || 'Failed to read maintenance state' });
  }
}

async function getPoolDebug(req, res) {
  try {
    const { redisClient } = require('../config/redis');
    const { CAMPAIGN_CONFIG } = require('../config/pricing');

    const campaignIds = Object.keys(CAMPAIGN_CONFIG);
    const allAgentsRaw = await redisClient.hGetAll('agents:data') || {};
    const [ringing, busy] = await Promise.all([
      redisClient.sMembers('agents:ringing'),
      redisClient.sMembers('agents:busy'),
    ]);

    const poolsByCampaign = {};
    for (const cId of campaignIds) {
      const members = await redisClient.zRangeWithScores(`pool:${cId}`, 0, -1);
      poolsByCampaign[cId] = members.map(({ value, score }) => ({ agentId: value, score }));
    }

    const agentDetails = {};
    for (const [id, raw] of Object.entries(allAgentsRaw)) {
      try {
        const d = JSON.parse(raw);
        const heartbeat = await redisClient.get(`agent:heartbeat:${id}`);
        const voiceReady = await redisClient.get(`agent:voice_ready:${id}`);
        const pending = await redisClient.get(`agent:pendingcall:${id}`);
        agentDetails[id] = {
          status: d.status,
          campaign: d.campaignId,
          states: JSON.parse(d.licensedStates || '[]'),
          sessionId: d.sessionId,
          lastSeenAt: d.lastSeenAt ? new Date(Number(d.lastSeenAt)).toISOString() : null,
          hasHeartbeat: Boolean(heartbeat),
          hasVoiceReady: Boolean(voiceReady),
          hasPendingCall: Boolean(pending),
          pendingCallSid: pending ? JSON.parse(pending).callSid : null,
          inRinging: ringing.includes(id),
          inBusy: busy.includes(id),
          inPool: Object.entries(poolsByCampaign).some(([, members]) => members.some(m => m.agentId === id)),
        };
      } catch { /* ignore */ }
    }

    return res.json({
      pools: poolsByCampaign,
      ringing,
      busy,
      agents: agentDetails,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Admin] getPoolDebug:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function serviceErrorStatus(err) {
  const map = {
    NOT_FOUND: 404,
    ALREADY_REFUNDED: 409,
    NOT_BILLABLE: 400,
    REASON_TOO_SHORT: 400,
    CONTEST_PENDING: 409,
    CONTEST_EXPIRED: 400,
    PROOF_REQUIRED: 400,
    INVALID_CATEGORY: 400,
    INVALID_STATE: 409,
    UNAVAILABLE: 503,
  };
  return map[err.code] || 500;
}

async function enrichContestsWithAgentNames(contests) {
  if (!contests.length) return contests;
  const metaMap = await buildUserMetaMap(contests.map((c) => c.agentId));
  return contests.map((c) => ({
    ...c,
    agentName: metaMap.get(c.agentId)?.name || c.agentId,
  }));
}

async function listCallContests(req, res) {
  try {
    const callContestService = require('../services/callContestService');
    const status = String(req.query.status || 'pending').trim().toLowerCase();
    const limit = Number(req.query.limit || 50);
    let contests = await callContestService.listContests({ status, limit });
    contests = await enrichContestsWithAgentNames(contests);
    res.json({ contests });
  } catch (err) {
    console.error('[Admin] listCallContests:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to list contests' });
  }
}

async function getCallContest(req, res) {
  try {
    const callContestService = require('../services/callContestService');
    const contest = await callContestService.getContest(req.params.contestId);
    if (!contest) return res.status(404).json({ error: 'Contest not found' });
    const [enriched] = await enrichContestsWithAgentNames([contest]);
    res.json({ contest: enriched });
  } catch (err) {
    console.error('[Admin] getCallContest:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load contest' });
  }
}

async function approveCallContest(req, res) {
  try {
    const callContestService = require('../services/callContestService');
    const { reason } = req.body || {};
    const result = await callContestService.approveContest(
      req.params.contestId,
      req.user.uid,
      reason,
    );
    res.json(result);
  } catch (err) {
    console.error('[Admin] approveCallContest:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to approve contest' });
  }
}

async function denyCallContest(req, res) {
  try {
    const callContestService = require('../services/callContestService');
    const { adminNote } = req.body || {};
    const result = await callContestService.denyContest(
      req.params.contestId,
      req.user.uid,
      adminNote,
    );
    res.json(result);
  } catch (err) {
    console.error('[Admin] denyCallContest:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to deny contest' });
  }
}

async function refundCallHandler(req, res) {
  try {
    const callLogService = require('../services/callLogService');
    const { agentId, callLogId, reason } = req.body || {};
    if (!agentId || !callLogId) {
      return res.status(400).json({ error: 'agentId and callLogId are required' });
    }

    const log = await callLogService.getCallLog(agentId, callLogId);
    if (!log) return res.status(404).json({ error: 'Call log not found' });
    if (log.contestStatus === 'pending') {
      return res.status(409).json({ error: 'Resolve the pending contest before issuing a direct refund' });
    }

    const result = await callLogService.refundCall(agentId, callLogId, {
      reason,
      adminUid: req.user.uid,
      contestId: null,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] refundCall:', err.message);
    res.status(serviceErrorStatus(err)).json({ error: err.message || 'Failed to refund call' });
  }
}

module.exports = {
  getOverviewLite,
  getAnalyticsBundle,
  getLiveCalls,
  forceRemoveAgent,
  getAllUsers,
  patchManagerSettings,
  getAnalyticsDrilldown,
  getAiCoachingOverview,
  getAiCoachingAgentPlans,
  listDids,
  createDid,
  patchDid,
  deleteDid,
  getReferralOverview,
  searchReferrals: searchReferralsHandler,
  updateReferralStatus: updateReferralStatusHandler,
  grantDiscount: grantDiscountHandler,
  revokeDiscount: revokeDiscountHandler,
  postBroadcastNotification,
  getBroadcastNotifications,
  getBroadcastNotification,
  patchBroadcastNotification,
  deleteBroadcastNotification,
  patchMaintenance,
  getMaintenance,
  getPoolDebug,
  listCallContests,
  getCallContest,
  approveCallContest,
  denyCallContest,
  refundCall: refundCallHandler,
};
