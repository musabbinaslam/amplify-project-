import { create } from 'zustand';
import { playNotificationSound } from '../utils/soundUtil';

/* ─── helpers ─── */

function laterIso(a, b) {
  const aMs = a ? new Date(a).getTime() : 0;
  const bMs = b ? new Date(b).getTime() : 0;
  if (!aMs && !bMs) return b || a || null;
  if (!aMs || Number.isNaN(aMs)) return b || null;
  if (!bMs || Number.isNaN(bMs)) return a || null;
  return bMs >= aMs ? b : a;
}

function tsMs(row) {
  if (!row) return 0;
  const val = row.lastMessageAt || row.updatedAt || row.createdAt;
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') { const p = Date.parse(val); return Number.isNaN(p) ? 0 : p; }
  if (val instanceof Date) return val.getTime();
  return 0;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const diff = tsMs(b) - tsMs(a);
    return diff !== 0 ? diff : String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

function mergeConvo(prev, next) {
  if (!next) return prev || null;
  if (!prev) return next;
  return {
    ...prev,
    ...next,
    userLastReadAt: laterIso(prev.userLastReadAt, next.userLastReadAt),
    supportLastReadAt: laterIso(prev.supportLastReadAt, next.supportLastReadAt),
  };
}

function mergeMessages(existing = [], incoming = []) {
  const byId = new Map();
  const list = [];
  existing.forEach((m) => {
    if (!m?.id) return;
    byId.set(m.id, m);
    list.push(m);
  });
  incoming.forEach((m) => {
    if (!m?.id) return;
    if (byId.has(m.id)) {
      const prev = byId.get(m.id);
      const merged = {
        ...prev, ...m,
        replyTo: m.replyTo ?? prev.replyTo ?? null,
        attachments: m.attachments?.length ? m.attachments : prev.attachments,
      };
      byId.set(m.id, merged);
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx >= 0) list[idx] = merged;
      return;
    }
    // replace temp
    const tempIdx = list.findIndex((x) =>
      String(x.id).startsWith('tmp-') && x.text === m.text && (x.senderRole || '') === (m.senderRole || ''),
    );
    if (tempIdx >= 0) {
      const prev = list[tempIdx];
      byId.delete(prev.id);
      const merged = { ...m, replyTo: m.replyTo ?? prev.replyTo ?? null, attachments: m.attachments?.length ? m.attachments : prev.attachments };
      byId.set(m.id, merged);
      list[tempIdx] = merged;
      return;
    }
    byId.set(m.id, m);
    list.push(m);
  });
  return [...list].sort((a, b) =>
    String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')) || String(a?.id || '').localeCompare(String(b?.id || '')),
  );
}

function hasContent(row) {
  return Number(row?.messageCount || 0) > 0 || Boolean(row?.lastMessagePreview);
}

function isStaffReply(row) {
  return row?.lastSenderRole === 'support' || row?.lastSenderRole === 'admin';
}

/* ─── Store ─── */

