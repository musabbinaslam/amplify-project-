/**
 * Signup analytics for the admin Analytics & Reports page.
 *
 * A signup is a user whose onboarding was completed inside the range
 * (`onboarding.completedAt`, an ISO string written at signup for both
 * email and Google flows). Signups are grouped by the vertical(s) the agent
 * picked during onboarding. An agent who picked several verticals counts in
 * each of them, so per-vertical numbers can add up to more than the summary,
 * which is always based on unique agents.
 *
 * "Revenue" is the call spend those new agents generated inside the same
 * range (taken from the analytics bundle's per-agent totals).
 */

const UNSPECIFIED = 'Not specified';

function verticalsOf(user) {
  const raw = user?.onboarding?.verticals;
  const parts = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const cleaned = [...new Set(parts.map((v) => String(v || '').trim()).filter(Boolean))];
  return cleaned.length ? cleaned : [UNSPECIFIED];
}

function signupIso(user) {
  const v = user?.onboarding?.completedAt;
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function dayKeyIn(isoLike, tz) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  if (!tz) return d.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Inclusive list of YYYY-MM-DD keys between two day keys. */
function dayKeysBetween(fromKey, toKey, maxDays = 400) {
  const keys = [];
  if (!fromKey || !toKey || fromKey > toKey) return keys;
  const cur = new Date(`${fromKey}T00:00:00.000Z`);
  while (keys.length < maxDays) {
    const k = cur.toISOString().slice(0, 10);
    if (k > toKey) break;
    keys.push(k);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {object} p
 * @param {Array<{id:string}>} p.users      user docs (id + onboarding)
 * @param {Map<string, number>} p.spendByAgent  agentId -> call spend in range
 * @param {string} p.fromKey   first day key (in tz)
 * @param {string} p.toKey     last day key (in tz)
 * @param {string} [p.tz]
 */
function aggregateSignups({ users = [], spendByAgent = new Map(), fromKey, toKey, tz } = {}) {
  const days = dayKeysBetween(fromKey, toKey);
  const byDayMap = new Map(days.map((d) => [d, { day: d, total: 0, byVertical: {} }]));
  const groups = new Map();
  let signups = 0;
  let spendingAgents = 0;
  let revenue = 0;

  users.forEach((user) => {
    const iso = signupIso(user);
    const day = iso ? dayKeyIn(iso, tz) : null;
    if (!day || (fromKey && day < fromKey) || (toKey && day > toKey)) return;

    const spend = Number(spendByAgent.get(user.id)) || 0;
    signups += 1;
    if (spend > 0) spendingAgents += 1;
    revenue += spend;

    const verts = verticalsOf(user);
    const row = byDayMap.get(day);
    if (row) row.total += 1;

    verts.forEach((vertical) => {
      if (!groups.has(vertical)) {
        groups.set(vertical, { vertical, signups: 0, spendingAgents: 0, revenue: 0 });
      }
      const g = groups.get(vertical);
      g.signups += 1;
      if (spend > 0) g.spendingAgents += 1;
      g.revenue += spend;
      if (row) row.byVertical[vertical] = (row.byVertical[vertical] || 0) + 1;
    });
  });

  const verticals = [...groups.values()]
    .map((g) => ({
      ...g,
      revenue: round2(g.revenue),
      conversionRate: g.signups ? Number((g.spendingAgents / g.signups).toFixed(4)) : 0,
      revenuePerSignup: g.signups ? round2(g.revenue / g.signups) : 0,
      share: signups ? Number((g.signups / signups).toFixed(4)) : 0,
    }))
    .sort((a, b) => (b.signups - a.signups) || (b.revenue - a.revenue) || a.vertical.localeCompare(b.vertical));

  return {
    summary: {
      signups,
      spendingAgents,
      conversionRate: signups ? Number((spendingAgents / signups).toFixed(4)) : 0,
      revenue: round2(revenue),
      revenuePerSignup: signups ? round2(revenue / signups) : 0,
    },
    verticals,
    byDay: [...byDayMap.values()],
  };
}

module.exports = {
  UNSPECIFIED,
  verticalsOf,
  signupIso,
  dayKeysBetween,
  aggregateSignups,
};
