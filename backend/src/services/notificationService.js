const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAINTENANCE_DOC_PATH = ['system', 'maintenance'];
const ALLOWED_TYPES = new Set(['personal', 'admin_broadcast', 'maintenance']);
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
  };
}

function notificationsCollection(uid) {
  const db = ensureFirestore();
  return db.collection('users').doc(uid).collection('notifications');
}

async function listUserNotifications(uid, options = {}) {
  const limit = parseLimit(options.limit);
  const unreadOnly = String(options.unreadOnly || '').toLowerCase() === 'true';
  let query = notificationsCollection(uid).orderBy('createdAt', 'desc').limit(limit);
  if (unreadOnly) query = query.where('read', '==', false);
  const snap = await query.get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...serialize(doc.data() || {}) }));
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

async function markAllNotificationsRead(uid) {
  const snap = await notificationsCollection(uid).where('read', '==', false).limit(500).get();
  if (!snap.size) return { updatedCount: 0 };
  const db = ensureFirestore();
  const batch = db.batch();
  const readAtIso = nowIso();
  snap.docs.forEach((doc) => {
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
  return { updatedCount: snap.size };
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
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createUserNotification,
  broadcastNotificationToAllUsers,
  getMaintenanceState,
  setMaintenanceState,
  toIso,
};
