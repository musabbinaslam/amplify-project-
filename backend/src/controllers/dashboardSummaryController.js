const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const MAX_LOGS_PER_RANGE = 1000;
const RECENT_LIMIT = 5;
const SUMMARY_FIELDS = [
  'createdAt', 'status', 'duration', 'cost', 'isBillable', 'disposition',
  'from', 'campaign', 'campaignLabel', 'type', 'callSid',
];

const DISPOSITION_LABELS = {
  sold: 'Sold',
  callback: 'Callback',
  not_interested: 'Not Interested',
  no_answer: 'No Answer',
};

function dispositionLabel(log) {
  if (log.disposition && DISPOSITION_LABELS[log.disposition]) return DISPOSITION_LABELS[log.disposition];
  if (log.isBillable) return 'Sold';
  if (log.status === 'missed') return 'Missed';
  if (log.status === 'completed' && Number(log.duration) > 0) return 'Answered';
  return 'No Answer';
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeTz(tz) {
  if (!tz) return 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function toIso(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value || null;
}

async function readRange(uid, startDate, endDate) {
  const snap = await getDb()
    .collection('users')
    .doc(uid)
    .collection('callLogs')
    .orderBy('createdAt', 'desc')
    .where('createdAt', '>=', startDate)
    .where('createdAt', '<=', endDate)
    .select(...SUMMARY_FIELDS)
    .limit(MAX_LOGS_PER_RANGE)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return { id: doc.id, ...data, createdAt: toIso(data.createdAt) };
  });
}

function summarize(logs, todayStartMs) {
  let todayCalls = 0;
  let conversions = 0;
  let answeredCalls = 0;
  let spend = 0;
  let totalTalkTimeSecs = 0;
  logs.forEach((l) => {
    if (new Date(l.createdAt || 0).getTime() >= todayStartMs) todayCalls += 1;
    if (l.isBillable) conversions += 1;
    if (l.status === 'completed' && Number(l.duration) > 0) answeredCalls += 1;
    spend += Number(l.cost) || 0;
    totalTalkTimeSecs += Number(l.duration) || 0;
  });
  const totalCalls = logs.length;
  return {
    todayCalls,
    totalCalls,
    answeredCalls,
    sales: conversions,
    answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
    bufferHitRate: answeredCalls > 0 ? Math.round((conversions / answeredCalls) * 100) : 0,
    spend,
    totalTalkTimeSecs,
  };
}

/**
 * GET /api/users/me/dashboard-summary
 * Query: startDate, endDate, prevStartDate, prevEndDate, todayStart (ISO), tz (IANA)
 * Returns the Dashboard's aggregates so the client no longer downloads raw logs.
 */
async function getDashboardSummary(req, res) {
  try {
    if (!admin) return res.status(503).json({ error: 'Database unavailable' });
    const uid = req.user.uid;
    const startDate = parseDate(req.query.startDate);
    const endDate = parseDate(req.query.endDate);
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    const prevStartDate = parseDate(req.query.prevStartDate);
    const prevEndDate = parseDate(req.query.prevEndDate);
    const todayStartMs = parseDate(req.query.todayStart)?.getTime() ?? Date.now();
    const tz = safeTz(req.query.tz);

    const [logs, prevLogs] = await Promise.all([
      readRange(uid, startDate, endDate),
      prevStartDate && prevEndDate ? readRange(uid, prevStartDate, prevEndDate) : Promise.resolve([]),
    ]);

    const dayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const byDay = {};
    const dispositions = {};
    logs.forEach((l) => {
      const at = new Date(l.createdAt || 0);
      if (!Number.isNaN(at.getTime())) {
        const key = dayFmt.format(at);
        const bucket = byDay[key] || (byDay[key] = { calls: 0, sales: 0 });
        bucket.calls += 1;
        if (l.disposition === 'sold' || (!l.disposition && l.isBillable)) bucket.sales += 1;
      }
      const label = dispositionLabel(l);
      dispositions[label] = (dispositions[label] || 0) + 1;
    });

    const recentCalls = logs.slice(0, RECENT_LIMIT).map((l) => ({
      id: l.id,
      callSid: l.callSid || null,
      from: l.isBillable ? (l.from || null) : (l.from ? 'hidden' : null),
      campaign: l.campaign || null,
      campaignLabel: l.campaignLabel || null,
      type: l.type || null,
      duration: Number(l.duration) || 0,
      createdAt: l.createdAt,
      disposition: l.disposition || null,
      isBillable: Boolean(l.isBillable),
      status: l.status || null,
    }));

    res.json({
      metrics: summarize(logs, todayStartMs),
      prevMetrics: summarize(prevLogs, todayStartMs),
      byDay,
      dispositions,
      recentCalls,
      truncated: logs.length >= MAX_LOGS_PER_RANGE,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Dashboard] getDashboardSummary:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
}

module.exports = { getDashboardSummary };
