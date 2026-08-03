const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { ratio } = require('../utils/managerAnalytics');

const VALID_PERIODS = new Set(['today', 'week', 'month', 'all']);
// Floor for "all-time" so we never enumerate an unbounded number of day keys.
const ALL_TIME_START = '2020-01-01';

function normalizePeriod(period) {
  const p = String(period || '').toLowerCase();
  return VALID_PERIODS.has(p) ? p : 'month';
}

function validateTz(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** Current calendar date (YYYY-MM-DD) in the given timezone. */
function todayStr(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add `n` days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a period ('today' | 'week' | 'month' | 'all') into an inclusive
 * [fromStr, toStr] YYYY-MM-DD range, anchored to "now" in the given timezone.
 * Weeks start on Monday.
 */
function periodToRange(period, tz) {
  const today = todayStr(tz);
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const offsetToMonday = (dow + 6) % 7;
    return { from: addDays(today, -offsetToMonday), to: today };
  }
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: ALL_TIME_START, to: today };
}

/** Enumerate inclusive UTC day keys (YYYY-MM-DD) between two date strings. */
function enumerateDayKeys(fromStr, toStr) {
  const keys = [];
  const cur = new Date(`${fromStr}T00:00:00.000Z`);
  while (cur.toISOString().slice(0, 10) <= toStr) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

/**
 * Read the pre-aggregated daily rollup docs (adminMetrics/daily/days/{day})
 * covering the range and sum each agent's buckets into a Map.
 * For 'all', lists the whole collection instead of enumerating keys.
 */
async function readAgentTotals(period, fromStr, toStr) {
  const db = getDb();
  const daysRef = db.collection('adminMetrics').doc('daily').collection('days');

  let docs;
  if (period === 'all') {
    const snap = await daysRef.get();
    docs = snap.docs;
  } else {
    const keys = enumerateDayKeys(fromStr, toStr);
    const refs = keys.map((k) => daysRef.doc(k));
    const snaps = await db.getAll(...refs);
    docs = snaps.filter((s) => s.exists);
  }

  const byAgent = new Map();
  docs.forEach((d) => {
    const data = d.data() || {};
    Object.entries(data.agents || {}).forEach(([agentId, val]) => {
      const prev = byAgent.get(agentId) || {
        agentId,
        calls: 0,
        billableCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      };
      prev.calls += Number(val?.calls || 0);
      prev.billableCalls += Number(val?.billableCalls || 0);
      prev.totalDuration += Number(val?.totalDuration || 0);
      prev.totalCost += Number(val?.totalCost || 0);
      byAgent.set(agentId, prev);
    });
  });
  return byAgent;
}

const POLICIES_CONCURRENCY = 10;

/**
 * Count policy_closed dispositions per agent by reading directly from each
 * agent's callLogs subcollection. This is the source of truth — no caching
 * layer, works for all historical and future data automatically.
 */
async function countPoliciesClosedFromLogs(agentIds, fromStr, toStr) {
  if (!agentIds.length) return new Map();
  const db = getDb();

  const fromMs = new Date(`${fromStr}T00:00:00.000Z`).getTime();
  const toMs   = new Date(`${toStr}T23:59:59.999Z`).getTime();

  const byAgent = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < agentIds.length) {
      const agentId = agentIds[cursor++]; // eslint-disable-line no-plusplus
      // eslint-disable-next-line no-await-in-loop
      const snap = await db
        .collection('users')
        .doc(agentId)
        .collection('callLogs')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();

      let count = 0;
      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        if (data.disposition !== 'policy_closed') return;
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate()
          : new Date(data.createdAt || 0);
        const t = createdAt.getTime();
        if (!Number.isNaN(t) && t >= fromMs && t <= toMs) count += 1;
      });

      if (count > 0) byAgent.set(agentId, count);
    }
  }

  const workers = Array.from(
    { length: Math.min(POLICIES_CONCURRENCY, Math.max(1, agentIds.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return byAgent;
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

/**
 * Fetch the set of platform agents: no agency AND role == 'agent'
 * (missing role defaults to 'agent'). Returns Map<uid, { name, photoURL }>.
 */
async function loadPlatformAgents() {
  const db = getDb();
  const snap = await db
    .collection('users')
    .select(
      'agencyId',
      'role',
      'fullName',
      'displayName',
      'name',
      'agentName',
      'firstName',
      'lastName',
      'email',
      'photoURL',
      'avatarUrl',
      'photoUrl',
    )
    .get();
  const map = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.agencyId) return;
    const role = data.role || 'agent';
    if (role !== 'agent') return;
    map.set(doc.id, {
      name: displayNameFromUserData(data),
      photoURL: data.photoURL || data.avatarUrl || data.photoUrl || null,
    });
  });
  return map;
}

/**
 * Many production user docs have no name/email fields — their display name
 * lives on the Firebase Auth record. Patch entries whose name is missing.
 */
async function fillNamesFromAuth(entries) {
  const missing = entries.filter((e) => !e.name);
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    // eslint-disable-next-line no-await-in-loop
    const out = await admin.auth().getUsers(chunk.map((e) => ({ uid: e.agentId })));
    const byUid = new Map(out.users.map((u) => [u.uid, u]));
    chunk.forEach((e) => {
      const u = byUid.get(e.agentId);
      if (u) {
        e.name = u.displayName || u.email || e.name;
        if (!e.photoURL && u.photoURL) e.photoURL = u.photoURL;
      }
    });
  }
  entries.forEach((e) => {
    if (!e.name) e.name = e.agentId;
  });
}

