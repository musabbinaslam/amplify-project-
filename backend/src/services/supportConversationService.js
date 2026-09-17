const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { mergeUserDoc, getUserDoc } = require('./userDataService');
const { buildUserMetaMap, displayNameFromUserData } = require('../utils/managerAnalytics');
const {
  resolveAttachments,
  inferMessageType,
  previewForMessage,
} = require('./supportChatMedia');

const COLLECTION = 'supportConversations';
const MAX_TEXT = 4000;
const MESSAGE_PAGE = 40;

function ensureDb() {
  if (!admin) throw Object.assign(new Error('Database service unavailable'), { status: 503 });
  const db = getDb();
  if (!db) throw Object.assign(new Error('Database unavailable'), { status: 503 });
  return db;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function previewOf(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function serializeConversation(id, data = {}) {
  return {
    id,
    userId: data.userId || id,
    userName: data.userName || '',
    userEmail: data.userEmail || '',
    assignedTo: data.assignedTo || null,
    assignedName: data.assignedName || null,
    status: data.status || 'waiting',
    lastMessageAt: toIso(data.lastMessageAt),
    lastMessagePreview: data.lastMessagePreview || '',
    lastSenderRole: data.lastSenderRole || null,
    unreadForUser: Number(data.unreadForUser || 0),
    unreadForSupport: Number(data.unreadForSupport || 0),
    userLastReadAt: toIso(data.userLastReadAt),
    supportLastReadAt: toIso(data.supportLastReadAt),
    firstResponseAt: toIso(data.firstResponseAt),
    firstResponderId: data.firstResponderId || null,
    firstResponderRole: data.firstResponderRole || null,
    lastStaffId: data.lastStaffId || null,
    replierIds: Array.isArray(data.replierIds) ? data.replierIds : [],
    messageCount: Number(data.messageCount || 0),
    closedBy: data.closedBy || null,
    closedAt: toIso(data.closedAt),
    createdAt: toIso(data.createdAt),
    userTimeZone: data.userTimeZone || null,
  };
}

function validateIanaTz(tz) {
  if (!tz || typeof tz !== 'string') return null;
  const trimmed = tz.trim();
  if (trimmed.length < 3 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(trimmed)) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

function serializeMessage(id, data = {}, conversationId = '') {
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  return {
    id,
    senderId: data.senderId || '',
    senderRole: data.senderRole || 'user',
    senderName: data.senderName || '',
    text: data.text || '',
    createdAt: toIso(data.createdAt) || new Date().toISOString(),
    replyTo: normalizeReplyTo(data.replyTo),
    type: data.type || (attachments.length ? inferMessageType(attachments, data.text) : 'text'),
    attachments,
    conversationId: conversationId || data.conversationId || '',
  };
}

function normalizeReplyTo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id || id.length > 128) return null;
  const senderRole = raw.senderRole === 'admin' || raw.senderRole === 'support' || raw.senderRole === 'user'
    ? raw.senderRole
    : '';
  return {
    id,
    text: previewOf(raw.text).slice(0, 140),
    senderName: String(raw.senderName || '').slice(0, 80),
    senderRole,
    senderId: String(raw.senderId || '').slice(0, 128),
  };
}

function isStaffRole(role) {
  return role === 'admin' || role === 'support';
}

function convRef(db, conversationId) {
  return db.collection(COLLECTION).doc(String(conversationId));
}

async function listRecentMessages(db, conversationId, { cursor, limit = MESSAGE_PAGE } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || MESSAGE_PAGE, 1), 100);
  let query = convRef(db, conversationId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(pageSize + 1);

  if (cursor) {
    const cursorSnap = await convRef(db, conversationId).collection('messages').doc(String(cursor)).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const snap = await query.get();
  const docs = snap.docs.slice(0, pageSize);
  const messages = docs
    .map((d) => serializeMessage(d.id, d.data(), conversationId))
    .reverse();
  const nextCursor = snap.docs.length > pageSize ? docs[docs.length - 1].id : null;
  return { messages, nextCursor };
}

async function createConversation(db, user, { timeZone } = {}) {
  const { FieldValue } = admin.firestore;
  const id = String(user.uid);
  const ref = convRef(db, id);
  const userTimeZone = validateIanaTz(timeZone);
  const payload = {
    userId: id,
    userName: user.name || user.displayName || user.email || 'User',
    userEmail: user.email || '',
    assignedTo: null,
    assignedName: null,
    status: 'waiting',
    lastMessageAt: FieldValue.serverTimestamp(),
    lastMessagePreview: '',
    lastSenderRole: null,
    unreadForUser: 0,
    unreadForSupport: 0,
    firstResponseAt: null,
    closedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    messageCount: 0,
    replierIds: [],
    ...(userTimeZone ? { userTimeZone } : {}),
  };
  await ref.set(payload, { merge: true });
  mergeUserDoc(id, { supportConversationId: id }).catch(() => {});
  return serializeConversation(id, {
    ...payload,
    lastMessageAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

async function stampUserTimeZone(conversationId, timeZone) {
  const tz = validateIanaTz(timeZone);
  if (!tz || !conversationId) return null;
  const db = ensureDb();
  const ref = convRef(db, conversationId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.userTimeZone === tz) return null;
  await ref.set({ userTimeZone: tz }, { merge: true });
  // Re-read so we never broadcast a stale unread snapshot over a newer message.
  const fresh = await ref.get();
  return serializeConversation(fresh.id, fresh.data() || { ...data, userTimeZone: tz });
}

async function getOrCreateMine(user, { timeZone } = {}) {
  const db = ensureDb();
  const uid = String(user.uid);
  const snap = await convRef(db, uid).get();
  const tz = validateIanaTz(timeZone);
  if (snap.exists) {
    let data = snap.data() || {};
    if (tz && data.userTimeZone !== tz) {
      await snap.ref.set({ userTimeZone: tz }, { merge: true });
      data = { ...data, userTimeZone: tz };
    }
    const page = await listRecentMessages(db, snap.id);
    return { conversation: serializeConversation(snap.id, data), ...page };
  }
  const conversation = await createConversation(db, {
    uid,
    name: user.name || user.displayName,
    email: user.email,
  }, { timeZone: tz });
  return { conversation, messages: [], nextCursor: null };
}

async function getConversation(conversationId) {
  const db = ensureDb();
  const snap = await convRef(db, conversationId).get();
  if (!snap.exists) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  return { id: snap.id, ...snap.data(), _ref: snap.ref };
}

async function assertUserCanAccess(conversation, uid, role) {
  if (role === 'admin' || role === 'support') return;
  if (String(conversation.userId) !== String(uid)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

async function getMessages(conversationId, actor, { cursor, limit, markRead: shouldMarkRead = false } = {}) {
  const db = ensureDb();
  const [convo, page] = await Promise.all([
    getConversation(conversationId),
    listRecentMessages(db, conversationId, { cursor, limit }),
  ]);
  await assertUserCanAccess(convo, actor.uid, actor.role);
  let conversation = serializeConversation(convo.id, convo);
  if (shouldMarkRead) {
    const marked = await markRead(conversationId, actor, { conversation: convo });
    conversation = marked.conversation;
    return {
      conversation,
      ...page,
      readChanged: marked.changed,
    };
  }
  return {
    conversation,
    ...page,
    readChanged: false,
  };
}

async function postMessage(conversationId, actor, text, extra = {}) {
  const db = ensureDb();
  const body = String(text || '').trim();
  if (body.length > MAX_TEXT) {
    throw Object.assign(new Error(`Message exceeds ${MAX_TEXT} characters`), { status: 400 });
  }

  const isStaff = isStaffRole(actor.role);
  // Preserve admin vs support so the user chat can label who replied.
  const senderRole = isStaff ? (actor.role === 'admin' ? 'admin' : 'support') : 'user';
  const ref = convRef(db, conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    if (!isStaff && String(conversationId) === String(actor.uid)) {
      await createConversation(db, actor);
    } else {
      throw Object.assign(new Error('Conversation not found'), { status: 404 });
    }
  }
  const convoSnap = snap.exists ? snap : await ref.get();
  const convo = { id: convoSnap.id, ...convoSnap.data() };
  await assertUserCanAccess(convo, actor.uid, actor.role);

  const attachments = await resolveAttachments(conversationId, extra.attachments);
  if (!body && !attachments.length) {
    throw Object.assign(new Error('Message text is required'), { status: 400 });
  }
  const msgType = inferMessageType(attachments, body);
  const preview = previewForMessage(body, attachments, msgType);

  const now = admin.firestore.Timestamp.now();
  const nowIso = now.toDate().toISOString();
  const msgRef = ref.collection('messages').doc();
  const senderName = actor.name || actor.displayName || actor.email
    || (senderRole === 'admin' ? 'Admin' : isStaff ? 'Support' : 'User');
  const message = {
    senderId: actor.uid,
    senderRole,
    senderName,
    text: body,
    type: msgType,
    createdAt: now,
    ...(attachments.length ? { attachments } : {}),
  };
  const replyTo = normalizeReplyTo(extra.replyTo);
  if (replyTo) message.replyTo = replyTo;

  const unreadForUser = isStaff ? Number(convo.unreadForUser || 0) + 1 : 0;
  const unreadForSupport = senderRole === 'user' ? Number(convo.unreadForSupport || 0) + 1 : 0;

  let status = convo.status || 'waiting';
  let firstResponseAt = convo.firstResponseAt || null;
  let firstResponderId = convo.firstResponderId || null;
  let firstResponderRole = convo.firstResponderRole || null;
  const { FieldValue } = admin.firestore;

  if (status === 'closed') {
    status = 'waiting';
  }
  if (senderRole === 'user' && status !== 'open') {
    status = 'waiting';
  }

  const convoPatch = {
    status,
    firstResponseAt,
    closedAt: null,
    lastMessageAt: now,
    lastMessagePreview: preview,
    lastSenderRole: senderRole,
    unreadForUser,
    unreadForSupport,
    userId: convo.userId || conversationId,
    userName: convo.userName || actor.name || '',
    userEmail: convo.userEmail || actor.email || '',
    messageCount: FieldValue.increment(1),
  };

  if (isStaff) {
    status = 'open';
    convoPatch.status = 'open';
    if (!firstResponseAt) {
      firstResponseAt = now;
      firstResponderId = actor.uid;
      firstResponderRole = senderRole;
      convoPatch.firstResponseAt = now;
      convoPatch.firstResponderId = actor.uid;
      convoPatch.firstResponderRole = senderRole;
    }
    convoPatch.lastStaffId = actor.uid;
    convoPatch.replierIds = FieldValue.arrayUnion(actor.uid);
  }

  const batch = db.batch();
  batch.set(msgRef, message);
  batch.set(ref, convoPatch, { merge: true });
  await batch.commit();

  const nextConvo = {
    ...convo,
    status,
    firstResponseAt: firstResponseAt || convo.firstResponseAt,
    firstResponderId,
    firstResponderRole,
    lastStaffId: isStaff ? actor.uid : convo.lastStaffId || null,
    closedAt: null,
    lastMessageAt: nowIso,
    lastMessagePreview: preview,
    lastSenderRole: senderRole,
    unreadForUser,
    unreadForSupport,
    userId: convo.userId || conversationId,
    userName: convo.userName || actor.name || '',
    userEmail: convo.userEmail || actor.email || '',
  };
  return {
    conversation: serializeConversation(ref.id, nextConvo),
    message: serializeMessage(msgRef.id, { ...message, createdAt: nowIso }, conversationId),
  };
}

async function markRead(conversationId, actor, { force = false, conversation: preloaded = null } = {}) {
  const db = ensureDb();
  const convo = preloaded || await getConversation(conversationId);
  await assertUserCanAccess(convo, actor.uid, actor.role);
  const now = admin.firestore.Timestamp.now();
  const nowIso = now.toDate().toISOString();
  // If the actor owns the conversation, they are reading as the customer —
  // even when their platform role is admin/support (common in local testing).
  const isOwner = String(convo.userId || conversationId) === String(actor.uid);
  const asStaff = isStaffRole(actor.role) && !isOwner;
  const unreadKey = asStaff ? 'unreadForSupport' : 'unreadForUser';
  const readKey = asStaff ? 'supportLastReadAt' : 'userLastReadAt';
  const unread = Number(convo[unreadKey] || 0);
  const prevReadIso = toIso(convo[readKey]);
  const lastMessageIso = toIso(convo.lastMessageAt);
  const alreadyCaughtUp = Boolean(
    unread === 0
    && prevReadIso
    && lastMessageIso
    && new Date(prevReadIso).getTime() >= new Date(lastMessageIso).getTime()
  );
  if (!force && alreadyCaughtUp) {
    return {
      conversation: serializeConversation(convo.id, {
        ...convo,
        [unreadKey]: 0,
        [readKey]: prevReadIso,
      }),
      changed: false,
    };
  }

  const patch = asStaff
    ? { unreadForSupport: 0, supportLastReadAt: now }
    : { unreadForUser: 0, userLastReadAt: now };
  await convRef(db, conversationId).set(patch, { merge: true });
  return {
    conversation: serializeConversation(convo.id, {
      ...convo,
      unreadForUser: asStaff ? Number(convo.unreadForUser || 0) : 0,
      unreadForSupport: asStaff ? 0 : Number(convo.unreadForSupport || 0),
      userLastReadAt: asStaff ? convo.userLastReadAt : nowIso,
      supportLastReadAt: asStaff ? nowIso : convo.supportLastReadAt,
    }),
    changed: true,
  };
}

async function claimConversation(conversationId, actor) {
  const db = ensureDb();
  const convo = await getConversation(conversationId);
  if (convo.status === 'closed') {
    throw Object.assign(new Error('Conversation is closed'), { status: 409 });
  }
  const name = actor.name || actor.email || 'Support';
  await convRef(db, conversationId).set({
    assignedTo: actor.uid,
    assignedName: name,
    status: 'open',
  }, { merge: true });
  return serializeConversation(convo.id, {
    ...convo,
    assignedTo: actor.uid,
    assignedName: name,
    status: 'open',
  });
}

async function closeConversation(conversationId, actor) {
  const db = ensureDb();
  const convo = await getConversation(conversationId);
  const { FieldValue } = admin.firestore;
  const closedAt = new Date().toISOString();
  await convRef(db, conversationId).set({
    status: 'closed',
    closedAt: FieldValue.serverTimestamp(),
    closedBy: actor.uid,
    unreadForSupport: 0,
  }, { merge: true });
  return serializeConversation(convo.id, {
    ...convo,
    status: 'closed',
    closedAt,
    closedBy: actor.uid,
    unreadForSupport: 0,
  });
}

function mapQueryDocs(snap) {
  return snap.docs.map((d) => serializeConversation(d.id, d.data()));
}

async function listConversations({ status } = {}) {
  const db = ensureDb();
  const col = db.collection(COLLECTION);

  if (status === 'closed') {
    const snap = await col
      .where('status', '==', 'closed')
      .orderBy('lastMessageAt', 'desc')
      .limit(80)
      .get();
    return mapQueryDocs(snap);
  }

  const [waitingSnap, openSnap] = await Promise.all([
    col.where('status', '==', 'waiting').orderBy('lastMessageAt', 'desc').limit(80).get(),
    col.where('status', '==', 'open').orderBy('lastMessageAt', 'desc').limit(80).get(),
  ]);
  return [...mapQueryDocs(waitingSnap), ...mapQueryDocs(openSnap)]
    .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')))
    .slice(0, 80);
}

/**
 * Search platform users for outbound desk messaging (name / email).
 * @param {{ q: string, limit?: number, excludeUid?: string }} opts
 */
async function searchUsersForDesk({ q, limit = 20, excludeUid } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) {
    throw Object.assign(new Error('Search query must be at least 2 characters'), { status: 400 });
  }
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const db = ensureDb();
  const snap = await db.collection('users').select().limit(5000).get();
  let ids = snap.docs.map((d) => d.id);

  // Exact uid match shortcut
  if (/^[a-zA-Z0-9_-]{6,128}$/.test(String(q || '').trim())) {
    const exactId = String(q).trim();
    if (!ids.includes(exactId)) {
      const doc = await getUserDoc(exactId);
      if (doc) ids = [exactId, ...ids];
    }
  }

  const metaMap = await buildUserMetaMap(ids);
  const exclude = excludeUid ? String(excludeUid) : '';
  const matches = [];
  ids.forEach((id) => {
    if (exclude && String(id) === exclude) return;
    const entry = metaMap.get(id) || {};
    const name = String(entry.name || '').toLowerCase();
    const email = String(entry.email || '').toLowerCase();
    const idLower = String(id).toLowerCase();
    if (
      name.includes(needle)
      || email.includes(needle)
      || idLower.includes(needle)
    ) {
      matches.push({
        id,
        name: entry.name || id,
        email: entry.email || null,
      });
    }
  });
  matches.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return matches.slice(0, pageSize);
}

/**
 * Staff creates (if needed) and messages a user's support conversation.
 */
async function startOutboundConversation(targetUserId, actor, text, extra = {}) {
  if (!isStaffRole(actor?.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const uid = String(targetUserId || '').trim();
  if (!uid) {
    throw Object.assign(new Error('userId is required'), { status: 400 });
  }
  const body = String(text || '').trim();
  const attachments = Array.isArray(extra.attachments) ? extra.attachments : [];
  if (!body && !attachments.length) {
    throw Object.assign(new Error('Message text is required'), { status: 400 });
  }

  const target = await getUserDoc(uid);
  if (!target) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const db = ensureDb();
  const snap = await convRef(db, uid).get();
  if (!snap.exists) {
    const name = displayNameFromUserData(target)
      || target.displayName
      || target.name
      || target.fullName
      || target.email
      || 'User';
    await createConversation(db, {
      uid,
      name,
      email: target.email || '',
      displayName: name,
    });
  }

  return postMessage(uid, actor, text, extra);
}

function startOfDay(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Invalid date range'), { status: 400 });
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr) {
  const d = startOfDay(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function countWhere(col, field, value) {
  try {
    const snap = await col.where(field, '==', value).count().get();
    return Number(snap.data().count || 0);
  } catch {
    // Avoid full-collection scans on failure — return 0 and log.
    console.warn(`[Support] countWhere(${field}=${value}) failed`);
    return 0;
  }
}

async function countQuery(query) {
  try {
    const snap = await query.count().get();
    return Number(snap.data().count || 0);
  } catch {
    console.warn('[Support] countQuery failed');
    return 0;
  }
}

function replyDeltaMs(data) {
  const created = data.createdAt?.toDate?.() || data.createdAt;
  const first = data.firstResponseAt?.toDate?.() || data.firstResponseAt;
  const c = created instanceof Date ? created : created ? new Date(created) : null;
  const f = first instanceof Date ? first : first ? new Date(first) : null;
  if (!c || !f || Number.isNaN(c.getTime()) || Number.isNaN(f.getTime())) return null;
  return Math.max(0, f.getTime() - c.getTime());
}

function avgLabel(samples) {
  if (!samples.length) return { ms: 0, label: '—' };
  const ms = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  return { ms, label: formatDuration(ms) };
}

const KPI_CACHE_TTL_MS = 20_000;
const kpiCache = new Map();

function kpiCacheKey({ from, to, staffUid, lite }) {
  return `${from || ''}|${to || ''}|${staffUid || ''}|${lite ? '1' : '0'}`;
}

async function settledValue(promise, fallback = 0) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/**
 * Support desk KPIs.
 * - lite=true: queue + today volume only (no collectionGroup message scans)
 * - Results cached ~20s to keep hub/analytics snappy under admin load
 */
async function getKpis({ from, to, staffUid, lite = false } = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const cacheKey = kpiCacheKey({ from: from || todayStr, to: to || todayStr, staffUid, lite });
  const cached = kpiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < KPI_CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const db = ensureDb();
  const col = db.collection(COLLECTION);
  const fromDate = startOfDay(from || todayStr);
  const toDateExclusive = endOfDay(to || todayStr);
  const fromTs = admin.firestore.Timestamp.fromDate(fromDate);
  const toTs = admin.firestore.Timestamp.fromDate(toDateExclusive);
  const sevenStart = new Date(toDateExclusive);
  sevenStart.setUTCDate(sevenStart.getUTCDate() - 7);
  const sevenTs = admin.firestore.Timestamp.fromDate(sevenStart);

  const oldestWaitPromise = (async () => {
    try {
      const oldestSnap = await col.where('status', '==', 'waiting').orderBy('lastMessageAt', 'asc').limit(1).get();
      const row = oldestSnap.docs[0];
      if (!row) return 0;
      const data = row.data() || {};
      const when = data.lastMessageAt?.toDate?.() || data.createdAt?.toDate?.() || data.lastMessageAt || data.createdAt;
      const at = when instanceof Date ? when : when ? new Date(when) : null;
      if (!at || Number.isNaN(at.getTime())) return 0;
      return Math.max(0, Date.now() - at.getTime());
    } catch (err) {
      console.warn('[Support] oldest-wait KPI query failed:', err.message);
      return 0;
    }
  })();

  const firstReplyPromise = (async () => {
    const firstReplyMs = [];
    const mineFirstReplyToday = [];
    const mineFirstReply7d = [];
    try {
      const replied = await col
        .where('firstResponseAt', '>=', sevenTs)
        .where('firstResponseAt', '<', toTs)
        .limit(lite ? 80 : 200)
        .get();
      replied.docs.forEach((d) => {
        const data = d.data() || {};
        const delta = replyDeltaMs(data);
        if (delta == null) return;
        const at = data.firstResponseAt?.toDate?.() || data.firstResponseAt;
        const t = at instanceof Date ? at : at ? new Date(at) : null;
        const inToday = t && t >= fromDate && t < toDateExclusive;
        if (inToday) firstReplyMs.push(delta);
        if (staffUid && data.firstResponderId === staffUid) {
          mineFirstReply7d.push(delta);
          if (inToday) mineFirstReplyToday.push(delta);
        }
      });
    } catch (err) {
      console.warn('[Support] first-reply KPI query failed:', err.message);
    }
    return { firstReplyMs, mineFirstReplyToday, mineFirstReply7d };
  })();

  // Queue + today volume run together. Skip all-time closed + collectionGroup message
  // scans in lite mode (those dominate latency on large datasets).
  const tasks = {
    open: countWhere(col, 'status', 'open'),
    waiting: countWhere(col, 'status', 'waiting'),
    oldestWaitMs: oldestWaitPromise,
    closedToday: settledValue(
      countQuery(col.where('status', '==', 'closed').where('closedAt', '>=', fromTs).where('closedAt', '<', toTs)),
      0,
    ),
    conversationsToday: settledValue(
      countQuery(col.where('createdAt', '>=', fromTs).where('createdAt', '<', toTs)),
      0,
    ),
    firstReply: firstReplyPromise,
  };

  if (!lite) {
    tasks.closed = countWhere(col, 'status', 'closed');
    tasks.conversations7d = settledValue(
      countQuery(col.where('createdAt', '>=', sevenTs).where('createdAt', '<', toTs)),
      0,
    );
    tasks.messagesToday = settledValue(
      countQuery(db.collectionGroup('messages').where('createdAt', '>=', fromTs).where('createdAt', '<', toTs)),
      0,
    );
    tasks.messages7d = settledValue(
      countQuery(db.collectionGroup('messages').where('createdAt', '>=', sevenTs).where('createdAt', '<', toTs)),
      0,
    );
    if (staffUid) {
      tasks.mineReplied = (async () => {
        const viaRepliers = await settledValue(
          countQuery(col.where('replierIds', 'array-contains', staffUid)),
          0,
        );
        if (viaRepliers) return viaRepliers;
        return settledValue(countQuery(col.where('firstResponderId', '==', staffUid)), 0);
      })();
      tasks.mineClosedToday = settledValue(
        countQuery(
          col.where('closedBy', '==', staffUid).where('closedAt', '>=', fromTs).where('closedAt', '<', toTs),
        ),
        0,
      );
    }
  }

  const entries = await Promise.all(
    Object.entries(tasks).map(async ([key, promise]) => [key, await promise]),
  );
  const result = Object.fromEntries(entries);

  const todayAvg = avgLabel(result.firstReply?.firstReplyMs || []);
  const mineToday = avgLabel(result.firstReply?.mineFirstReplyToday || []);
  const mineWeek = avgLabel(result.firstReply?.mineFirstReply7d || []);
  const oldestWaitMs = Number(result.oldestWaitMs || 0);

  const data = {
    open: Number(result.open || 0),
    waiting: Number(result.waiting || 0),
    closed: Number(result.closed || 0),
    closedToday: Number(result.closedToday || 0),
    oldestWaitMs,
    oldestWaitLabel: oldestWaitMs ? formatDuration(oldestWaitMs) : '—',
    conversationsToday: Number(result.conversationsToday || 0),
    conversations7d: Number(result.conversations7d || 0),
    messagesToday: Number(result.messagesToday || 0),
    messages7d: Number(result.messages7d || 0),
    mineReplied: Number(result.mineReplied || 0),
    mineClosedToday: Number(result.mineClosedToday || 0),
    mineFirstReplyMs: mineToday.ms,
    mineFirstReplyLabel: mineToday.label,
    mineFirstReply7dMs: mineWeek.ms,
    mineFirstReply7dLabel: mineWeek.label,
    avgFirstReplyMs: todayAvg.ms,
    avgFirstReplyLabel: todayAvg.label,
    sampleSize: (result.firstReply?.firstReplyMs || []).length,
    lite: Boolean(lite),
  };

  kpiCache.set(cacheKey, { at: Date.now(), data });
  if (kpiCache.size > 40) {
    const first = kpiCache.keys().next().value;
    kpiCache.delete(first);
  }
  return data;
}

function formatDuration(ms) {
  if (!ms) return '—';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

module.exports = {
  COLLECTION,
  serializeConversation,
  serializeMessage,
  getOrCreateMine,
  stampUserTimeZone,
  getConversation,
  getMessages,
  postMessage,
  markRead,
  claimConversation,
  closeConversation,
  listConversations,
  searchUsersForDesk,
  startOutboundConversation,
  getKpis,
  assertUserCanAccess,
};
