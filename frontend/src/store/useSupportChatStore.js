import { create } from 'zustand';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../config/apiBase';
import { getMySupportConversation, markSupportRead } from '../services/supportLiveService';
import { browserTimeZone } from '../utils/chatDaySeparators';

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

/** Infer desk unread from timestamps when server unreadForSupport is stale/0. */
export function deskUnreadFromConversation(conversation) {
  if (!conversation?.id) return 0;
  const hasMessage = Boolean(conversation.lastMessagePreview)
    || Number(conversation.messageCount || 0) > 0;
  if (!hasMessage) return 0;
  const staffReply = conversation.lastSenderRole === 'support'
    || conversation.lastSenderRole === 'admin';
  if (staffReply) return 0;
  if (conversation.clearUnread) return 0;
  return Math.max(Number(conversation.unreadForSupport || 0), 0);
}

const useSupportChatStore = create((set, get) => ({
  conversation: null,
  messages: [],
  unreadForUser: 0,
  deskUnreadTotal: 0,
  deskUnreadById: {},
  popupOpen: false,
  popupMinimized: true,
  supportTyping: false,
  userTyping: false,
  staffOnline: false,
  staffCount: 0,
  viewingThread: false,
  connected: false,
  loading: false,
  _socket: null,
  _getIdToken: null,
  _joinedConversationId: null,
  _activeDeskConversationId: null,
  _markReadTimer: null,
  _isStaffViewer: false,
  _deskCountedMessageIds: {},

  setViewingThread: (viewingThread) => set({ viewingThread: Boolean(viewingThread) }),

  setActiveDeskConversation: (conversationId) => {
    const id = conversationId ? String(conversationId) : null;
    set({ _activeDeskConversationId: id });
    if (!id) return;
    const byId = { ...get().deskUnreadById };
    let changed = false;
    if (byId[id] != null) {
      delete byId[id];
      changed = true;
    }
    // Guard against mixed string/raw keys from older payloads.
    Object.keys(byId).forEach((key) => {
      if (String(key) === id) {
        delete byId[key];
        changed = true;
      }
    });
    if (changed) {
      const total = Object.values(byId).reduce((sum, n) => sum + Number(n || 0), 0);
      set({ deskUnreadById: byId, deskUnreadTotal: total });
    }
  },

  syncDeskUnreadFromRows: (rows = []) => {
    const activeId = get()._activeDeskConversationId
      ? String(get()._activeDeskConversationId)
      : null;
    const byId = {};
    let total = 0;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row?.id) return;
      const id = String(row.id);
      if (activeId && id === activeId) return; // open thread is never unread
      if (row.clearUnread) return; // explicitly marked read
      const staffReply = row.lastSenderRole === 'support' || row.lastSenderRole === 'admin';
      if (staffReply) return; // staff sent the last message
      const rowUnread = Number(row.unreadForSupport || 0);
      if (rowUnread > 0) {
        byId[row.id] = rowUnread;
        total += rowUnread;
      }
    });
    set({ deskUnreadById: byId, deskUnreadTotal: total });
  },

  applyDeskInboxUpdate: (conversation, {
    silent = false,
    fromUserMessage = false,
    messageId = null,
  } = {}) => {
    if (!conversation?.id) return;
    const hasContent = Number(conversation.messageCount || 0) > 0 || Boolean(conversation.lastMessagePreview);
    if (!hasContent) return;
    const convoId = String(conversation.id);
    const activeId = get()._activeDeskConversationId
      ? String(get()._activeDeskConversationId)
      : null;
    const viewingOpen = Boolean(activeId && activeId === convoId);
    const prevById = { ...get().deskUnreadById };
    const prevCount = Number(prevById[conversation.id] || prevById[convoId] || 0);
    const incoming = Number(conversation.unreadForSupport || 0);
    const inferred = deskUnreadFromConversation(conversation);
    const staffReply = conversation.lastSenderRole === 'support'
      || conversation.lastSenderRole === 'admin';
    const explicitClear = viewingOpen
      || conversation.clearUnread
      || staffReply
      || incoming <= 0;

    const counted = get()._deskCountedMessageIds || {};
    const msgKey = messageId ? String(messageId) : null;
    const alreadyCounted = Boolean(msgKey && counted[msgKey]);

    let effective;
    if (viewingOpen || explicitClear) {
      effective = 0;
    } else if (fromUserMessage && !alreadyCounted) {
      // Each new message increments; prefer server count when it's ahead.
      effective = Math.max(incoming, prevCount + 1, 1);
      if (msgKey) {
        set({
          _deskCountedMessageIds: {
            ...counted,
            [msgKey]: true,
          },
        });
      }
    } else if (fromUserMessage && alreadyCounted) {
      effective = Math.max(incoming, prevCount);
    } else {
      effective = incoming;
    }

    // Re-read in case messageId set() happened above
    const latestById = { ...get().deskUnreadById };
    Object.keys(latestById).forEach((key) => {
      if (String(key) === convoId) delete latestById[key];
    });
    if (effective > 0) latestById[conversation.id] = effective;
    const total = Object.values(latestById).reduce((sum, n) => sum + Number(n || 0), 0);
    set({ deskUnreadById: latestById, deskUnreadTotal: total });
    if (
      !silent
      && fromUserMessage
      && !alreadyCounted
      && !viewingOpen
      && typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('support-desk:user-message', {
        detail: {
          conversation: {
            ...conversation,
            unreadForSupport: effective,
          },
          preview: conversation.lastMessagePreview || 'New support message',
          unread: effective,
        },
      }));
    }
  },

  openPopup: () => set({ popupOpen: true, popupMinimized: false }),
  minimizePopup: () => set({ popupMinimized: true, popupOpen: true }),
  closePopup: () => set({ popupOpen: false, popupMinimized: true }),

  /** Ensure conversation + socket room are ready before chatting from the popup. */
  prepareUserChat: async () => {
    const state = get();
    const getIdToken = state._getIdToken;
    if (!state._socket && typeof getIdToken === 'function') {
      await get().connect(getIdToken, {
        isStaffViewer: false,
      });
    }
    const out = await get().loadMine();
    const convoId = out?.conversation?.id || get().conversation?.id;
    if (convoId) {
      get().joinConversation(convoId, { timeZone: browserTimeZone() });
    }
    return out;
  },

  applyConversation: (conversation) => {
    if (!conversation) return;
    set((state) => {
      const prev = state.conversation || {};
      const a = prev.userLastReadAt ? new Date(prev.userLastReadAt).getTime() : 0;
      const b = conversation.userLastReadAt ? new Date(conversation.userLastReadAt).getTime() : 0;
      const sa = prev.supportLastReadAt ? new Date(prev.supportLastReadAt).getTime() : 0;
      const sb = conversation.supportLastReadAt ? new Date(conversation.supportLastReadAt).getTime() : 0;
      return {
        conversation: {
          ...prev,
          ...conversation,
          userLastReadAt: (!a || (b && b >= a)) ? (conversation.userLastReadAt || prev.userLastReadAt || null) : prev.userLastReadAt,
          supportLastReadAt: (!sa || (sb && sb >= sa)) ? (conversation.supportLastReadAt || prev.supportLastReadAt || null) : prev.supportLastReadAt,
        },
        unreadForUser: Number(conversation.unreadForUser ?? state.unreadForUser ?? 0),
      };
    });
  },

  applyIncoming: ({ conversation, message }, { isOwn = false, isStaffViewer = false } = {}) => {
    const state = get();
    let messages = state.messages;
    if (message && (!state.conversation || message) && (
      !state.conversation || conversation?.id === state.conversation.id || !state.conversation
    )) {
      if (!state.conversation || conversation?.id === state.conversation.id) {
        messages = upsertMessage(state.messages, message);
      }
    }
    const prev = state.conversation || {};
    const incomingConvo = conversation || null;
    let nextConvo = incomingConvo || prev;
    if (incomingConvo && prev?.id && incomingConvo.id === prev.id) {
      const a = prev.userLastReadAt ? new Date(prev.userLastReadAt).getTime() : 0;
      const b = incomingConvo.userLastReadAt ? new Date(incomingConvo.userLastReadAt).getTime() : 0;
      const sa = prev.supportLastReadAt ? new Date(prev.supportLastReadAt).getTime() : 0;
      const sb = incomingConvo.supportLastReadAt ? new Date(incomingConvo.supportLastReadAt).getTime() : 0;
      nextConvo = {
        ...prev,
        ...incomingConvo,
        userLastReadAt: (!a || (b && b >= a)) ? (incomingConvo.userLastReadAt || prev.userLastReadAt || null) : prev.userLastReadAt,
        supportLastReadAt: (!sa || (sb && sb >= sa)) ? (incomingConvo.supportLastReadAt || prev.supportLastReadAt || null) : prev.supportLastReadAt,
      };
    }
    const fromSupport = message?.senderRole === 'support' || message?.senderRole === 'admin';
    const shouldPopup = !isStaffViewer && fromSupport && !isOwn && !state.viewingThread;
    set({
      conversation: nextConvo || state.conversation,
      messages,
      unreadForUser: Number(nextConvo?.unreadForUser ?? state.unreadForUser),
      popupOpen: shouldPopup ? true : state.popupOpen,
      popupMinimized: shouldPopup ? false : state.popupMinimized,
      supportTyping: fromSupport ? false : state.supportTyping,
    });
    if (fromSupport && !isOwn && (state.viewingThread || (state.popupOpen && !state.popupMinimized))) {
      const uid = get()._uid;
      const ownerId = nextConvo?.userId || nextConvo?.id || state.conversation?.userId || state.conversation?.id;
      // Staff accounts can own a support thread when testing as the customer.
      if (uid && ownerId && String(uid) === String(ownerId)) {
        queueMicrotask(() => get().markRead());
      }
    }
    if (shouldPopup && typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined') {
      const fire = async () => {
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const notif = new Notification('Callsflow Support', {
            body: String(message?.text || 'New message').slice(0, 140),
            icon: '/favicon.ico',
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
            get().openPopup();
          };
        }
      };
      fire().catch(() => {});
    }
  },

  loadMine: async () => {
    set({ loading: true });
    try {
      const out = await getMySupportConversation();
      set({
        conversation: out?.conversation || null,
        messages: Array.isArray(out?.messages) ? out.messages : [],
        unreadForUser: Number(out?.conversation?.unreadForUser || 0),
        loading: false,
      });
      const socket = get()._socket;
      const convoId = out?.conversation?.id;
      if (convoId) {
        set({ _joinedConversationId: convoId });
        if (socket?.connected) {
          socket.emit('support:join', {
            conversationId: convoId,
            timeZone: browserTimeZone(),
          });
        }
      }
      return out;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  connect: async (getIdToken, { isStaffViewer = false } = {}) => {
    if (get()._socket) {
      // HMR / role changes can leave a socket without staff inbox handlers.
      if (Boolean(get()._isStaffViewer) === Boolean(isStaffViewer)) {
        return get()._socket;
      }
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
    socket.on('support:message:new', (payload = {}) => {
      const uid = payload?.message?.senderId;
      const myUid = get()._uid;
      const incoming = payload?.message;
      if (incoming && String(incoming.id || '').startsWith('tmp-') === false) {
        const temps = get().messages.filter((m) => String(m.id).startsWith('tmp-') && m.text === incoming.text);
        if (temps.length) {
          set({
            messages: get().messages.map((m) => (
              m.id === temps[0].id
                ? {
                  ...incoming,
                  replyTo: incoming.replyTo ?? m.replyTo ?? null,
                  attachments: incoming.attachments?.length ? incoming.attachments : m.attachments,
                }
                : m
            )),
          });
        }
      }
      if (get()._isStaffViewer && payload?.conversation) {
        const msg = payload?.message;
        const activeId = get()._activeDeskConversationId;
        const viewingOpen = Boolean(
          activeId && String(activeId) === String(payload.conversation.id),
        );
        get().applyDeskInboxUpdate(payload.conversation, {
          fromUserMessage: Boolean(msg?.id) && !viewingOpen,
          silent: false,
          messageId: msg?.id || null,
        });
      }
      get().applyIncoming(payload, {
        isOwn: Boolean(myUid && uid === myUid),
        isStaffViewer,
      });
    });
    socket.on('support:typing', (payload = {}) => {
      if (payload.role === 'support' || payload.role === 'admin') {
        set({ supportTyping: Boolean(payload.typing) });
      }
      if (payload.role === 'user') set({ userTyping: Boolean(payload.typing) });
    });
    socket.on('support:read', (payload = {}) => {
      if (payload.conversation) {
        get().applyConversation(payload.conversation);
        if (isStaffViewer || get()._isStaffViewer) {
          get().applyDeskInboxUpdate(payload.conversation, { silent: true });
        }
      }
    });
    socket.on('support:claimed', (payload = {}) => {
      if (payload.conversation) get().applyConversation(payload.conversation);
    });
    socket.on('support:closed', (payload = {}) => {
      if (payload.conversation) {
        get().applyConversation(payload.conversation);
        if (isStaffViewer || get()._isStaffViewer) {
          get().applyDeskInboxUpdate(payload.conversation, { silent: true });
        }
      }
    });
    socket.on('support:inbox:updated', (conversation) => {
      if (conversation && get().conversation?.id === conversation.id) {
        get().applyConversation(conversation);
      }
      if ((isStaffViewer || get()._isStaffViewer) && conversation) {
        // Sync absolute counts only — do not +1 here (message:new already increments).
        get().applyDeskInboxUpdate(conversation, { silent: true });
      }
    });

    set({ _socket: socket });
    return socket;
  },

  setUid: (uid) => set({ _uid: uid }),

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
        ...(replyTo ? { replyTo } : {}),
        ...(media.length ? { attachments: media } : {}),
      };
      if (_socket?.connected) {
        _socket.emit('support:message', payload, finish);
      } else {
        import('../services/supportLiveService').then(({ postSupportMessage }) => {
          postSupportMessage(conversation.id, body, { replyTo, attachments: media }).then((out) => {
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
    // Already caught up — skip network.
    if (
      Number(conversation.unreadForUser || 0) === 0
      && prevMs
      && lastMsgMs
      && prevMs >= lastMsgMs
    ) {
      return;
    }
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
        socket.emit('support:read', { conversationId: convo.id }, (res) => {
          if (res?.ok && res.conversation) get().applyConversation(res.conversation);
        });
      } else {
        markSupportRead(convo.id).then((out) => {
          if (out?.conversation) get().applyConversation(out.conversation);
        }).catch(() => {});
      }
    }, 450);
    set({ _markReadTimer: timer });
  },

  disconnect: () => {
    const socket = get()._socket;
    if (socket) {
      socket.disconnect();
    }
    set({
      _socket: null,
      connected: false,
      supportTyping: false,
      userTyping: false,
      _activeDeskConversationId: null,
    });
  },
}));

export default useSupportChatStore;
