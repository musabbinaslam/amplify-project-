const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { sendMail } = require('../config/mailer');
const { redisClient } = require('../config/redis');
const retarget = require('./medicareRetargetService');

const COLLECTION = 'medicareRetargetBroadcasts';
const LOCK_KEY = 'medicareRetarget:broadcast:lock';
const LOCK_TTL_SEC = 15 * 60;
const STALE_MS = 15 * 60 * 1000;
const PROGRESS_EVERY = 10;
const MAX_ERRORS_STORED = 25;
const EVERYONE = 'everyone';
const SELECTED_AUDIENCE = 'selected';
const MAX_SELECTED = 1000;

const LIMITS = {
  subject: 150,
  preheader: 200,
  eyebrow: 60,
  headline: 140,
  sub: 300,
  intro: 1500,
  body: 5000,
  cta: 60,
  ctaUrl: 500,
  nextTitle: 40,
  nextItem: 200,
  nextCount: 6,
};

const AUDIENCES = {
  active: {
    label: 'Active funnel (queued, pending, email 1, email 2)',
    statuses: ['pending', 'email1_sent', 'email2_sent'],
    includeQueued: true,
  },
  not_mailed: {
    label: 'Not mailed yet (queued + pending)',
    statuses: ['pending'],
    includeQueued: true,
  },
  exhausted: {
    label: 'Exhausted (got both emails, never paid)',
    statuses: ['exhausted'],
    includeQueued: false,
  },
  all: {
    label: 'All unpaid Medicare targets',
    statuses: ['pending', 'email1_sent', 'email2_sent', 'exhausted'],
    includeQueued: true,
  },
  [EVERYONE]: {
    label: 'Everyone, any status (includes converted / paid)',
    statuses: ['pending', 'email1_sent', 'email2_sent', 'exhausted', 'converted'],
    includeQueued: true,
    includePaid: true,
  },
};

/**
 * Opted-out (suppressed) agents never get a custom email. Converted agents are
 * left out too, unless the admin chose "everyone" or picked them by hand.
 */
function statusBlocked(status, includePaid = false) {
  if (status === 'suppressed') return true;
  return status === 'converted' && !includePaid;
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function sendDelayMs() {
  return Math.min(Math.max(envInt('MEDICARE_RETARGET_BROADCAST_DELAY_MS', 300), 0), 10_000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function resolveCtaUrl(raw) {
  const value = clean(raw, LIMITS.ctaUrl);
  if (!value) return { url: '' };
  if (value.startsWith('/')) return { url: `${retarget.resolveAppBase()}${value}` };
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return { url: value };
  return { error: 'Button link must start with https:// or / (an app path like /app/billing)' };
}

function normalizeCustomCopy(input = {}) {
  const errors = [];
  const nextRaw = Array.isArray(input.next)
    ? input.next
    : String(input.next || '').split('\n');
  const next = nextRaw
    .map((item) => clean(item, LIMITS.nextItem))
    .filter(Boolean)
    .slice(0, LIMITS.nextCount);
  const cta = resolveCtaUrl(input.ctaUrl);
  if (cta.error) errors.push(cta.error);

  const copy = {
    subject: clean(input.subject, LIMITS.subject),
    preheader: clean(input.preheader, LIMITS.preheader),
    eyebrow: clean(input.eyebrow, LIMITS.eyebrow),
    headline: clean(input.headline, LIMITS.headline),
    sub: clean(input.sub, LIMITS.sub),
    intro: clean(input.intro, LIMITS.intro),
    body: clean(input.body, LIMITS.body),
    cta: clean(input.cta, LIMITS.cta),
    ctaUrl: cta.url || '',
    nextTitle: clean(input.nextTitle, LIMITS.nextTitle),
    next,
  };

  if (!copy.subject) errors.push('Subject is required');
  if (!copy.headline) errors.push('Headline is required');
  if (!copy.body && !copy.intro) errors.push('Write an intro or body');
  return { copy, errors };
}

function firstName(name) {
  const n = String(name || '').trim();
  if (!n || n === 'there') return 'there';
  return n.split(/\s+/)[0];
}

function fillTokens(text, name) {
  return String(text || '')
    .replace(/\{\{?\s*first_?name\s*\}?\}/gi, firstName(name))
    .replace(/\{\{?\s*name\s*\}?\}/gi, name || 'there');
}

function personalize(copy, name) {
  const fill = (v) => fillTokens(v, name);
  return {
    ...copy,
    subject: fill(copy.subject),
    preheader: fill(copy.preheader),
    eyebrow: fill(copy.eyebrow),
    headline: fill(copy.headline),
    sub: fill(copy.sub),
    intro: fill(copy.intro),
    body: fill(copy.body),
    cta: fill(copy.cta),
    next: copy.next.map(fill),
  };
}

function renderCustomEmail(copy, name) {
  const filled = personalize(copy, name);
  return {
    subject: filled.subject,
    html: retarget.buildMedicareRetargetEmailHtml({ name, copy: filled }),
    text: retarget.buildMedicareRetargetEmailText({ name, copy: filled }),
  };
}

function previewCustomEmail(input, { name = 'Alex Morgan' } = {}) {
  const { copy, errors } = normalizeCustomCopy(input);
  return { ...renderCustomEmail(copy, name), errors };
}

async function loadAudience(key) {
  const def = AUDIENCES[key];
  if (!def) throw Object.assign(new Error(`Unknown audience: ${key}`), { status: 400 });
  const byUid = new Map();
  if (def.includeQueued) {
    const flagged = await retarget.fetchUnpaidFlaggedUsers();
    for (const row of flagged) {
      if (row.status === 'queued' || def.statuses.includes(row.status)) byUid.set(row.uid, row);
    }
  }
  const enrolled = await retarget.fetchUsersByStatuses(def.statuses);
  for (const row of enrolled) byUid.set(row.uid, row);

  const seenEmails = new Set();
  const rows = [];
  for (const row of byUid.values()) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email || seenEmails.has(email) || statusBlocked(row.status, def.includePaid)) continue;
    seenEmails.add(email);
    rows.push(row);
  }
  return rows;
}

async function countAudience(key) {
  const rows = await loadAudience(key);
  return { audience: key, count: rows.length };
}

/** Everyone a custom email may go to, for the "specific people" picker. */
async function listRecipients() {
  const rows = await loadAudience(EVERYONE);
  return rows
    .map((row) => ({
      uid: row.uid,
      name: row.name || null,
      email: row.email,
      status: row.status || 'queued',
    }))
    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), undefined, { sensitivity: 'base' }));
}

