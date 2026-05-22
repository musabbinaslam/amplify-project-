const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAINTENANCE_DOC_PATH = ['system', 'maintenance'];
const ALLOWED_TYPES = new Set([
  'personal',
  'admin_broadcast',
  'maintenance',
  'admin_alert',
  'contest_credited',
  'contest_denied',
]);
const ADMIN_NOTIFICATION_TYPES = new Set(['admin_alert']);
const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high']);

function ensureFirestore() {
  if (!admin) throw new Error('Database service unavailable');
  return getDb();
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toISOString();
  return null;
}

function serialize(value) {
  if (value == null) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = serialize(v);
    });
    return out;
  }
  return value;
}

function sanitizeText(value, maxLen, fieldName) {
  const str = String(value || '').trim();
  if (!str) throw new Error(`${fieldName} is required`);
  if (str.length > maxLen) throw new Error(`${fieldName} exceeds ${maxLen} characters`);
  return str;
}

function normalizePriority(priority) {
  const normalized = String(priority || 'normal').trim().toLowerCase();
  if (!ALLOWED_PRIORITIES.has(normalized)) throw new Error('priority must be low, normal, or high');
  return normalized;
}

function normalizeType(type) {
  const normalized = String(type || 'personal').trim().toLowerCase();
  if (!ALLOWED_TYPES.has(normalized)) throw new Error('Invalid notification type');
  return normalized;
}

