const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { sendMail } = require('../config/mailer');
const { redisClient } = require('../config/redis');
const { cached, invalidateNamespace } = require('../utils/readCache');

const TIMEZONE = 'America/New_York';
const SEND_HOUR_ET = 13;
const EMAIL_GAP_MS = 2 * 24 * 60 * 60 * 1000;
const DEFAULT_BATCH = 40;
const PAGE_SIZE = 100;
const DAY_LOCK_PREFIX = 'medicareRetarget:ran:';
const TERMINAL = new Set(['converted', 'exhausted', 'suppressed']);
const ACTIVE = new Set(['pending', 'email1_sent', 'email2_sent']);
const ALL_STATUSES = ['pending', 'email1_sent', 'email2_sent', 'converted', 'exhausted', 'suppressed'];
const LIST_CAP = 2000;

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function isEnabled() {
  return envBool('MEDICARE_RETARGET_ENABLED', true);
}

function isDryRun(override) {
  if (override != null) return Boolean(override);
  return envBool('MEDICARE_RETARGET_DRY_RUN', false);
}

function batchLimit() {
  return Math.min(Math.max(envInt('MEDICARE_RETARGET_BATCH_LIMIT', DEFAULT_BATCH), 1), 200);
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayName(user) {
  return String(user?.fullName || user?.displayName || user?.name || '').trim() || 'there';
}

function userEmail(user) {
  return String(user?.email || '').trim();
}

function userHasMedicareVertical(user) {
  const raw = user?.onboarding?.verticals;
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || '').split(',');
  return parts.some((v) => String(v || '').trim().toLowerCase() === 'medicare');
}

function walletBalanceCents(user) {
  const n = Number(user?.wallet?.balance);
  return Number.isFinite(n) ? n : 0;
}

async function userHasStripeCheckout(uid) {
  const db = getDb();
  if (!db || !uid) return false;
  try {
    const snap = await db
      .collection('users').doc(uid).collection('transactions')
      .where('source', '==', 'stripe_checkout')
      .limit(1)
      .get();
    return !snap.empty;
  } catch (err) {
    console.warn('[MedicareRetarget] stripe_checkout lookup failed:', uid, err.message);
    return false;
  }
}

async function userIsPaid(uid, user) {
  if (walletBalanceCents(user) > 0) return true;
  return userHasStripeCheckout(uid);
}

function resolveAppBase() {
  const explicit = String(process.env.APP_DASHBOARD_URL || process.env.FRONTEND_URL || process.env.APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '').replace(/\/app$/i, '');
  const fromList = String(process.env.CLIENT_URLS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)[0];
  const fallback = process.env.CLIENT_URL || 'https://www.callsflow.io';
  return String(fromList || fallback).replace(/\/+$/, '').replace(/\/app$/i, '');
}

function billingUrl() {
  return `${resolveAppBase()}/app/billing`;
}

function dashboardUrl() {
  return `${resolveAppBase()}/app`;
}

function etDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function etHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour')?.value);
}

function dayLockKey(date = new Date()) {
  return `${DAY_LOCK_PREFIX}${etDateKey(date)}-ET`;
}

