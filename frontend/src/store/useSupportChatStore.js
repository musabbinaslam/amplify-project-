import { create } from 'zustand';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '../config/apiBase';
import { getMySupportConversation, markSupportRead } from '../services/supportLiveService';
import { browserTimeZone } from '../utils/chatDaySeparators';
import { playNotificationSound } from '../utils/soundUtil';
import useSupportDeskStore from './useSupportDeskStore';

/* ─── helpers ─── */

function upsertMessage(messages, incoming) {
  if (!incoming?.id) return messages;
  if (messages.some((m) => m.id === incoming.id)) {
    return messages.map((m) => (
      m.id === incoming.id
        ? {
          ...m,
          ...incoming,
          replyTo: incoming.replyTo ?? m.replyTo ?? null,
          attachments: incoming.attachments?.length ? incoming.attachments : m.attachments,
        }
        : m
    ));
  }
  return [...messages, incoming];
}

function isMyConversation(convo, state) {
  if (!convo) return false;
  const convoId = String(convo.id || convo.conversationId || '').trim();
  if (!convoId) return false;
  const myUid = state?._uid ? String(state._uid).trim() : null;
  const convoUserId = convo.userId ? String(convo.userId).trim() : null;

  // A customer conversation belongs strictly to the user if convoId === myUid or convoUserId === myUid
  if (myUid) {
    return convoId === myUid || convoUserId === myUid;
  }
  const currentConvoId = state?.conversation?.id ? String(state.conversation.id).trim() : null;
  if (currentConvoId && convoId === currentConvoId) return true;
  return false;
}

function laterReadAt(a, b) {
  const aMs = a ? new Date(a).getTime() : 0;
  const bMs = b ? new Date(b).getTime() : 0;
  if (!aMs || Number.isNaN(aMs)) return b || null;
  if (!bMs || Number.isNaN(bMs)) return a || null;
  return bMs >= aMs ? b : a;
}

/* ─── Store: customer-only ─── */

