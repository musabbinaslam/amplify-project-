const admin = require('../config/firebaseAdmin');
const { getUserDoc } = require('../services/userDataService');
const supportConversationService = require('../services/supportConversationService');
const { isSupportStaffRole } = require('../middleware/requireSupportOrAdmin');

let nsp = null;

function convRoom(id) {
  return `support:conv:${String(id)}`;
}

function userRoom(uid) {
  return `support:user:${String(uid)}`;
}

const INBOX_ROOM = 'support:inbox';
const staffSocketCounts = new Map();

function addStaffPresence(uid) {
  if (!uid) return;
  staffSocketCounts.set(uid, (staffSocketCounts.get(uid) || 0) + 1);
}

function removeStaffPresence(uid) {
  if (!uid) return;
  const next = (staffSocketCounts.get(uid) || 1) - 1;
  if (next <= 0) staffSocketCounts.delete(uid);
  else staffSocketCounts.set(uid, next);
}

function getStaffOnlineCount() {
  return staffSocketCounts.size;
}

async function authenticateSocket(socket, next) {
  try {
    if (!admin) return next(new Error('Auth service unavailable'));
    const token = socket.handshake?.auth?.token
      || socket.handshake?.query?.token
      || (String(socket.handshake?.headers?.authorization || '').startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : '');
    if (!token) return next(new Error('Missing auth token'));
    const decoded = await admin.auth().verifyIdToken(String(token));
    const doc = await getUserDoc(decoded.uid);
    socket.uid = decoded.uid;
    socket.role = doc?.role || 'agent';
    socket.userName = doc?.displayName || doc?.name || doc?.fullName || decoded.name || decoded.email || '';
    socket.userEmail = decoded.email || doc?.email || '';
    next();
  } catch (err) {
    console.warn('[SupportSockets] handshake failed:', err.message);
    next(new Error('Unauthorized'));
  }
}

function actorFromSocket(socket) {
  return {
    uid: socket.uid,
    role: socket.role,
    name: socket.userName,
    email: socket.userEmail,
  };
}

function emitPresence() {
  if (!nsp) return;
  const count = getStaffOnlineCount();
  nsp.emit('support:presence', { staffOnline: count, online: count > 0 });
}

function broadcastMessage(conversation, message) {
  if (!nsp || !conversation?.id) return;
  const payload = { conversation, message };
  const rooms = [convRoom(conversation.id), INBOX_ROOM];
  if (conversation.userId) rooms.push(userRoom(conversation.userId));
  // Single multi-room emit so sockets in both inbox + conv get the event once.
  nsp.to(rooms).emit('support:message:new', payload);
  nsp.to(INBOX_ROOM).emit('support:inbox:updated', conversation);
}

function broadcastConversation(conversation, event = 'support:inbox:updated') {
  if (!nsp || !conversation?.id) return;
  const hasMessages = Number(conversation.messageCount || 0) > 0 || Boolean(conversation.lastMessagePreview);
  const rooms = [convRoom(conversation.id)];
  if (conversation.userId) rooms.push(userRoom(conversation.userId));
  if (hasMessages) rooms.push(INBOX_ROOM);

  if (event === 'support:read') {
    // Deliver read receipts to inbox + open thread + user in one shot.
    nsp.to(rooms).emit('support:read', { conversation });
    if (hasMessages) {
      nsp.to(INBOX_ROOM).emit('support:inbox:updated', conversation);
    }
    return;
  }
  nsp.to(rooms).emit(event, { conversation });
  if (event !== 'support:inbox:updated' && hasMessages) {
    nsp.to(INBOX_ROOM).emit('support:inbox:updated', conversation);
  }
}

function setupSupportSockets(io) {
  nsp = io.of('/support');
  nsp.use(authenticateSocket);

  nsp.on('connection', (socket) => {
    socket.join(userRoom(socket.uid));
    if (isSupportStaffRole(socket.role)) {
      socket.join(INBOX_ROOM);
      addStaffPresence(socket.uid);
    }
    emitPresence();

    socket.on('support:join', (payload = {}) => {
      const conversationId = String(payload.conversationId || '').trim();
      if (!conversationId) return;
      if (!isSupportStaffRole(socket.role) && conversationId !== socket.uid) {
        socket.emit('support:error', { error: 'Forbidden' });
        return;
      }
      if (socket.conversationId && socket.conversationId !== conversationId) {
        socket.leave(convRoom(socket.conversationId));
      }
      socket.join(convRoom(conversationId));
      socket.conversationId = conversationId;
      if (!isSupportStaffRole(socket.role) && payload.timeZone) {
        supportConversationService.stampUserTimeZone(conversationId, payload.timeZone)
          .then((conversation) => {
            const hasMessages = Number(conversation?.messageCount || 0) > 0 || Boolean(conversation?.lastMessagePreview);
            if (conversation && hasMessages) broadcastConversation(conversation);
          })
          .catch(() => {});
      }
    });

    socket.on('support:leave', (payload = {}) => {
      const conversationId = String(payload.conversationId || socket.conversationId || '').trim();
      if (!conversationId) return;
      socket.leave(convRoom(conversationId));
      if (socket.conversationId === conversationId) socket.conversationId = null;
    });

    socket.on('support:message', async (payload = {}, ack) => {
      try {
        const conversationId = String(payload.conversationId || socket.conversationId || '').trim();
        const out = await supportConversationService.postMessage(
          conversationId,
          actorFromSocket(socket),
          payload.text,
          { replyTo: payload.replyTo, attachments: payload.attachments },
        );
        socket.join(convRoom(out.conversation.id));
        broadcastMessage(out.conversation, out.message);
        if (typeof ack === 'function') ack({ ok: true, ...out });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        else socket.emit('support:error', { error: err.message || 'Send failed' });
      }
    });

    socket.on('support:typing', (payload = {}) => {
      const conversationId = String(payload.conversationId || socket.conversationId || '').trim();
      if (!conversationId) return;
      socket.to(convRoom(conversationId)).emit('support:typing', {
        conversationId,
        uid: socket.uid,
        role: isSupportStaffRole(socket.role)
          ? (socket.role === 'admin' ? 'admin' : 'support')
          : 'user',
        typing: payload.typing !== false,
      });
    });

    socket.on('support:read', async (payload = {}, ack) => {
      try {
        const conversationId = String(payload.conversationId || socket.conversationId || '').trim();
        if (!conversationId) return;
        const out = await supportConversationService.markRead(
          conversationId,
          actorFromSocket(socket),
        );
        if (out.changed) broadcastConversation(out.conversation, 'support:read');
        if (typeof ack === 'function') ack({ ok: true, conversation: out.conversation, changed: out.changed });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        else socket.emit('support:error', { error: err.message || 'Read failed' });
      }
    });

    socket.on('disconnect', () => {
      if (isSupportStaffRole(socket.role)) removeStaffPresence(socket.uid);
      emitPresence();
    });
  });

  console.log('✅ Support Socket.IO namespace /support enabled');
}

module.exports = {
  setupSupportSockets,
  broadcastMessage,
  broadcastConversation,
  getStaffOnlineCount,
};