function toMs(value) {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isDueForEmail2(state, now = Date.now(), ignoreGap = false) {
  if (state?.status !== 'email1_sent') return false;
  if (ignoreGap) return true;
  const sent = toMs(state.email1SentAt);
  if (!sent) return true;
  return now - sent >= EMAIL_GAP_MS;
}

function copyForStep(step) {
  if (step === 2) {
    return {
      preheader: 'Medicare inbound is moving — top up today and start taking high-intent calls.',
      eyebrow: 'Medicare inbound',
      headline: (name) => `${name}, seats are filling.`,
      sub: 'Agents who already funded their wallet are live on Medicare transfers. Top up now so you do not miss this inventory.',
      intro: 'This is a quick follow-up. You signed up for Medicare on CallsFlow, and high-intent inbound is already routing.',
      body: 'A credit top-up is all that stands between you and live Medicare calls. Paid agents are taking them today.',
      cta: 'Pay now & go live',
      next: [
        'Open billing and add credits (any amount above $0 unlocks the pool)',
        'Choose a Medicare campaign and go online',
        'Start taking high-intent inbound transfers',
      ],
      subject: 'Medicare calls are live on CallsFlow — top up to join',
    };
  }
  return {
    preheader: 'AEP is here. High-intent Medicare inbounds and live transfers are flowing — add credits and start closing.',
    eyebrow: 'AEP is live',
    headline: (name) => `${name}, AEP is here.`,
    sub: 'CallsFlow has high-intent Medicare inbounds and live transfers flowing.',
    intro: 'AEP is here, and the Medicare inventory is moving.',
    body: 'Add credits and start closing deals. High-intent inbounds and live transfers are already routing to funded agents.',
    cta: 'Add credits & start closing',
    next: [
      'Add credits on the billing page',
      'Go live on a Medicare campaign',
      'Take high-intent inbounds and live transfers',
    ],
    subject: 'AEP is here — add credits and start closing Medicare deals',
  };
}

function buildMedicareRetargetEmailHtml({ name, step, billingUrl: payUrl }) {
  const copy = copyForStep(step);
  const safePay = escapeHtml(payUrl || billingUrl());
  const BRAND = '#25f425';
  const BRAND_DARK = '#18a818';
  const BG = '#f4f6f5';
  const CARD = '#ffffff';
  const INK = '#0e0e0e';
  const INK_SOFT = '#4b5563';
  const MUTED = '#6b7280';
  const BORDER = '#e5e7eb';
  const HEADER_BG = '#0e0e0e';
  const nextItems = copy.next.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0; padding:0; background:${BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${INK}; -webkit-font-smoothing:antialiased;">
  <div style="display:none; font-size:0; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    ${escapeHtml(copy.preheader)}
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; width:100%;">
          <tr>
            <td style="padding:0 4px 18px 4px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="left" style="font-size:0; line-height:0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-block; vertical-align:middle;">
                      <tr>
                        <td style="width:34px; height:34px; background:${BRAND}; border-radius:9px; vertical-align:middle; text-align:center; line-height:34px;">
                          <span style="display:inline-block; width:0; height:0; border-top:7px solid transparent; border-bottom:7px solid transparent; border-left:11px solid ${INK}; vertical-align:middle; margin-left:2px;"></span>
                        </td>
                        <td style="padding-left:10px; vertical-align:middle; font-size:17px; font-weight:800; letter-spacing:1.5px; color:${INK};">
                          CALLSFLOW
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${CARD}; border-radius:18px; overflow:hidden; box-shadow:0 4px 24px rgba(14,14,14,0.06); border:1px solid ${BORDER};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${HEADER_BG};">
                <tr>
                  <td style="padding:36px 40px 28px 40px; color:#ffffff;">
                    <div style="font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${BRAND}; margin-bottom:12px;">
                      ${escapeHtml(copy.eyebrow)}
                    </div>
                    <div style="font-size:26px; line-height:1.25; font-weight:700; color:#ffffff; margin-bottom:6px;">
                      ${escapeHtml(copy.headline(name || 'there'))}
                    </div>
                    <div style="font-size:14px; line-height:1.55; color:#adaaaa;">
                      ${escapeHtml(copy.sub)}
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding:30px 40px 8px 40px; font-size:15px; line-height:1.6; color:${INK};">
                    <p style="margin:0 0 14px 0;">${escapeHtml(copy.intro)}</p>
                    <p style="margin:0 0 18px 0; color:${INK_SOFT};">
                      ${escapeHtml(copy.body)}
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius:10px; background:${BRAND};">
                          <a href="${safePay}" style="display:inline-block; padding:12px 18px; color:${INK}; text-decoration:none; font-size:14px; font-weight:800;">
                            ${escapeHtml(copy.cta)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; border:1px solid ${BORDER}; border-left:3px solid ${BRAND_DARK}; border-radius:10px;">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED};">Next steps</p>
                          <ul style="margin:0; padding-left:16px; color:${INK_SOFT}; font-size:14px; line-height:1.65;">
                            ${nextItems}
                          </ul>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 40px 36px 40px; font-size:14px; line-height:1.6; color:${INK_SOFT};">
                    Need help? Reply to this email and our team will assist you. To stop these Medicare updates, reply with STOP.<br/>
                    <strong style="color:${INK};">— The CallsFlow Team</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildMedicareRetargetEmailText({ name, step, billingUrl: payUrl }) {
  const copy = copyForStep(step);
  const who = name || 'there';
  return [
    copy.headline(who).replace(/,$/, '.'),
    '',
    copy.intro,
    copy.body,
    '',
    `${copy.cta}: ${payUrl || billingUrl()}`,
    '',
    'Next steps:',
    ...copy.next.map((item) => `- ${item}`),
    '',
    'Need help? Reply to this email. To opt out, reply STOP.',
    '— The CallsFlow Team',
  ].join('\n');
}

async function writeUserPatch(uid, patch) {
  const db = getDb();
  if (!db || !uid) return;
  const { FieldValue } = admin.firestore;
  await db.collection('users').doc(uid).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function syncMedicareUnpaidFlag(uid, user, paidHint) {
  if (!uid) return { medicareUnpaid: false };
  const paid = paidHint != null ? Boolean(paidHint) : await userIsPaid(uid, user);
  const status = user?.medicareRetarget?.status;
  const unpaid = userHasMedicareVertical(user)
    && !paid
    && !TERMINAL.has(status)
    && Boolean(userEmail(user));
  await writeUserPatch(uid, { retargetFlags: { medicareUnpaid: unpaid } });
  return { medicareUnpaid: unpaid, paid };
}

async function markStatus(uid, user, status, extra = {}, { dryRun = false } = {}) {
  const { FieldValue } = admin.firestore;
  const prev = user?.medicareRetarget && typeof user.medicareRetarget === 'object'
    ? { ...user.medicareRetarget }
    : {};
  const next = {
    ...prev,
    status,
    lastCheckedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
  if (!prev.enrolledAt) next.enrolledAt = FieldValue.serverTimestamp();
  const unpaid = status === 'pending' || status === 'email1_sent' || status === 'email2_sent';
  if (!dryRun) {
    await writeUserPatch(uid, {
      medicareRetarget: next,
      retargetFlags: { medicareUnpaid: unpaid },
    });
  }
  return { status, unpaid };
}

async function sendStep(user, step, { dryRun = false } = {}) {
  const to = userEmail(user);
  if (!to) throw new Error('Missing email');
  const payUrl = billingUrl();
  const name = displayName(user);
  const copy = copyForStep(step);
  const html = buildMedicareRetargetEmailHtml({ name, step, billingUrl: payUrl });
  const text = buildMedicareRetargetEmailText({ name, step, billingUrl: payUrl });
  if (dryRun) {
    console.log(`[MedicareRetarget] dry-run would send step ${step} to ${to}`);
    return { sent: false, dryRun: true, to, subject: copy.subject };
  }
  await sendMail({
    to,
    subject: copy.subject,
    text,
    html,
    replyTo: process.env.SUPPORT_TO_EMAIL || undefined,
  });
  return { sent: true, to, subject: copy.subject };
}

async function loadUnpaidFlaggedUsers(limitUid = null) {
  const db = getDb();
  if (!db) return [];
  if (limitUid) {
    const snap = await db.collection('users').doc(limitUid).get();
    if (!snap.exists) return [];
    return [{ id: snap.id, ...snap.data() }];
  }
  const rows = [];
  let cursor = null;
  // Paginate so a large unpaid cohort does not blow memory.
  while (rows.length < 2000) {
    let q = db.collection('users')
      .where('retargetFlags.medicareUnpaid', '==', true)
      .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return rows;
}

async function processUser(user, opts = {}) {
  const uid = user.id;
  const dryRun = isDryRun(opts.dryRun);
  const ignoreGap = Boolean(opts.ignoreGap);
  const now = Date.now();
  const email = userEmail(user);
  const medicare = userHasMedicareVertical(user);
  const paid = await userIsPaid(uid, user);
  let state = user.medicareRetarget && typeof user.medicareRetarget === 'object'
    ? user.medicareRetarget
    : null;

  if (paid) {
    if (state?.status !== 'converted') {
      await markStatus(uid, user, 'converted', { convertedAt: admin.firestore.FieldValue.serverTimestamp() }, { dryRun });
      return { action: 'converted', uid, email };
    }
    await syncMedicareUnpaidFlag(uid, { ...user, medicareRetarget: { ...state, status: 'converted' } }, true);
    return { action: 'already_converted', uid, email };
  }

  if (!medicare || !email || TERMINAL.has(state?.status)) {
    await syncMedicareUnpaidFlag(uid, user, paid);
    return { action: 'skipped', uid, email, reason: !email ? 'no_email' : !medicare ? 'not_medicare' : state?.status };
  }

  if (!state || !ACTIVE.has(state.status)) {
    await markStatus(uid, user, 'pending', { enrolledAt: admin.firestore.FieldValue.serverTimestamp() }, { dryRun });
    state = { ...(state || {}), status: 'pending' };
  }

  if (state.status === 'pending') {
    if (opts.sendCapLeft <= 0) return { action: 'deferred', uid, email, step: 1 };
    await sendStep(user, 1, { dryRun });
    await markStatus(uid, user, 'email1_sent', { email1SentAt: admin.firestore.FieldValue.serverTimestamp() }, { dryRun });
    return { action: 'email1', uid, email };
  }

  if (state.status === 'email1_sent') {
    if (!isDueForEmail2(state, now, ignoreGap)) {
      return { action: 'waiting_gap', uid, email };
    }
    if (opts.sendCapLeft <= 0) return { action: 'deferred', uid, email, step: 2 };
    await sendStep(user, 2, { dryRun });
    await markStatus(uid, user, 'email2_sent', { email2SentAt: admin.firestore.FieldValue.serverTimestamp() }, { dryRun });
    return { action: 'email2', uid, email };
  }

  if (state.status === 'email2_sent') {
    await markStatus(uid, user, 'exhausted', { exhaustedAt: admin.firestore.FieldValue.serverTimestamp() }, { dryRun });
    return { action: 'exhausted', uid, email };
  }

  return { action: 'skipped', uid, email, reason: state.status };
}

async function runMedicareRetargetTick(opts = {}) {
  const dryRun = isDryRun(opts.dryRun);
  const force = Boolean(opts.force);
  const summary = {
    dryRun,
    enrolled: 0,
    sent1: 0,
    sent2: 0,
    converted: 0,
    exhausted: 0,
    skipped: 0,
    deferred: 0,
    waiting: 0,
    errors: 0,
  };

  if (!force && !opts.skipDayLock) {
    const hour = etHour();
    if (hour !== SEND_HOUR_ET) {
      return { ...summary, skipped: 1, reason: `not_send_hour_${hour}` };
    }
    const lockKey = dayLockKey();
    const already = await redisClient.get(lockKey).catch(() => null);
    if (already) return { ...summary, reason: 'already_ran_today' };
  }

  const users = await loadUnpaidFlaggedUsers(opts.uid || null);
  let sendCapLeft = opts.uid ? 1 : batchLimit();

  for (const user of users) {
    try {
      const result = await processUser(user, { ...opts, dryRun, sendCapLeft });
      if (result.action === 'email1') {
        summary.sent1 += 1;
        sendCapLeft -= 1;
        if (!user.medicareRetarget?.status) summary.enrolled += 1;
      } else if (result.action === 'email2') {
        summary.sent2 += 1;
        sendCapLeft -= 1;
      } else if (result.action === 'converted') {
        summary.converted += 1;
      } else if (result.action === 'exhausted') {
        summary.exhausted += 1;
      } else if (result.action === 'deferred') {
        summary.deferred += 1;
      } else if (result.action === 'waiting_gap') {
        summary.waiting += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (err) {
      summary.errors += 1;
      console.error('[MedicareRetarget] user failed:', user.id, err.message);
    }
  }

  if (!force && !opts.skipDayLock && !opts.uid && etHour() === SEND_HOUR_ET) {
    await redisClient.set(dayLockKey(), '1', { EX: 40 * 60 * 60 }).catch((err) => {
      console.warn('[MedicareRetarget] day-lock failed:', err.message);
    });
  }

  console.log('[MedicareRetarget] tick', summary);
  invalidateNamespace('medicareRetarget').catch(() => {});
  return summary;
}

async function countWhere(field, value) {
  const db = getDb();
  if (!db) return 0;
  try {
    const snap = await db.collection('users').where(field, '==', value).count().get();
    return snap.data().count || 0;
  } catch (err) {
    console.warn('[MedicareRetarget] count failed:', field, value, err.message);
    return 0;
  }
}

async function getMedicareRetargetStats() {
  const { value } = await cached('medicareRetarget', 'stats', 60, async () => {
    const [pending, email1_sent, email2_sent, converted, exhausted, suppressed, medicareUnpaidFlag] = await Promise.all([
      countWhere('medicareRetarget.status', 'pending'),
      countWhere('medicareRetarget.status', 'email1_sent'),
      countWhere('medicareRetarget.status', 'email2_sent'),
      countWhere('medicareRetarget.status', 'converted'),
      countWhere('medicareRetarget.status', 'exhausted'),
      countWhere('medicareRetarget.status', 'suppressed'),
      countWhere('retargetFlags.medicareUnpaid', true),
    ]);
    return {
      pending,
      email1_sent,
      email2_sent,
      converted,
      exhausted,
      suppressed,
      medicareUnpaidFlag,
      generatedAt: new Date().toISOString(),
    };
  });
  return value;
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function serializeTimestamp(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : null;
}

function serializeRetargetRow(doc) {
  const data = doc.data() || {};
  const mr = data.medicareRetarget && typeof data.medicareRetarget === 'object'
    ? data.medicareRetarget
    : {};
  const activityMs = Math.max(
    toMillis(mr.lastCheckedAt),
    toMillis(mr.email2SentAt),
    toMillis(mr.email1SentAt),
    toMillis(mr.convertedAt),
    toMillis(mr.exhaustedAt),
    toMillis(mr.enrolledAt),
  );
  const name = displayName(data);
  return {
    uid: doc.id,
    email: userEmail(data) || null,
    name: name === 'there' ? null : name,
    status: mr.status || null,
    unpaidFlag: data.retargetFlags?.medicareUnpaid === true,
    enrolledAt: serializeTimestamp(mr.enrolledAt),
    email1SentAt: serializeTimestamp(mr.email1SentAt),
    email2SentAt: serializeTimestamp(mr.email2SentAt),
    convertedAt: serializeTimestamp(mr.convertedAt),
    exhaustedAt: serializeTimestamp(mr.exhaustedAt),
    lastCheckedAt: serializeTimestamp(mr.lastCheckedAt),
    _sort: activityMs,
  };
}

async function fetchUsersByStatuses(statuses, cap = LIST_CAP) {
  const db = getDb();
  if (!db || !statuses.length) return [];
  const seen = new Set();
  const buckets = await Promise.all(statuses.map(async (status) => {
    const out = [];
    let cursor = null;
    while (out.length < cap) {
      let q = db.collection('users')
        .where('medicareRetarget.status', '==', status)
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      // eslint-disable-next-line no-await-in-loop
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        out.push(doc);
        if (out.length >= cap) break;
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }
    return out;
  }));

  const rows = [];
  for (const docs of buckets) {
    for (const doc of docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      rows.push(serializeRetargetRow(doc));
      if (rows.length >= cap) return rows;
    }
  }
  return rows;
}

async function listMedicareRetargetUsers({ status = null, page = 1, pageSize = 25 } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const statuses = status && ALL_STATUSES.includes(status) ? [status] : ALL_STATUSES;
  const rows = await fetchUsersByStatuses(statuses);
  rows.sort((a, b) => (b._sort || 0) - (a._sort || 0) || String(a.email || '').localeCompare(String(b.email || '')));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(pageNum, totalPages);
  const start = (safePage - 1) * size;
  const items = rows.slice(start, start + size).map(({ _sort, ...rest }) => rest);
  return {
    items,
    total,
    page: safePage,
    pageSize: size,
    totalPages,
    status: status && ALL_STATUSES.includes(status) ? status : 'all',
    capped: total >= LIST_CAP,
  };
}

async function backfillMedicareUnpaidFlags({ dryRun = false, uid = null } = {}) {
  const db = getDb();
  if (!db) return { scanned: 0, flagged: 0 };
  let scanned = 0;
  let flagged = 0;
  if (uid) {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return { scanned: 0, flagged: 0 };
    const user = { id: snap.id, ...snap.data() };
    scanned = 1;
    const paid = await userIsPaid(uid, user);
    if (userHasMedicareVertical(user) && !paid && userEmail(user) && !TERMINAL.has(user.medicareRetarget?.status)) {
      flagged = 1;
      if (!dryRun) await syncMedicareUnpaidFlag(uid, user, paid);
    }
    return { scanned, flagged, dryRun };
  }

  let cursor = null;
  while (scanned < 8000) {
    let q = db.collection('users').limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      scanned += 1;
      const user = { id: doc.id, ...doc.data() };
      if (!userHasMedicareVertical(user) || !userEmail(user) || TERMINAL.has(user.medicareRetarget?.status)) continue;
      const paid = await userIsPaid(doc.id, user);
      if (paid) continue;
      if (user.retargetFlags?.medicareUnpaid === true) continue;
      flagged += 1;
      if (!dryRun) await syncMedicareUnpaidFlag(doc.id, user, false);
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  console.log('[MedicareRetarget] backfill flags', { scanned, flagged, dryRun });
  return { scanned, flagged, dryRun };
}

async function tickMedicareRetargetScheduler() {
  if (!isEnabled()) return;
  if (etHour() !== SEND_HOUR_ET) return;
  const lock = await redisClient.get(dayLockKey()).catch(() => null);
  if (lock) return;
  setImmediate(() => {
    runMedicareRetargetTick()
      .catch((err) => console.error('[MedicareRetarget] scheduled tick failed:', err.message));
  });
}

function startMedicareRetargetScheduler() {
  if (!isEnabled()) {
    console.log('[MedicareRetarget] Disabled (MEDICARE_RETARGET_ENABLED=false)');
    return null;
  }
  const pollMs = Math.max(envInt('MEDICARE_RETARGET_POLL_MS', 60_000), 15_000);
  console.log(`[MedicareRetarget] Scheduler on — ${SEND_HOUR_ET}:00 ${TIMEZONE} (poll ${pollMs / 1000}s, dryRun=${isDryRun()})`);
  const id = setInterval(() => {
    tickMedicareRetargetScheduler().catch((err) => {
      console.warn('[MedicareRetarget] poll failed:', err.message);
    });
  }, pollMs);
  setTimeout(() => {
    tickMedicareRetargetScheduler().catch(() => {});
  }, 12_000);
  return id;
}

module.exports = {
  EMAIL_GAP_MS,
  userHasMedicareVertical,
  userIsPaid,
  isDueForEmail2,
  syncMedicareUnpaidFlag,
  buildMedicareRetargetEmailHtml,
  buildMedicareRetargetEmailText,
  billingUrl,
  dashboardUrl,
  getMedicareRetargetStats,
  listMedicareRetargetUsers,
  runMedicareRetargetTick,
  backfillMedicareUnpaidFlags,
  startMedicareRetargetScheduler,
  tickMedicareRetargetScheduler,
  copyForStep,
};