const useSupportChatStore = create((set, get) => ({
  conversation: null,
  messages: [],
  unreadForUser: 0,
  popupOpen: false,
  popupMinimized: true,
  supportTyping: false,
  _typingTimeout: null,
  staffOnline: false,
  staffCount: 0,
  viewingThread: false,
  connected: false,
  loading: false,
  _socket: null,
  _getIdToken: null,
  _joinedConversationId: null,
  _markReadTimer: null,
  _uid: null,

  setViewingThread: (v) => set({ viewingThread: Boolean(v) }),

  /* ── Desk delegation helpers (backward compat for Sidebar/Topbar) ── */
  setActiveDeskConversation: (id) => {
    // When a desk thread opens, clear its unread in the desk store
    if (id) useSupportDeskStore.getState().markThreadRead(id);
  },
  syncDeskUnreadFromRows: (rows) => useSupportDeskStore.getState().syncUnreadFromRows(rows),
  applyDeskInboxUpdate: (conversation) => useSupportDeskStore.getState().upsertRow(conversation),

  openPopup: () => {
    set({ popupOpen: true, popupMinimized: false, unreadForUser: 0 });
    get().markRead();
  },
  minimizePopup: () => set({ popupMinimized: true }),
  closePopup: () => set({ popupOpen: false, popupMinimized: true }),

  /* ── Prepare user chat (popup bootstrap) ── */
  prepareUserChat: async () => {
    const state = get();
    const getIdToken = state._getIdToken;
    if (!state._socket && typeof getIdToken === 'function') {
      await get().connect(getIdToken, { isStaffViewer: false });
    }
    const out = await get().loadMine();
    const convoId = out?.conversation?.id || get().conversation?.id;
    if (convoId) {
      get().joinConversation(convoId, { timeZone: browserTimeZone() });
    }
    return out;
  },

  /* ── Apply conversation update (customer side) ── */
  applyConversation: (conversation) => {
    if (!conversation || !isMyConversation(conversation, get())) return;
    const isViewing = get().viewingThread || (get().popupOpen && !get().popupMinimized);
    set((s) => {
      const prev = s.conversation || {};
      const unread = isViewing ? 0 : Number(conversation.unreadForUser ?? s.unreadForUser ?? 0);
      return {
        conversation: {
          ...prev,
          ...conversation,
          userLastReadAt: laterReadAt(prev.userLastReadAt, conversation.userLastReadAt),
          supportLastReadAt: laterReadAt(prev.supportLastReadAt, conversation.supportLastReadAt),
        },
        unreadForUser: unread,
      };
    });
    if (isViewing && Number(conversation.unreadForUser || 0) > 0) {
      queueMicrotask(() => get().markRead());
    }
  },

  /* ── Apply incoming message (customer side) ── */
  applyIncoming: ({ conversation, message }, { isOwn = false } = {}) => {
    const state = get();
    if (conversation && !isMyConversation(conversation, state)) return;

    let messages = state.messages;
    if (message) messages = upsertMessage(state.messages, message);

    const prev = state.conversation || {};
    let nextConvo = conversation || prev;
    if (conversation && prev?.id && conversation.id === prev.id) {
      nextConvo = {
        ...prev,
        ...conversation,
        userLastReadAt: laterReadAt(prev.userLastReadAt, conversation.userLastReadAt),
        supportLastReadAt: laterReadAt(prev.supportLastReadAt, conversation.supportLastReadAt),
      };
    }

    const fromSupport = message?.senderRole === 'support' || message?.senderRole === 'admin';
    const isViewing = state.viewingThread || (state.popupOpen && !state.popupMinimized);
    const nextUnread = isViewing
      ? 0
      : Math.max(Number(nextConvo?.unreadForUser || 0), Number(state.unreadForUser || 0) + 1, 1);

    if (fromSupport && state._typingTimeout) {
      clearTimeout(state._typingTimeout);
    }

    set({
      conversation: nextConvo || state.conversation,
      messages,
      unreadForUser: nextUnread,
      popupOpen: state.popupOpen,
      popupMinimized: state.popupMinimized,
      supportTyping: fromSupport ? false : state.supportTyping,
      _typingTimeout: fromSupport ? null : state._typingTimeout,
    });

    if (fromSupport && !isOwn && isViewing) {
      const uid = get()._uid;
      const ownerId = nextConvo?.userId || nextConvo?.id;
      if (uid && ownerId && String(uid) === String(ownerId)) {
        queueMicrotask(() => get().markRead());
      }
    }

    // Play chime & show toast if not currently viewing the active chat
    if (fromSupport && !isViewing) {
      playNotificationSound();
      const senderName = message?.senderName || (message?.senderRole === 'admin' ? 'Admin' : 'Support agent');
      const preview = String(message?.text || (message?.attachments?.length ? 'Sent an attachment' : 'New message')).slice(0, 80);
      toast(`${senderName}: ${preview}`, {
        icon: '💬',
        id: `chat-notif-${message?.id || Date.now()}`,
        duration: 5000,
      });

      // Desktop OS notification
      if (typeof Notification !== 'undefined') {
        (async () => {
          let permission = Notification.permission;
          if (permission === 'default') permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const notif = new Notification(`${senderName} (Callsflow Support)`, {
              body: preview,
              icon: '/favicon.ico',
              tag: `support-${message?.id || Date.now()}`,
            });
            notif.onclick = () => { window.focus(); notif.close(); get().openPopup(); };
          }
        })().catch(() => {});
      }
    }
  },

  /* ── Load my conversation ── */
  loadMine: async () => {
    set({ loading: true });
    try {
      const out = await getMySupportConversation();
      const isViewing = get().viewingThread;
      const serverUnread = Number(out?.conversation?.unreadForUser || 0);
      set({
        conversation: out?.conversation || null,
        messages: Array.isArray(out?.messages) ? out.messages : [],
        unreadForUser: isViewing ? 0 : serverUnread,
        loading: false,
      });
      const socket = get()._socket;
      const convoId = out?.conversation?.id;
      if (convoId) {
        set({ _joinedConversationId: convoId });
        if (socket?.connected) {
          socket.emit('support:join', { conversationId: convoId, timeZone: browserTimeZone() });
        }
      }
      if (isViewing && serverUnread > 0) get().markRead();
      return out;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  /* ── Socket connect ── */
  connect: async (getIdToken, { isStaffViewer = false } = {}) => {
    if (get()._socket) {
      if (Boolean(get()._isStaffViewer) === Boolean(isStaffViewer)) return get()._socket;
      get().disconnect();
    }
    const resolveToken = typeof getIdToken === 'function' ? getIdToken : async () => getIdToken;
    set({ _getIdToken: resolveToken, _isStaffViewer: Boolean(isStaffViewer) });

    const socket = io(`${getApiBaseUrl()}/support`, {
      auth: (cb) => {
        Promise.resolve(resolveToken())
          .then((token) => cb({ token: token || '' }))
          .catch(() => cb({ token: '' }));
      },
      transports: ['websocket', 'polling'],
    });

    // Pass socket to desk store
    useSupportDeskStore.getState().setSocket(socket);

    socket.on('connect', () => {
      set({ connected: true, _socket: socket });
      const convoId = get().conversation?.id || get()._joinedConversationId;
      if (convoId) {
        socket.emit('support:join', isStaffViewer
          ? { conversationId: convoId }
          : { conversationId: convoId, timeZone: browserTimeZone() });
      }
    });
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('support:presence', (payload = {}) => {
      set({
        staffOnline: Boolean(payload.online ?? (payload.staffOnline > 0)),
        staffCount: Number(payload.staffOnline || 0),
      });
    });

    /* ── Message handler ── */
    socket.on('support:message:new', (payload = {}) => {
      // Staff viewers: delegate to desk store
      if (isStaffViewer) {
        useSupportDeskStore.getState().handleInboxMessage(payload);
      }

      // Customer side: only process if this is my conversation
      if (!isMyConversation(payload?.conversation, get())) return;

      const uid = payload?.message?.senderId;
      const myUid = get()._uid;
      const incoming = payload?.message;

      // Reconcile temp messages
      if (incoming && !String(incoming.id || '').startsWith('tmp-')) {
        const temps = get().messages.filter((m) => String(m.id).startsWith('tmp-') && m.text === incoming.text);
        if (temps.length) {
          set({
            messages: get().messages.map((m) => (
              m.id === temps[0].id
                ? { ...incoming, replyTo: incoming.replyTo ?? m.replyTo ?? null, attachments: incoming.attachments?.length ? incoming.attachments : m.attachments }
                : m
            )),
          });
        }
      }
      const isFromSupport = incoming?.senderRole === 'support' || incoming?.senderRole === 'admin';
      const isOwn = isFromSupport ? false : Boolean(myUid && uid === myUid);
      get().applyIncoming(payload, { isOwn });
    });

    socket.on('support:typing', (payload = {}) => {
      // Forward to desk store - it handles active conversation check and self-filter
      useSupportDeskStore.getState().handleTyping(payload);

      // Customer side
      const state = get();
      const currentConvoId = state.conversation?.id || state._joinedConversationId;
      if (payload.conversationId && currentConvoId && String(payload.conversationId) !== String(currentConvoId)) return;
      if (payload.uid && state._uid && String(payload.uid) === String(state._uid)) return;

      const isTyping = Boolean(payload.typing);
      if (state._typingTimeout) clearTimeout(state._typingTimeout);
      let timeout = null;
      if (isTyping) {
        timeout = setTimeout(() => {
          set({ supportTyping: false, _typingTimeout: null });
        }, 3000);
      }
      set({ supportTyping: isTyping, _typingTimeout: timeout });
    });

    socket.on('support:read', (payload = {}) => {
      if (isStaffViewer) useSupportDeskStore.getState().handleRead(payload?.conversation || payload);
      if (payload.conversation && isMyConversation(payload.conversation, get())) {
        get().applyConversation(payload.conversation);
      }
    });

    socket.on('support:claimed', (payload = {}) => {
      if (isStaffViewer) useSupportDeskStore.getState().handleInboxUpdated(payload?.conversation);
      if (payload.conversation && isMyConversation(payload.conversation, get())) {
        get().applyConversation(payload.conversation);
      }
    });

    socket.on('support:closed', (payload = {}) => {
      if (isStaffViewer) useSupportDeskStore.getState().handleInboxUpdated(payload?.conversation);
      if (payload.conversation && isMyConversation(payload.conversation, get())) {
        get().applyConversation(payload.conversation);
      }
    });

    socket.on('support:inbox:updated', (conversation) => {
      if (isStaffViewer) useSupportDeskStore.getState().handleInboxUpdated(conversation);
      if (conversation && isMyConversation(conversation, get())) {
        get().applyConversation(conversation);
      }
    });

    set({ _socket: socket });
    return socket;
  },

  setUid: (uid) => {
    set({ _uid: uid });
    useSupportDeskStore.getState().setMyUid(uid);
  },

  joinConversation: (conversationId, { timeZone } = {}) => {
    const socket = get()._socket;
    if (!conversationId) return;
    set({ _joinedConversationId: conversationId });
    if (socket) {
      const payload = { conversationId };
      if (timeZone) payload.timeZone = timeZone;
      socket.emit('support:join', payload);
    }
  },

  emitTyping: (conversationId, typing) => {
    const socket = get()._socket;
    if (!socket || !conversationId) return;
    socket.emit('support:typing', { conversationId, typing: Boolean(typing) });
  },

  sendMessage: (text, { replyTo, attachments } = {}) => {
    const { conversation, _socket, messages } = get();
    const body = String(text || '').trim();
    const media = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (!conversation?.id || (!body && !media.length)) {
      return Promise.reject(new Error('No conversation'));
    }
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      senderId: get()._uid,
      senderRole: 'user',
      text: body,
      createdAt: new Date().toISOString(),
      conversationId: conversation.id,
      type: media.length
        ? (media.every((m) => m.kind === 'audio') && !body ? 'audio'
          : media.every((m) => m.kind === 'image') ? 'image'
            : 'file')
        : 'text',
      ...(replyTo ? { replyTo } : {}),
      ...(media.length ? { attachments: media } : {}),
    };
    set({ messages: upsertMessage(messages, optimistic) });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Send timed out')), 12000);
      const finish = (res) => {
        clearTimeout(timeout);
        if (!res?.ok) {
          reject(new Error(res?.error || 'Send failed'));
          return;
        }
        const current = get().messages.filter((m) => m.id !== tempId);
        set({
          conversation: res.conversation || conversation,
          messages: upsertMessage(current, {
            ...res.message,
            replyTo: res.message?.replyTo || replyTo || null,
            attachments: res.message?.attachments || media,
          }),
        });
        resolve(res);
      };
      const payload = {
        conversationId: conversation.id,
        text: body,
        asCustomer: true,
        ...(replyTo ? { replyTo } : {}),
        ...(media.length ? { attachments: media } : {}),
      };
      if (_socket?.connected) {
        _socket.emit('support:message', payload, finish);
      } else {
        import('../services/supportLiveService').then(({ postSupportMessage }) => {
          postSupportMessage(conversation.id, body, { replyTo, attachments: media, asCustomer: true }).then((out) => {
            finish({ ok: true, ...out });
          }).catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      }
    }).catch((err) => {
      set({ messages: get().messages.filter((m) => m.id !== tempId) });
      throw err;
    });
  },

  markRead: () => {
    const { conversation } = get();
    if (!conversation?.id) return;
    const optimisticAt = new Date().toISOString();
    const prevMs = conversation.userLastReadAt ? new Date(conversation.userLastReadAt).getTime() : 0;
    const nextMs = new Date(optimisticAt).getTime();
    const lastMsg = get().messages[get().messages.length - 1];
    const lastMsgMs = lastMsg?.createdAt ? new Date(lastMsg.createdAt).getTime() : 0;
    if (
      Number(conversation.unreadForUser || 0) === 0
      && Number(get().unreadForUser || 0) === 0
      && prevMs && lastMsgMs && prevMs >= lastMsgMs
    ) return;

    set({
      unreadForUser: 0,
      conversation: {
        ...conversation,
        unreadForUser: 0,
        userLastReadAt: (!prevMs || nextMs >= prevMs) ? optimisticAt : conversation.userLastReadAt,
      },
    });
    if (get()._markReadTimer) clearTimeout(get()._markReadTimer);
    const timer = setTimeout(() => {
      const state = get();
      const convo = state.conversation;
      const socket = state._socket;
      if (!convo?.id) return;
      if (socket?.connected) {
        socket.emit('support:read', { conversationId: convo.id, asStaff: false }, (res) => {
          if (res?.ok && res.conversation) get().applyConversation(res.conversation);
        });
      } else {
        markSupportRead(convo.id, { asStaff: false }).then((out) => {
          if (out?.conversation) get().applyConversation(out.conversation);
        }).catch(() => {});
      }
    }, 250);
    set({ _markReadTimer: timer });
  },

  disconnect: () => {
    const socket = get()._socket;
    if (socket) socket.disconnect();
    useSupportDeskStore.getState().setSocket(null);
    set({
      _socket: null,
      connected: false,
      supportTyping: false,
    });
  },
}));

export default useSupportChatStore;

// Re-export for backward compatibility
export { isMyConversation as isCurrentCustomerConversation };

/** @deprecated Use useSupportDeskStore instead */
export function deskUnreadFromConversation(conversation) {
  if (!conversation?.id) return 0;
  const hasMessage = Boolean(conversation.lastMessagePreview) || Number(conversation.messageCount || 0) > 0;
  if (!hasMessage) return 0;
  const staffReply = conversation.lastSenderRole === 'support' || conversation.lastSenderRole === 'admin';
  if (staffReply) return 0;
  if (conversation.clearUnread) return 0;
  return Math.max(Number(conversation.unreadForSupport || 0), 0);
}