function buildEntry(agentId, meta, totals) {
  const calls = totals?.calls || 0;
  const billableCalls = totals?.billableCalls || 0;
  const totalDuration = totals?.totalDuration || 0;
  const totalCost = totals?.totalCost || 0;
  return {
    agentId,
    name: meta?.name || null,
    photoURL: meta?.photoURL || null,
    calls,
    billableCalls,
    policiesClosed: 0, // patched below after callLog scan
    policyClosedRate: 0, // patched below after callLog scan
    revenue: Number(totalCost.toFixed(2)),
    avgDuration: calls ? Math.round(totalDuration / calls) : 0,
    totalDuration,
  };
}

/**
 * Build the platform-agent leaderboard for a period.
 * Ranks by Policies Closed (disposition === 'policy_closed'), counted directly
 * from each agent's callLogs — no adminMetrics dependency, no backfill needed,
 * accurate for all historical and future dispositions.
 *
 * @param {object} opts
 * @param {string} opts.period  today | week | month | all (default month)
 * @param {string} [opts.tz]    IANA timezone for period boundaries
 * @param {string} [opts.viewerUid]  requesting user's uid, for the `me` field
 */
async function getLeaderboard({ period, tz, viewerUid } = {}) {
  if (!admin) throw new Error('Database service unavailable');
  const resolvedPeriod = normalizePeriod(period);
  const resolvedTz = validateTz(tz);
  const { from, to } = periodToRange(resolvedPeriod, resolvedTz);

  // Run adminMetrics read (calls/revenue) and platform agent load in parallel
  const [totalsByAgent, platformAgents] = await Promise.all([
    readAgentTotals(resolvedPeriod, from, to),
    loadPlatformAgents(),
  ]);

  const entries = [];
  totalsByAgent.forEach((totals, agentId) => {
    if (!platformAgents.has(agentId)) return;
    if (!totals.calls || !totals.billableCalls) return;
    entries.push(buildEntry(agentId, platformAgents.get(agentId), totals));
  });

  // Count policies closed directly from callLogs — source of truth.
  // This covers every historical disposition already submitted, plus all future
  // ones, without any caching, backfills, or adminMetrics writes.
  const platformAgentIds = [...platformAgents.keys()];
  const policiesClosedMap = await countPoliciesClosedFromLogs(platformAgentIds, from, to);

  // Patch entries with real policiesClosed counts
  entries.forEach((e) => {
    e.policiesClosed = policiesClosedMap.get(e.agentId) || 0;
    e.policyClosedRate = e.calls
      ? Number(((e.policiesClosed / e.calls) * 100).toFixed(1))
      : 0;
  });

  entries.sort(
    (a, b) =>
      b.policiesClosed - a.policiesClosed ||
      b.revenue - a.revenue ||
      b.calls - a.calls,
  );
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  let me = null;
  if (viewerUid) {
    const found = entries.find((e) => e.agentId === viewerUid);
    if (found) {
      me = found;
    } else if (platformAgents.has(viewerUid)) {
      me = { ...buildEntry(viewerUid, platformAgents.get(viewerUid), null), rank: null };
      me.policiesClosed = policiesClosedMap.get(viewerUid) || 0;
      me.policyClosedRate = 0;
    }
  }

  await fillNamesFromAuth(me && !entries.includes(me) ? [...entries, me] : entries);

  return {
    period: resolvedPeriod,
    window: { from, to },
    totalAgents: entries.length,
    entries,
    me,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getLeaderboard,
  // exported for potential reuse/testing
  periodToRange,
  ratio,
};
