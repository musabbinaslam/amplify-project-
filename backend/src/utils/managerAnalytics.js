const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const agencyService = require('../services/agencyService');

const READ_CONCURRENCY = 10;

/**
 * Validate an IANA timezone string. Returns the tz if valid, null otherwise.
 */
function validateTz(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/**
 * Convert a YYYY-MM-DD date string to a UTC Date representing
 * midnight (or end-of-day) in the given IANA timezone.
 * Falls back to UTC if tz is null/invalid.
 */
function dateStrToUtcInTz(dateStr, endOfDay, tz) {
  if (!tz) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    return new Date(`${dateStr}${suffix}`);
  }
  // Use midday UTC as a reference to safely determine the tz offset
  // (avoids DST edge cases that occur exactly at midnight)
  const midday = new Date(`${dateStr}T12:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(midday).map((p) => [p.type, Number(p.value)]),
  );
  // offsetMs = (local time at UTC noon) - (UTC noon)
  const offsetMs = (parts.hour * 3600 + parts.minute * 60 + parts.second - 12 * 3600) * 1000;
  const base = endOfDay
    ? new Date(`${dateStr}T23:59:59.999Z`)
    : new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(base.getTime() - offsetMs);
}

function parseRange(query = {}) {
  const tz = validateTz(query.tz);
  const now = new Date();
  const end = query.to ? dateStrToUtcInTz(query.to, true, tz) : now;
  const from = query.from
    ? dateStrToUtcInTz(query.from, false, tz)
    : new Date(end.getTime() - (6 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
    throw new Error('Invalid date range');
  }
  return { from, end, tz };
}

/**
 * Returns the YYYY-MM-DD day key for a timestamp, bucketed in the given timezone.
 * Falls back to UTC if tz is null.
 */
function dayKey(isoLike, tz) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  if (!tz) return d.toISOString().slice(0, 10);
  // en-CA locale produces YYYY-MM-DD natively
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function ratio(a, b) {
  return b ? Number((a / b).toFixed(4)) : 0;
}

function getCallCreatedAt(data) {
  if (typeof data.createdAt === 'string') return data.createdAt;
  if (data.createdAt?.toDate) return data.createdAt.toDate().toISOString();
  if (typeof data.timestamp === 'string') return data.timestamp;
  return null;
}

function normalizeCall(doc, fallbackAgentId) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    agentId: data.agentId || fallbackAgentId || null,
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
    qaAudioReview: data.qaAudioReview
      ? {
          status: data.qaAudioReview.status || null,
          summary: data.qaAudioReview.summary || '',
          violations: Array.isArray(data.qaAudioReview.violations) ? data.qaAudioReview.violations : [],
        }
      : null,
    refunded: Boolean(data.refunded),
    refundReason: data.refundReason || null,
    contestId: data.contestId || null,
    contestStatus: data.contestStatus || null,
    createdAt: getCallCreatedAt(data),
  };
}

async function resolveAgentIds(allowed, agencyId = null) {
  const db = getDb();
  if (agencyId) {
    return agencyService.listAgencyMemberIds(agencyId);
  }
  if (Array.isArray(allowed)) return [...new Set(allowed.filter(Boolean))];
  const usersSnap = await db.collection('users').where('agencyId', '==', null).select().get();
  return usersSnap.docs.map((d) => d.id);
}

async function readLogsForAgents(agentIds, from, end) {
  if (!admin) throw new Error('Database service unavailable');
  if (!agentIds.length) return [];
  const db = getDb();
  const fromMs = from.getTime();
  const endMs = end.getTime();
  const out = [];
  let cursor = 0;

  async function worker() {
    while (cursor < agentIds.length) {
      const idx = cursor;
      cursor += 1;
      const agentId = agentIds[idx];
      // eslint-disable-next-line no-await-in-loop
      const callsSnap = await db
        .collection('users')
        .doc(agentId)
        .collection('callLogs')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();
      callsSnap.docs.forEach((doc) => {
        const row = normalizeCall(doc, agentId);
        if (!row.createdAt) return;
        const t = new Date(row.createdAt).getTime();
        if (Number.isNaN(t)) return;
        if (t >= fromMs && t <= endMs) out.push(row);
      });
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, Math.max(1, agentIds.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

function aggregateByAgent(rows) {
  const byAgent = new Map();
  rows.forEach((r) => {
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
  return [...byAgent.values()]
    .map((r) => ({
      ...r,
      answerRate: ratio(r.answeredCalls, r.calls),
      billableRate: ratio(r.billableCalls, r.calls),
      avgHandleTime: r.calls ? Math.round(r.totalDuration / r.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);
}

function summarize(rows) {
  let totalCalls = 0;
  let answeredCalls = 0;
  let missedCalls = 0;
  let billableCalls = 0;
  let totalDuration = 0;
  let totalCost = 0;
  rows.forEach((r) => {
    totalCalls += 1;
    if (r.status === 'completed') answeredCalls += 1;
    else missedCalls += 1;
    if (r.isBillable) billableCalls += 1;
    totalDuration += r.duration;
    totalCost += r.cost;
  });
  return {
    totalCalls,
    answeredCalls,
    missedCalls,
    billableCalls,
    totalDuration,
    totalCost,
    answerRate: ratio(answeredCalls, totalCalls),
    billableRate: ratio(billableCalls, totalCalls),
  };
}

function aggregateChartSeries(rows, tz) {
  const byDayMap = new Map();
  const byCampaign = new Map();

  rows.forEach((r) => {
    const dKey = dayKey(r.createdAt, tz);
    if (dKey) {
      if (!byDayMap.has(dKey)) {
        byDayMap.set(dKey, { day: dKey, calls: 0, answered: 0, billable: 0, totalCost: 0 });
      }
      const d = byDayMap.get(dKey);
      d.calls += 1;
      if (r.status === 'completed') d.answered += 1;
      if (r.isBillable) {
        d.billable += 1;
        d.totalCost += Number(r.cost || 0);
      }
    }

    const campaignId = r.campaign || 'unknown';
    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, {
        campaignId,
        label: r.campaignLabel || campaignId,
        calls: 0,
        billable: 0,
        totalCost: 0,
      });
    }
    const c = byCampaign.get(campaignId);
    c.calls += 1;
    if (r.isBillable) {
      c.billable += 1;
      c.totalCost += Number(r.cost || 0);
    }
  });

  const byDay = [...byDayMap.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({
      ...d,
      answerRate: ratio(d.answered, d.calls),
      billableRate: ratio(d.billable, d.calls),
    }));

  const campaigns = [...byCampaign.values()]
    .sort((a, b) => b.calls - a.calls);

  return { byDay, campaigns };
}

function displayNameFromUserData(data = {}) {
  const firstLast = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
  return (
    data.fullName ||
    data.displayName ||
    data.name ||
    data.agentName ||
    firstLast ||
    data.email ||
    null
  );
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
    const name = displayNameFromUserData(data);
    const phone = data.phoneNumber || data.phone || data.onboarding?.phone || null;
    map.set(snap.id, { name, phone, email: data.email || null, role: data.role || 'agent' });
  });

  const missing = ids.filter((id) => {
    const entry = map.get(id);
    return !entry || !entry.name || !entry.phone;
  });
  if (missing.length && admin) {
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      // eslint-disable-next-line no-await-in-loop
      const out = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      out.users.forEach((u) => {
        const existing = map.get(u.uid) || {};
        map.set(u.uid, {
          name: existing.name || u.displayName || u.email || null,
          phone: existing.phone || u.phoneNumber || null,
          email: existing.email || u.email || null,
          role: existing.role || 'agent',
        });
      });
    }
  }
  return map;
}

module.exports = {
  parseRange,
  dayKey,
  ratio,
  resolveAgentIds,
  readLogsForAgents,
  aggregateByAgent,
  summarize,
  aggregateChartSeries,
  buildUserMetaMap,
  displayNameFromUserData,
};