function parseLimit(limitRaw) {
  const n = Number(limitRaw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseDateOrNull(value, field) {
  if (value == null || value === '') return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) throw new Error(`${field} must be a valid date`);
  return dt.toISOString();
}

function buildNotificationPayload(input, source = 'system') {
  const type = normalizeType(input.type || 'personal');
  const title = sanitizeText(input.title, 140, 'title');
  const body = sanitizeText(input.body, 2000, 'body');
  const priority = normalizePriority(input.priority || 'normal');
  const expiresAt = parseDateOrNull(input.expiresAt, 'expiresAt');
  const linkPath = String(input.linkPath || '').trim().slice(0, 256) || null;
  const contestId = String(input.contestId || '').trim().slice(0, 128) || null;
  const walletBalanceCents = Number.isFinite(Number(input.walletBalanceCents))
    ? Math.round(Number(input.walletBalanceCents))
    : null;
  return {
    type,
    title,
    body,
    priority,
    read: false,
    source: String(source || 'system').trim().slice(0, 64) || 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(linkPath ? { linkPath } : {}),
    ...(contestId ? { contestId } : {}),
    ...(walletBalanceCents != null ? { walletBalanceCents } : {}),
  };
}

function filterRowsByScope(rows, scope = 'all') {
  const normalized = String(scope || 'all').toLowerCase();
  if (normalized === 'admin') {
    return rows.filter((row) => ADMIN_NOTIFICATION_TYPES.has(row.type));
  }
  if (normalized === 'general') {
    return rows.filter((row) => !ADMIN_NOTIFICATION_TYPES.has(row.type));
  }
  return rows;
}

function rowMatchesScope(data, scope = 'all') {
  const normalized = String(scope || 'all').toLowerCase();
  if (normalized === 'all') return true;
  const isAdminType = ADMIN_NOTIFICATION_TYPES.has(data?.type);
  if (normalized === 'admin') return isAdminType;
  if (normalized === 'general') return !isAdminType;
  return true;
}

function notificationsCollection(uid) {
  const db = ensureFirestore();
  return db.collection('users').doc(uid).collection('notifications');
}

async function listUserNotifications(uid, options = {}) {
  const limit = parseLimit(options.limit);
  const unreadOnly = String(options.unreadOnly || '').toLowerCase() === 'true';
  const scope = String(options.scope || 'all').toLowerCase();
  const fetchLimit = scope === 'all' ? limit : Math.min(limit * 3, MAX_LIMIT);
  let query = notificationsCollection(uid).orderBy('createdAt', 'desc').limit(fetchLimit);
  if (unreadOnly) query = query.where('read', '==', false);
  const snap = await query.get();
  let rows = snap.docs.map((doc) => ({ id: doc.id, ...serialize(doc.data() || {}) }));
  rows = filterRowsByScope(rows, scope).slice(0, limit);
  return { rows };
}

async function markNotificationRead(uid, notificationId) {
  const ref = notificationsCollection(uid).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Notification not found');
  await ref.set(
    {
      read: true,
      readAt: admin.firestore.FieldValue.serverTimestamp(),
      readAtIso: nowIso(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  const updated = await ref.get();
  return { row: { id: updated.id, ...serialize(updated.data() || {}) } };
}

async function markAllNotificationsRead(uid, options = {}) {
  const scope = String(options.scope || 'all').toLowerCase();
  const snap = await notificationsCollection(uid).where('read', '==', false).limit(500).get();
  const targets = snap.docs.filter((doc) => rowMatchesScope(doc.data() || {}, scope));
  if (!targets.length) return { updatedCount: 0 };
  const db = ensureFirestore();
  const batch = db.batch();
  const readAtIso = nowIso();
  targets.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp(),
        readAtIso,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
  return { updatedCount: targets.length };
}

async function listAdminUserIds(limit = 500) {
  const db = ensureFirestore();
  const snap = await db.collection('users').where('role', '==', 'admin').select().limit(limit).get();
  return snap.docs.map((doc) => doc.id);
}

async function notifyAdmins(payload, source = 'system') {
  const adminIds = await listAdminUserIds();
  if (!adminIds.length) return { recipientCount: 0, created: [] };

  const base = buildNotificationPayload(
    { ...payload, type: 'admin_alert' },
    source,
  );
  const created = [];
  const db = ensureFirestore();
  const chunkSize = 400;

  for (let i = 0; i < adminIds.length; i += chunkSize) {
    const chunk = adminIds.slice(i, i + chunkSize);
    const batch = db.batch();
    const chunkCreated = [];

    chunk.forEach((uid) => {
      const ref = notificationsCollection(uid).doc();
      batch.set(ref, base, { merge: false });
      chunkCreated.push({
        uid,
        notification: {
          id: ref.id,
          type: base.type,
          title: base.title,
          body: base.body,
          priority: base.priority,
          source: base.source,
          read: false,
          createdAt: base.createdAtIso,
          createdAtIso: base.createdAtIso,
          ...(base.linkPath ? { linkPath: base.linkPath } : {}),
          ...(base.contestId ? { contestId: base.contestId } : {}),
          ...(base.expiresAt ? { expiresAt: base.expiresAt } : {}),
        },
      });
    });

    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
    created.push(...chunkCreated);
  }

  return { recipientCount: adminIds.length, created };
}

/** Fire-and-forget admin notifications (socket + persist). */
function notifyAdminsInBackground(payload, source = 'system') {
  setImmediate(() => {
    notifyAdmins(payload, source)
      .then(({ created }) => {
        const socketRegistry = require('../sockets/socketRegistry');
        created.forEach(({ uid, notification }) => {
          socketRegistry.emitToAgent(uid, 'notification:new', notification);
        });
      })
      .catch((err) => {
        console.warn('[notificationService] notifyAdminsInBackground failed:', err.message);
      });
  });
}

async function createUserNotification(uid, payload, source = 'system') {
  const row = buildNotificationPayload(payload, source);
  const ref = notificationsCollection(uid).doc();
  await ref.set(row, { merge: false });
  return {
    id: ref.id,
    ...serialize({
      ...row,
      createdAt: row.createdAtIso,
    }),
  };
}

/** Persist + shape payload for real-time `notification:new` socket events. */
function toRealtimeNotification(created) {
  if (!created) return null;
  return {
    id: created.id,
    type: created.type,
    title: created.title,
    body: created.body,
    priority: created.priority,
    source: created.source,
    read: false,
    createdAt: created.createdAt || created.createdAtIso,
    createdAtIso: created.createdAtIso,
    ...(created.linkPath ? { linkPath: created.linkPath } : {}),
    ...(created.contestId ? { contestId: created.contestId } : {}),
    ...(created.expiresAt ? { expiresAt: created.expiresAt } : {}),
    ...(created.walletBalanceCents != null ? { walletBalanceCents: created.walletBalanceCents } : {}),
  };
}

async function notifyAgent(uid, payload, source = 'system') {
  const created = await createUserNotification(uid, payload, source);
  return toRealtimeNotification(created);
}

async function listAllUserIds(limit = 20000) {
  const db = ensureFirestore();
  const snap = await db.collection('users').select().limit(limit).get();
  return snap.docs.map((doc) => doc.id);
}

async function broadcastNotificationToAllUsers(payload, source = 'admin') {
  const userIds = await listAllUserIds();
  const base = buildNotificationPayload(
    { ...payload, type: payload.type || 'admin_broadcast' },
    source,
  );
  const db = ensureFirestore();
  const now = Date.now();
  const chunkSize = 350;
  const created = [];
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = userIds.slice(i, i + chunkSize);
    chunk.forEach((uid) => {
      const ref = notificationsCollection(uid).doc();
      batch.set(ref, base, { merge: false });
      created.push({ uid, id: ref.id });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return {
    recipientCount: userIds.length,
    createdCount: created.length,
    created,
    title: base.title,
    body: base.body,
    type: base.type,
    priority: base.priority,
    createdAt: new Date(now).toISOString(),
    ...(base.expiresAt ? { expiresAt: base.expiresAt } : {}),
  };
}

function maintenanceDocRef() {
  const db = ensureFirestore();
  return db.collection(MAINTENANCE_DOC_PATH[0]).doc(MAINTENANCE_DOC_PATH[1]);
}

async function getMaintenanceState() {
  const snap = await maintenanceDocRef().get();
  if (!snap.exists) {
    return {
      active: false,
      title: '',
      message: '',
      startsAt: null,
      endsAt: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return serialize(snap.data() || {});
}

async function setMaintenanceState(input, updatedBy) {
  const active = Boolean(input.active);
  const title = active ? sanitizeText(input.title, 140, 'title') : String(input.title || '').trim().slice(0, 140);
  const message = active
    ? sanitizeText(input.message, 2000, 'message')
    : String(input.message || '').trim().slice(0, 2000);
  const startsAt = parseDateOrNull(input.startsAt, 'startsAt');
  const endsAt = parseDateOrNull(input.endsAt, 'endsAt');
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    throw new Error('startsAt must be before endsAt');
  }
  const payload = {
    active,
    title,
    message,
    startsAt,
    endsAt,
    updatedBy: updatedBy || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  await maintenanceDocRef().set(payload, { merge: true });
  const latest = await maintenanceDocRef().get();
  return serialize(latest.data() || {});
}

module.exports = {
  ADMIN_NOTIFICATION_TYPES,
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createUserNotification,
  notifyAgent,
  notifyAdminsInBackground,
  toRealtimeNotification,
  broadcastNotificationToAllUsers,
  listAdminUserIds,
  notifyAdmins,
  getMaintenanceState,
  setMaintenanceState,
  toIso,
};