const useSupportDeskStore = create((set, get) => ({
  /* inbox */
  rows: [],
  inboxLoading: false,
  tab: 'inbox',

  /* selected thread */
  selectedId: null,
  thread: { conversation: null, messages: [] },
  threadLoading: false,

  /* unread */
  unreadById: {},
  unreadTotal: 0,

  /* typing */
  userTyping: false,
  _typingTimeout: null,

  /* socket ref (shared from useSupportChatStore.connect) */
  _socket: null,
  _myUid: null,
  _joinedConversationId: null,

  /* ──────── actions ──────── */

  setSocket: (socket) => {
    set({ _socket: socket });
    if (socket && !socket._deskTypingBound) {
      socket._deskTypingBound = true;
      socket.on('support:typing', (payload) => {
        get().handleTyping(payload);
      });
      socket.on('connect', () => {
        const joined = get()._joinedConversationId || get().selectedId;
        if (joined && socket.connected) {
          socket.emit('support:join', { conversationId: joined });
        }
      });
    }
  },
  setMyUid: (uid) => set({ _myUid: uid }),
  setSelectedId: (id) => {
    const nextId = id ? String(id) : null;
    const prevTimer = get()._typingTimeout;
    if (prevTimer) clearTimeout(prevTimer);
    set({ selectedId: nextId, userTyping: false, _typingTimeout: null });
    if (nextId) {
      const byId = { ...get().unreadById };
      delete byId[nextId];
      const total = Object.values(byId).reduce((s, n) => s + Number(n || 0), 0);
      set({ unreadById: byId, unreadTotal: total });
    }
  },

  /* ── Inbox ── */
  setTab: (tab) => set({ tab }),

  setRows: (rows) => set({ rows: sortRows(rows.filter(hasContent)) }),

  upsertRow: (conversation, { fromUserMessage = false } = {}) => {
    if (!conversation?.id || !hasContent(conversation)) return;
    const state = get();
    const id = String(conversation.id);
    const isActive = state.selectedId && String(state.selectedId) === id;
    const prev = state.rows.find((r) => String(r.id) === id);
    const merged = mergeConvo(prev, conversation);

    // Unread logic
    let unread = Number(conversation.unreadForSupport || 0);
    if (isActive || conversation.clearUnread || isStaffReply(conversation)) {
      unread = 0;
    } else if (fromUserMessage) {
      const prevUnread = Number(prev?.unreadForSupport || 0);
      unread = Math.max(unread, prevUnread + 1, 1);
    }

    const row = { ...merged, unreadForSupport: unread };
    const next = state.rows.filter((r) => String(r.id) !== id);
    next.push(row);
    const sorted = sortRows(next.filter(hasContent));

    // Update unread map
    const byId = { ...state.unreadById };
    if (unread > 0 && !isActive) {
      byId[id] = unread;
    } else {
      delete byId[id];
    }
    const total = Object.values(byId).reduce((s, n) => s + Number(n || 0), 0);

    set({ rows: sorted, unreadById: byId, unreadTotal: total });
  },

  /* ── Thread ── */
  openThread: (id, preview) => {
    const state = get();
    set({
      selectedId: id,
      threadLoading: true,
      thread: {
        conversation: preview || state.thread.conversation || { id },
        messages: state.thread.conversation?.id === id ? state.thread.messages : [],
      },
    });

    // Clear unread for this thread
    const byId = { ...state.unreadById };
    delete byId[id];
    const total = Object.values(byId).reduce((s, n) => s + Number(n || 0), 0);
    set({ unreadById: byId, unreadTotal: total });

    // Update row unread
    set((s) => ({
      rows: s.rows.map((r) =>
        String(r.id) === String(id)
          ? { ...r, unreadForSupport: 0, clearUnread: true }
          : r,
      ),
    }));
  },

  applyThreadMessages: (id, messages, conversation) => {
    if (String(get().selectedId) !== String(id)) return;
    set((s) => ({
      thread: {
        conversation: mergeConvo(s.thread.conversation, conversation),
        messages: mergeMessages(
          s.thread.conversation?.id === id ? s.thread.messages : [],
          messages,
        ),
      },
      threadLoading: false,
    }));
  },

  appendOptimistic: (msg) => {
    set((s) => ({
      thread: {
        ...s.thread,
        messages: [...s.thread.messages, msg],
      },
    }));
  },

  reconcileMessage: (tempId, confirmed) => {
    set((s) => ({
      thread: {
        conversation: mergeConvo(s.thread.conversation, confirmed.conversation),
        messages: mergeMessages(
          s.thread.messages.filter((m) => m.id !== tempId && m.id !== confirmed.message?.id),
          confirmed.message ? [confirmed.message] : [],
        ),
      },
    }));
  },

  removeOptimistic: (tempId) => {
    set((s) => ({
      thread: {
        ...s.thread,
        messages: s.thread.messages.filter((m) => m.id !== tempId),
      },
    }));
  },

  setThreadLoading: (loading) => set({ threadLoading: loading }),

  /* ── Socket event handlers ── */
  handleInboxMessage: (payload) => {
    const { conversation, message } = payload || {};
    if (!conversation?.id) return;
    const state = get();
    const id = String(conversation.id);
    const isActive = state.selectedId && String(state.selectedId) === id;
    const fromUser = message?.senderRole === 'user';
    const isOwnSend = Boolean(state._myUid && message?.senderId && String(message.senderId) === String(state._myUid));

    // Update inbox row
    get().upsertRow(conversation, { fromUserMessage: !isActive && fromUser && !isOwnSend });

    // Notify staff if a customer message arrives on a thread they are not currently viewing
    if (fromUser && !isActive && !isOwnSend) {
      playNotificationSound();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('support-desk:user-message', {
          detail: {
            conversation,
            preview: message?.text || conversation.lastMessagePreview || 'New message',
            unread: Number(get().unreadById[id] || 1),
          },
        }));
      }
    }

    // If this is the active thread, append the message
    if (isActive && message?.id) {
      const prevTimer = state._typingTimeout;
      if (prevTimer) clearTimeout(prevTimer);
      set((s) => ({
        userTyping: false,
        _typingTimeout: null,
        thread: {
          conversation: mergeConvo(s.thread.conversation, conversation),
          messages: mergeMessages(s.thread.messages, [message]),
        },
      }));
    }
  },

  handleInboxUpdated: (conversation) => {
    if (!conversation?.id) return;
    get().upsertRow(conversation);

    // Update active thread conversation if it matches
    const state = get();
    if (state.selectedId && String(state.selectedId) === String(conversation.id)) {
      set((s) => ({
        thread: {
          ...s.thread,
          conversation: mergeConvo(s.thread.conversation, conversation),
        },
      }));
    }
  },

  handleRead: (conversation) => {
    if (!conversation?.id) return;
    const state = get();
    const id = String(conversation.id);
    const isActive = state.selectedId && String(state.selectedId) === id;

    get().upsertRow({
      ...conversation,
      ...(isActive ? { unreadForSupport: 0, clearUnread: true } : {}),
    });

    if (isActive) {
      set((s) => ({
        thread: {
          ...s.thread,
          conversation: mergeConvo(s.thread.conversation, conversation),
        },
      }));
    }
  },

  handleTyping: (payload) => {
    if (!payload?.conversationId) return;
    const state = get();
    const activeId = state.selectedId ? String(state.selectedId) : null;
    if (activeId && activeId === String(payload.conversationId)) {
      // Don't show typing for our own actions
      if (payload.uid && state._myUid && String(payload.uid) === String(state._myUid)) {
        return;
      }
      const isTyping = Boolean(payload.typing);
      if (state._typingTimeout) clearTimeout(state._typingTimeout);
      let timeout = null;
      if (isTyping) {
        timeout = setTimeout(() => {
          set({ userTyping: false, _typingTimeout: null });
        }, 3000);
      }
      set({ userTyping: isTyping, _typingTimeout: timeout });
    }
  },

  /* ── Unread sync from rows (sidebar badge) ── */
  syncUnreadFromRows: (rows) => {
    const state = get();
    const activeId = state.selectedId ? String(state.selectedId) : null;
    const byId = {};
    let total = 0;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row?.id) return;
      const id = String(row.id);
      if (activeId && id === activeId) return;
      if (row.clearUnread || isStaffReply(row)) return;
      const n = Number(row.unreadForSupport || 0);
      if (n > 0) {
        byId[id] = n;
        total += n;
      }
    });
    set({ unreadById: byId, unreadTotal: total });
  },

  /* ── Mark read ── */
  markThreadRead: (id) => {
    if (!id) return;
    const at = new Date().toISOString();
    set((s) => ({
      thread: s.thread.conversation?.id === id
        ? { ...s.thread, conversation: { ...s.thread.conversation, unreadForSupport: 0, supportLastReadAt: at } }
        : s.thread,
      rows: s.rows.map((r) =>
        String(r.id) === String(id)
          ? { ...r, unreadForSupport: 0, supportLastReadAt: at, clearUnread: true }
          : r,
      ),
    }));

    const byId = { ...get().unreadById };
    delete byId[id];
    const total = Object.values(byId).reduce((s2, n) => s2 + Number(n || 0), 0);
    set({ unreadById: byId, unreadTotal: total });

    // Emit via socket
    const socket = get()._socket;
    if (socket?.connected) {
      socket.emit('support:read', { conversationId: id, asStaff: true });
    }
    import('../services/supportLiveService').then(({ markSupportDeskRead }) => {
      markSupportDeskRead(id).catch(() => {});
    });
  },

  /* ── Socket rooms & typing for desk ── */
  joinConversation: (conversationId) => {
    set({ _joinedConversationId: conversationId });
    const socket = get()._socket;
    if (!conversationId || !socket?.connected) return;
    socket.emit('support:join', { conversationId });
  },

  leaveConversation: (conversationId) => {
    if (get()._joinedConversationId === conversationId) {
      set({ _joinedConversationId: null });
    }
    const socket = get()._socket;
    if (!conversationId || !socket?.connected) return;
    socket.emit('support:leave', { conversationId });
  },

  emitTyping: (conversationId, typing) => {
    const socket = get()._socket;
    if (!conversationId || !socket?.connected) return;
    socket.emit('support:typing', { conversationId, typing: Boolean(typing) });
  },

  /* ── Reset ── */
  reset: () => {
    if (get()._typingTimeout) clearTimeout(get()._typingTimeout);
    set({
      rows: [],
      inboxLoading: false,
      selectedId: null,
      thread: { conversation: null, messages: [] },
      threadLoading: false,
      unreadById: {},
      unreadTotal: 0,
      userTyping: false,
      _typingTimeout: null,
      _joinedConversationId: null,
    });
  },
}));

export default useSupportDeskStore;