/** Keeps only the eligible rows the admin picked; unknown or ineligible ids are dropped. */
function pickRows(rows, userIds) {
  const wanted = new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, MAX_SELECTED),
  );
  return rows.filter((row) => wanted.has(row.uid));
}

function listAudiences() {
  return Object.entries(AUDIENCES).map(([key, def]) => ({
    key,
    label: def.label,
    includesPaid: def.includePaid === true,
  }));
}

function starterTemplates() {
  return [1, 2].map((step) => {
    const c = retarget.copyForStep(step);
    return {
      key: `email${step}`,
      label: step === 1 ? 'Email 1 (AEP)' : 'Email 2 (follow-up)',
      copy: {
        subject: c.subject,
        preheader: c.preheader,
        eyebrow: c.eyebrow,
        headline: c.headline('{firstName}'),
        sub: c.sub,
        intro: c.intro,
        body: c.body,
        cta: c.cta,
        ctaUrl: '/app/billing',
        nextTitle: 'Next steps',
        next: c.next,
      },
    };
  });
}

async function sendCustomTestEmail({ copy: input, to, name }) {
  const { copy, errors } = normalizeCustomCopy(input);
  if (errors.length) throw Object.assign(new Error(errors.join('. ')), { status: 400 });
  const target = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    throw Object.assign(new Error('Enter a valid test email address'), { status: 400 });
  }
  const rendered = renderCustomEmail(copy, String(name || '').trim() || 'there');
  await sendMail({
    to: target,
    subject: `[TEST] ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
    replyTo: process.env.SUPPORT_TO_EMAIL || undefined,
  });
  return { sent: true, to: target, subject: rendered.subject };
}

function serializeBroadcast(doc) {
  const d = doc.data() || {};
  const ts = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v || null);
  const updatedMs = d.updatedAt && typeof d.updatedAt.toMillis === 'function' ? d.updatedAt.toMillis() : 0;
  const stalled = d.status === 'running' && updatedMs && Date.now() - updatedMs > STALE_MS;
  return {
    id: doc.id,
    status: stalled ? 'stalled' : d.status,
    subject: d.subject || '',
    audience: d.audience || null,
    total: d.total || 0,
    sent: d.sent || 0,
    skipped: d.skipped || 0,
    failed: d.failed || 0,
    errors: Array.isArray(d.errors) ? d.errors : [],
    createdBy: d.createdBy || null,
    cancelRequested: d.cancelRequested === true,
    createdAt: ts(d.createdAt),
    finishedAt: ts(d.finishedAt),
    updatedAt: ts(d.updatedAt),
  };
}

async function getBroadcast(id) {
  const db = getDb();
  if (!db || !id) return null;
  const snap = await db.collection(COLLECTION).doc(String(id)).get();
  return snap.exists ? serializeBroadcast(snap) : null;
}

async function listBroadcasts({ limit = 10 } = {}) {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(Math.max(Number(limit) || 10, 1), 50))
    .get();
  return snap.docs.map(serializeBroadcast);
}

async function cancelBroadcast(id) {
  const db = getDb();
  if (!db || !id) return null;
  const ref = db.collection(COLLECTION).doc(String(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.set({ cancelRequested: true }, { merge: true });
  return getBroadcast(id);
}

async function runBroadcast(id, copy, rows, { includePaid = false } = {}) {
  const db = getDb();
  const { FieldValue } = admin.firestore;
  const ref = db.collection(COLLECTION).doc(id);
  const counts = { sent: 0, skipped: 0, failed: 0 };
  const errors = [];
  const delay = sendDelayMs();
  let cancelled = false;

  const flush = async (extra = {}) => {
    await ref.set({
      ...counts,
      errors: errors.slice(0, MAX_ERRORS_STORED),
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    }, { merge: true });
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const snap = await db.collection('users').doc(row.uid).get();
      const user = snap.exists ? { id: snap.id, ...snap.data() } : null;
      const to = retarget.userEmail(user);
      const status = user?.medicareRetarget?.status;
      if (!user || !to || statusBlocked(status, includePaid) || user.medicareRetarget?.lastBroadcastId === id) {
        counts.skipped += 1;
      } else if (!includePaid && await retarget.userIsPaid(row.uid, user)) {
        counts.skipped += 1;
      } else {
        const name = retarget.displayName(user);
        const rendered = renderCustomEmail(copy, name);
        await sendMail({
          to,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          replyTo: process.env.SUPPORT_TO_EMAIL || undefined,
        });
        counts.sent += 1;
        await db.collection('users').doc(row.uid).set({
          medicareRetarget: {
            lastBroadcastId: id,
            lastBroadcastAt: FieldValue.serverTimestamp(),
          },
        }, { merge: true });
        if (delay) await sleep(delay);
      }
    } catch (err) {
      counts.failed += 1;
      if (errors.length < MAX_ERRORS_STORED) errors.push({ email: row.email || row.uid, error: err.message });
      console.error('[MedicareBroadcast] send failed:', row.uid, err.message);
    }

    if ((i + 1) % PROGRESS_EVERY === 0) {
      await flush();
      await redisClient.expire(LOCK_KEY, LOCK_TTL_SEC).catch(() => {});
      const latest = await ref.get();
      if (latest.data()?.cancelRequested) {
        cancelled = true;
        break;
      }
    }
  }

  await flush({
    status: cancelled ? 'cancelled' : 'completed',
    finishedAt: FieldValue.serverTimestamp(),
  });
  console.log('[MedicareBroadcast] done', { id, ...counts, cancelled });
}

async function startCustomBroadcast({ copy: input, audience, userIds, createdBy }) {
  const db = getDb();
  if (!db) throw new Error('Firestore is not configured');
  const { copy, errors } = normalizeCustomCopy(input);
  if (errors.length) throw Object.assign(new Error(errors.join('. ')), { status: 400 });

  // A list of user ids means "only these people"; otherwise the whole audience group.
  const handPicked = Array.isArray(userIds);
  let rows;
  if (handPicked) {
    if (!userIds.length) throw Object.assign(new Error('Pick at least one person to send to'), { status: 400 });
    rows = pickRows(await loadAudience(EVERYONE), userIds);
    if (!rows.length) {
      throw Object.assign(new Error('None of the people you picked can receive this email any more'), { status: 400 });
    }
  } else {
    rows = await loadAudience(audience);
    if (!rows.length) throw Object.assign(new Error('No recipients in this audience'), { status: 400 });
  }
  // Hand-picked people and the "everyone" group are sent to even if they have already paid.
  const includePaid = handPicked || AUDIENCES[audience]?.includePaid === true;

  const ref = db.collection(COLLECTION).doc();
  const acquired = await redisClient.set(LOCK_KEY, ref.id, { NX: true, EX: LOCK_TTL_SEC });
  if (!acquired) {
    const running = await redisClient.get(LOCK_KEY).catch(() => null);
    throw Object.assign(new Error('Another Medicare broadcast is still sending. Wait for it to finish or cancel it.'), {
      status: 409,
      runningId: running || null,
    });
  }

  const { FieldValue } = admin.firestore;
  await ref.set({
    status: 'running',
    subject: copy.subject,
    copy,
    audience: handPicked ? SELECTED_AUDIENCE : audience,
    includePaid,
    total: rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    createdBy: createdBy || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  setImmediate(() => {
    runBroadcast(ref.id, copy, rows, { includePaid })
      .catch(async (err) => {
        console.error('[MedicareBroadcast] run failed:', ref.id, err.message);
        await ref.set({
          status: 'failed',
          errors: [{ email: null, error: err.message }],
          finishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
      })
      .finally(async () => {
        const holder = await redisClient.get(LOCK_KEY).catch(() => null);
        if (holder === ref.id) await redisClient.del(LOCK_KEY).catch(() => {});
      });
  });

  return getBroadcast(ref.id);
}

module.exports = {
  AUDIENCES,
  LIMITS,
  normalizeCustomCopy,
  fillTokens,
  renderCustomEmail,
  previewCustomEmail,
  listAudiences,
  listRecipients,
  pickRows,
  statusBlocked,
  starterTemplates,
  countAudience,
  sendCustomTestEmail,
  startCustomBroadcast,
  getBroadcast,
  listBroadcasts,
  cancelBroadcast,
};
