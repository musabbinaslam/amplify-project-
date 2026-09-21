import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeadphonesIcon, Loader2, MessageSquarePlus, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useSupportChatStore from '../store/useSupportChatStore';
import SupportThread from '../components/support/SupportThread';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import {
  listSupportDeskConversations,
  getSupportDeskMessages,
  postSupportDeskMessage,
  closeSupportConversation,
  markSupportDeskRead,
  searchSupportDeskUsers,
  startSupportDeskOutbound,
} from '../services/supportLiveService';
import classes from './SupportDeskPage.module.css';

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const delta = Date.now() - then;
  const m = Math.round(delta / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function rowInitial(row) {
  const label = row?.userName || row?.userEmail || row?.userId || '?';
  return String(label).charAt(0).toUpperCase();
}

function laterIso(a, b) {
  const aMs = a ? new Date(a).getTime() : 0;
  const bMs = b ? new Date(b).getTime() : 0;
  if (!aMs && !bMs) return b || a || null;
  if (!aMs || Number.isNaN(aMs)) return b || null;
  if (!bMs || Number.isNaN(bMs)) return a || null;
  return bMs >= aMs ? b : a;
}

/** WhatsApp-style: unread if last activity is newer than staff last-read (or never read). */
function deskUnreadCount(row, selectedId) {
  if (!row?.id) return 0;
  if (selectedId && String(selectedId) === String(row.id)) return 0;
  const explicit = Number(row.unreadForSupport || 0);
  if (explicit > 0) return explicit;
  const hasMessage = Boolean(row.lastMessagePreview) || Number(row.messageCount || 0) > 0;
  if (!hasMessage) return 0;
  const lastMs = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : 0;
  if (!lastMs || Number.isNaN(lastMs)) return 0;
  const readMs = row.supportLastReadAt ? new Date(row.supportLastReadAt).getTime() : 0;
  if (!readMs || Number.isNaN(readMs) || lastMs > readMs) return 1;
  return 0;
}

/** Keep unread counts from being wiped by stale inbox socket payloads. */
function mergeInboxConversation(prev, next, { fromUserMessage = false } = {}) {
  if (!next) return prev || null;
  if (!prev) {
    const unread = fromUserMessage
      ? Math.max(Number(next.unreadForSupport || 0), 1)
      : Number(next.unreadForSupport || 0);
    return {
      ...next,
      unreadForSupport: unread,
      lastSenderRole: fromUserMessage ? 'user' : next.lastSenderRole,
    };
  }
  const prevUnread = Number(prev.unreadForSupport || 0);
  let nextUnread = Number(next.unreadForSupport || 0);
  const prevReadMs = prev.supportLastReadAt ? new Date(prev.supportLastReadAt).getTime() : 0;
  const nextReadMs = next.supportLastReadAt ? new Date(next.supportLastReadAt).getTime() : 0;
  const readAdvanced = nextReadMs > prevReadMs;
  const staffReply = next.lastSenderRole === 'support' || next.lastSenderRole === 'admin';
  if (fromUserMessage) {
    nextUnread = Math.max(nextUnread, prevUnread + 1, 1);
  } else if (staffReply || readAdvanced) {
    nextUnread = Number(next.unreadForSupport || 0);
  } else if (nextUnread < prevUnread) {
    nextUnread = prevUnread;
  } else if (next.lastSenderRole === 'user' && nextUnread <= 0) {
    nextUnread = Math.max(prevUnread, 1);
  }
  return {
    ...prev,
    ...next,
    lastSenderRole: fromUserMessage ? 'user' : (next.lastSenderRole || prev.lastSenderRole),
    unreadForSupport: nextUnread,
    userLastReadAt: laterIso(prev.userLastReadAt, next.userLastReadAt),
    supportLastReadAt: laterIso(prev.supportLastReadAt, next.supportLastReadAt),
  };
}

function getConversationTimestampMs(row) {
  if (!row) return 0;
  const val = row.lastMessageAt || row.updatedAt || row.createdAt;
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function sortConversationsByLatest(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = getConversationTimestampMs(b) - getConversationTimestampMs(a);
    if (diff !== 0) return diff;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

function upsertRow(rows, conversation, options = {}) {
  if (!conversation?.id) return rows;
  const hasContent = Number(conversation.messageCount || 0) > 0 || Boolean(conversation.lastMessagePreview);
  if (!hasContent) {
    return rows.filter((r) => r.id !== conversation.id);
  }
  const prev = rows.find((r) => r.id === conversation.id);
  const merged = mergeInboxConversation(prev, conversation, options);
  const next = rows.filter((r) => r.id !== conversation.id);
  next.push(merged);
  return sortConversationsByLatest(next);
}

function mergeConversation(prev, next) {
  if (!next) return prev || null;
  if (!prev) return next;
  return {
    ...prev,
    ...next,
    userLastReadAt: laterIso(prev.userLastReadAt, next.userLastReadAt),
    supportLastReadAt: laterIso(prev.supportLastReadAt, next.supportLastReadAt),
  };
}

function sortMessages(messages = []) {
  return [...messages].sort((a, b) => (
    String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''))
    || String(a?.id || '').localeCompare(String(b?.id || ''))
  ));
}

function mergeMessages(existing = [], incoming = []) {
  const byId = new Map();
  const list = [];
  existing.forEach((msg) => {
    if (!msg?.id) return;
    byId.set(msg.id, msg);
    list.push(msg);
  });
  incoming.forEach((msg) => {
    if (!msg?.id) return;
    if (byId.has(msg.id)) {
      const prev = byId.get(msg.id);
      const merged = {
        ...prev,
        ...msg,
        replyTo: msg.replyTo ?? prev.replyTo ?? null,
        attachments: msg.attachments?.length ? msg.attachments : prev.attachments,
      };
      byId.set(msg.id, merged);
      const idx = list.findIndex((m) => m.id === msg.id);
      if (idx >= 0) list[idx] = merged;
      return;
    }
    const tempIdx = list.findIndex((m) => (
      String(m.id).startsWith('tmp-')
      && m.text === msg.text
      && (m.senderRole || '') === (msg.senderRole || '')
    ));
    if (tempIdx >= 0) {
      const prev = list[tempIdx];
      byId.delete(prev.id);
      const merged = {
        ...msg,
        replyTo: msg.replyTo ?? prev.replyTo ?? null,
        attachments: msg.attachments?.length ? msg.attachments : prev.attachments,
      };
      byId.set(msg.id, merged);
      list[tempIdx] = merged;
      return;
    }
    byId.set(msg.id, msg);
    list.push(msg);
  });
  return sortMessages(list);
}

function threadIsBehind(conversation, messages = []) {
  if (!conversation?.id) return false;
  const previewAt = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
  if (!previewAt || Number.isNaN(previewAt)) return false;
  if (!messages.length) return Boolean(conversation.lastMessagePreview || conversation.messageCount);
  const last = messages[messages.length - 1];
  const localAt = last?.createdAt ? new Date(last.createdAt).getTime() : 0;
  if (!localAt || Number.isNaN(localAt)) return true;
  return previewAt > localAt + 250;
}

const SupportDeskPage = () => {
  const presets = useSubtlePageMotion();
  const user = useAuthStore((s) => s.user);
  const socket = useSupportChatStore((s) => s._socket);
  const deskUnreadById = useSupportChatStore((s) => s.deskUnreadById);
  const joinConversation = useSupportChatStore((s) => s.joinConversation);
  const emitTyping = useSupportChatStore((s) => s.emitTyping);
  const userTyping = useSupportChatStore((s) => s.userTyping);
  const syncDeskUnreadFromRows = useSupportChatStore((s) => s.syncDeskUnreadFromRows);
  const applyDeskInboxUpdate = useSupportChatStore((s) => s.applyDeskInboxUpdate);
  const setActiveDeskConversation = useSupportChatStore((s) => s.setActiveDeskConversation);

  const [tab, setTab] = useState('inbox');
  const [rows, setRows] = useState([]);
  const [attentionById, setAttentionById] = useState(() => ({}));
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState({ conversation: null, messages: [] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeQuery, setComposeQuery] = useState('');
  const [composeResults, setComposeResults] = useState([]);
  const [composeSearching, setComposeSearching] = useState(false);
  const [composeSelected, setComposeSelected] = useState(null);
  const [composeText, setComposeText] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const typingTimer = useRef(null);
  const openReq = useRef(0);
  const selectedIdRef = useRef(null);
  const refreshTimer = useRef(null);
  const composeSearchTimer = useRef(null);
  const myUid = user?.uid || '';

  const clearAttention = useCallback((id) => {
    if (!id) return;
    setAttentionById((prev) => {
      if (!prev[id] && !prev[String(id)]) return prev;
      const next = { ...prev };
      delete next[id];
      delete next[String(id)];
      return next;
    });
  }, []);

  const markAttention = useCallback((id, meta = {}) => {
    if (!id) return;
    if (String(id) === String(selectedIdRef.current || '')) return;
    const key = String(id);
    setAttentionById((prev) => {
      const serverCount = Math.max(Number(meta.unreadForSupport || 0), 0);
      const next = Math.max(Number(prev[key] || prev[id] || 0) + 1, serverCount, 1);
      return { ...prev, [key]: next };
    });
    // Store socket handler owns toast + deskUnreadTotal increment — don't double-count here.
  }, []);

  const rowsRef = useRef([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // HMR / stale sockets can leave desk without staff inbox handlers — force staff connect.
  useEffect(() => {
    const store = useSupportChatStore.getState();
    const tokenFn = store._getIdToken;
    if (typeof tokenFn !== 'function') return undefined;
    let cancelled = false;
    store.connect(tokenFn, { isStaffViewer: true }).catch(() => {});
    return () => { cancelled = true; void cancelled; };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    setActiveDeskConversation(selectedId || null);
  }, [selectedId, setActiveDeskConversation]);

  useEffect(() => () => {
    // Leaving Inbox must not leave a sticky "viewing" id (blocks Analytics badges).
    setActiveDeskConversation(null);
  }, [setActiveDeskConversation]);

  // Keep sidebar/bell badges in sync from row timestamps (works even when server unread=0).
  useEffect(() => {
    if (tab === 'closed') return undefined;
    const mapped = rows.map((row) => {
      const isOpen = selectedId && String(selectedId) === String(row.id);
      if (isOpen) {
        return { ...row, unreadForSupport: 0, clearUnread: true };
      }
      return {
        ...row,
        unreadForSupport: Math.max(
          Number(row.unreadForSupport || 0),
          Number(attentionById[String(row.id)] || attentionById[row.id] || 0),
          deskUnreadCount(row, selectedId),
        ),
      };
    });
    syncDeskUnreadFromRows(mapped);
    return undefined;
  }, [rows, selectedId, attentionById, tab, syncDeskUnreadFromRows]);

  const markConversationSeen = useCallback((id) => {
    if (!id) return;
    clearAttention(id);
    const at = new Date().toISOString();
    setThread((prev) => (
      prev.conversation?.id === id
        ? {
          ...prev,
          conversation: {
            ...prev.conversation,
            unreadForSupport: 0,
            supportLastReadAt: at,
          },
        }
        : prev
    ));
    setRows((prev) => prev.map((row) => (
      row.id === id ? { ...row, unreadForSupport: 0, supportLastReadAt: at } : row
    )));
    applyDeskInboxUpdate({
      id,
      unreadForSupport: 0,
      lastSenderRole: 'support',
      supportLastReadAt: at,
      clearUnread: true,
    }, { silent: true });
    if (socket?.connected) {
      socket.emit('support:read', { conversationId: id });
    } else {
      markSupportDeskRead(id).then((res) => {
        if (res?.conversation) {
          setThread((prev) => (
            prev.conversation?.id === id
              ? { ...prev, conversation: res.conversation }
              : prev
          ));
          setRows((prev) => upsertRow(prev, res.conversation));
        }
      }).catch(() => {});
    }
  }, [socket, clearAttention, applyDeskInboxUpdate]);

  const refreshActiveThread = useCallback(async (id, { markRead = false } = {}) => {
    if (!id) return;
    try {
      const out = await getSupportDeskMessages(id, { limit: 40, markRead });
      if (selectedIdRef.current !== id) return;
      setThread((prev) => {
        if (prev.conversation?.id !== id && selectedIdRef.current !== id) return prev;
        return {
          conversation: mergeConversation(prev.conversation, out.conversation),
          messages: mergeMessages(prev.messages, out.messages || []),
        };
      });
      if (out.conversation) {
        setRows((prev) => upsertRow(prev, {
          ...out.conversation,
          ...(markRead ? { unreadForSupport: 0 } : {}),
        }));
      }
    } catch {
      /* ignore background refresh errors */
    }
  }, []);

  const loadQueue = useCallback(async (nextTab = tab) => {
    setInboxLoading(true);
    try {
      const out = await listSupportDeskConversations({
        status: nextTab === 'closed' ? 'closed' : 'inbox',
      });
      const nextRows = sortConversationsByLatest(Array.isArray(out?.rows) ? out.rows : []);
      setRows(nextRows);
      if (nextTab !== 'closed') {
        const activeId = selectedIdRef.current ? String(selectedIdRef.current) : null;
        const forSync = nextRows.map((row) => (
          activeId && String(row.id) === activeId
            ? { ...row, unreadForSupport: 0, clearUnread: true }
            : row
        ));
        syncDeskUnreadFromRows(forSync);
        setAttentionById((prev) => {
          const next = { ...prev };
          if (activeId) {
            delete next[activeId];
            delete next[selectedIdRef.current];
          }
          nextRows.forEach((row) => {
            if (activeId && String(row.id) === activeId) return;
            const n = Number(row?.unreadForSupport || 0);
            if (row?.id && n > 0) next[row.id] = Math.max(Number(next[row.id] || 0), n);
          });
          return next;
        });
      }
    } catch (err) {
      toast.error(err?.message || 'Could not load inbox');
    } finally {
      setInboxLoading(false);
    }
  }, [tab, syncDeskUnreadFromRows]);

  const openConversation = useCallback(async (id, preview) => {
    const req = ++openReq.current;
    // Clear badges immediately (before the selectedId effect) so refresh/socket
    // cannot re-inflate unread while the thread is opening.
    setActiveDeskConversation(id);
    setSelectedId(id);
    clearAttention(id);
    const at = new Date().toISOString();
    setRows((prev) => prev.map((row) => (
      String(row.id) === String(id)
        ? { ...row, unreadForSupport: 0, supportLastReadAt: at }
        : row
    )));
    applyDeskInboxUpdate({
      id,
      unreadForSupport: 0,
      lastSenderRole: 'support',
      supportLastReadAt: at,
      lastMessageAt: preview?.lastMessageAt,
      lastMessagePreview: preview?.lastMessagePreview,
      clearUnread: true,
    }, { silent: true });
    setThreadLoading(true);
    setThread((prev) => ({
      conversation: preview || prev.conversation || { id },
      messages: prev.conversation?.id === id ? prev.messages : [],
    }));
    joinConversation(id);
    import('../services/supportLiveService').then(({ warmSupportMediaToken }) => {
      warmSupportMediaToken();
    }).catch(() => {});
    try {
      // Load + mark read in one round-trip.
      const out = await getSupportDeskMessages(id, { limit: 40, markRead: true });
      if (openReq.current !== req) return;
      setThread((prev) => ({
        conversation: out.conversation || prev.conversation || { id },
        messages: mergeMessages(prev.conversation?.id === id ? prev.messages : [], out.messages || []),
      }));
      if (out.conversation) {
        setRows((prev) => upsertRow(prev, {
          ...out.conversation,
          unreadForSupport: 0,
          supportLastReadAt: out.conversation.supportLastReadAt || at,
        }));
        applyDeskInboxUpdate({
          ...out.conversation,
          unreadForSupport: 0,
          supportLastReadAt: out.conversation.supportLastReadAt || at,
          clearUnread: true,
        }, { silent: true });
      }
    } catch (err) {
      if (openReq.current !== req) return;
      toast.error(err?.message || 'Could not open conversation');
    } finally {
      if (openReq.current === req) setThreadLoading(false);
    }
  }, [joinConversation, clearAttention, applyDeskInboxUpdate, setActiveDeskConversation]);

  useEffect(() => {
    loadQueue('inbox');
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const scheduleRefresh = (id) => {
      if (!id) return;
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        refreshActiveThread(id, { markRead: true });
      }, 350);
    };
    const onInbox = (conversation) => {
      if (!conversation?.id) return;
      const isClosed = conversation.status === 'closed';
      const activeId = selectedIdRef.current;
      const isActive = String(conversation.id) === String(activeId || '');
      const prevRow = rowsRef.current.find((r) => String(r.id) === String(conversation.id));
      const messageAdvanced = Boolean(
        conversation.lastMessageAt
        && conversation.lastMessageAt !== prevRow?.lastMessageAt
      );
      // Shared inbox cue: refresh row; counting/toast happen on support:message:new.
      const bumpUnread = !isActive && messageAdvanced;
      setRows((prev) => {
        const showClosed = tab === 'closed';
        if (isClosed !== showClosed) {
          return prev.filter((r) => r.id !== conversation.id);
        }
        const storeCount = Number(
          useSupportChatStore.getState().deskUnreadById?.[conversation.id] || 0,
        );
        return upsertRow(prev, {
          ...conversation,
          unreadForSupport: bumpUnread
            ? Math.max(Number(conversation.unreadForSupport || 0), storeCount, 1)
            : conversation.unreadForSupport,
        }, { fromUserMessage: false });
      });
      applyDeskInboxUpdate(conversation, { silent: true });
      if (!isActive) {
        setThread((prev) => (
          prev.conversation?.id === conversation.id
            ? { ...prev, conversation: mergeConversation(prev.conversation, conversation) }
            : prev
        ));
        return;
      }
      setThread((prev) => {
        const next = {
          ...prev,
          conversation: mergeConversation(prev.conversation, conversation),
        };
        if (threadIsBehind(conversation, prev.messages)) {
          scheduleRefresh(conversation.id);
        }
        return next;
      });
    };
    const onMessage = (payload = {}) => {
      const { conversation, message } = payload;
      const activeId = selectedIdRef.current;
      const isActive = Boolean(
        conversation?.id && String(conversation.id) === String(activeId || ''),
      );
      const senderId = message?.senderId ? String(message.senderId) : '';
      const isOwnStaffSend = Boolean(myUid && senderId && senderId === String(myUid));
      // Any message on a thread you are not viewing = attention (shared inbox).
      const bumpUnread = Boolean(conversation?.id && !isActive && message?.id);
      if (conversation) {
        if (bumpUnread) {
          markAttention(conversation.id, {
            unreadForSupport: conversation.unreadForSupport,
          });
        }
        setRows((prev) => {
          const isClosed = conversation.status === 'closed';
          const showClosed = tab === 'closed';
          if (isClosed !== showClosed) {
            return prev.filter((r) => r.id !== conversation.id);
          }
          const prevRow = prev.find((r) => String(r.id) === String(conversation.id));
          const prevUnread = Number(prevRow?.unreadForSupport || 0);
          const storeCount = Number(
            useSupportChatStore.getState().deskUnreadById?.[conversation.id] || 0,
          );
          const serverCount = Number(conversation.unreadForSupport || 0);
          return upsertRow(prev, {
            ...conversation,
            lastSenderRole: bumpUnread
              ? (message?.senderRole || conversation.lastSenderRole || 'user')
              : conversation.lastSenderRole,
            unreadForSupport: bumpUnread
              ? Math.max(serverCount, storeCount, prevUnread + 1, 1)
              : conversation.unreadForSupport,
          }, { fromUserMessage: false });
        });
        // Increment is handled once in the store message:new handler.
        applyDeskInboxUpdate(conversation, { silent: true });
      }
      if (!message?.id || !conversation?.id || !isActive) {
        if (conversation?.id) {
          setThread((prev) => (
            prev.conversation?.id === conversation.id
              ? { ...prev, conversation: mergeConversation(prev.conversation, conversation) }
              : prev
          ));
        }
        return;
      }
      setThread((prev) => ({
        conversation: mergeConversation(prev.conversation, conversation),
        messages: mergeMessages(prev.messages, [message]),
      }));
      if (!isOwnStaffSend) {
        markConversationSeen(activeId);
      }
    };
    const onRead = (payload = {}) => {
      const conversation = payload?.conversation || payload;
      if (!conversation?.id) return;
      setRows((prev) => upsertRow(prev, mergeConversation(
        prev.find((r) => r.id === conversation.id),
        conversation,
      )));
      setThread((prev) => (
        prev.conversation?.id === conversation.id
          ? { ...prev, conversation: mergeConversation(prev.conversation, conversation) }
          : prev
      ));
    };
    const onConnect = () => {
      const id = selectedIdRef.current;
      if (id) joinConversation(id);
    };
    socket.on('connect', onConnect);
    socket.on('support:inbox:updated', onInbox);
    socket.on('support:message:new', onMessage);
    socket.on('support:read', onRead);
    const onClaimed = (p) => p?.conversation && onInbox(p.conversation);
    const onClosed = (p) => p?.conversation && onInbox(p.conversation);
    socket.on('support:claimed', onClaimed);
    socket.on('support:closed', onClosed);
    return () => {
      window.clearTimeout(refreshTimer.current);
      socket.off('connect', onConnect);
      socket.off('support:inbox:updated', onInbox);
      socket.off('support:message:new', onMessage);
      socket.off('support:read', onRead);
      socket.off('support:claimed', onClaimed);
      socket.off('support:closed', onClosed);
    };
  }, [socket, tab, joinConversation, markConversationSeen, refreshActiveThread, applyDeskInboxUpdate, markAttention, myUid]);

  const filtered = useMemo(() => {
    const validRows = rows.filter(
      (row) => Number(row.messageCount || 0) > 0 || Boolean(row.lastMessagePreview),
    );
    const sorted = sortConversationsByLatest(validRows);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((row) => (
      [row.userName, row.userEmail, row.lastMessagePreview, row.id]
        .some((v) => String(v || '').toLowerCase().includes(q))
    ));
  }, [rows, search]);

  const handleTab = (next) => {
    setTab(next);
    loadQueue(next);
  };

  const handleSend = async (meta = {}) => {
    const text = String(meta.text ?? input).trim();
    const id = thread.conversation?.id || selectedId;
    const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
    const replyTo = meta.replyTo || null;
    if ((!text && !attachments.length) || !id) return;
    setInput('');
    const tempId = `tmp-${Date.now()}`;
    const preview = text
      || (attachments[0]?.kind === 'audio' ? 'Voice message' : '')
      || (attachments[0]?.kind === 'image' ? 'Photo' : '')
      || attachments[0]?.name
      || 'Attachment';
    const optimistic = {
      id: tempId,
      senderId: user?.uid,
      senderRole: user?.role === 'admin' ? 'admin' : 'support',
      text,
      createdAt: new Date().toISOString(),
      conversationId: id,
      type: attachments.length
        ? (attachments.every((m) => m.kind === 'audio') && !text ? 'audio'
          : attachments.every((m) => m.kind === 'image') ? 'image'
            : 'file')
        : 'text',
      ...(replyTo ? { replyTo } : {}),
      ...(attachments.length ? { attachments } : {}),
    };
    setThread((prev) => ({
      conversation: prev.conversation
        ? { ...prev.conversation, lastMessagePreview: preview, lastMessageAt: optimistic.createdAt, status: 'open' }
        : prev.conversation,
      messages: [...prev.messages, optimistic],
    }));
    setRows((prev) => upsertRow(prev, {
      ...(thread.conversation || { id }),
      lastMessagePreview: preview,
      lastMessageAt: optimistic.createdAt,
      status: 'open',
    }));

    const applyResult = (out) => {
      if (!out?.message) return;
      setThread((prev) => ({
        conversation: mergeConversation(prev.conversation, out.conversation),
        messages: mergeMessages(
          prev.messages.filter((m) => m.id !== tempId && m.id !== out.message.id),
          [{
            ...out.message,
            replyTo: out.message?.replyTo || replyTo || null,
            attachments: out.message?.attachments?.length ? out.message.attachments : attachments,
          }],
        ),
      }));
      if (out.conversation) setRows((prev) => upsertRow(prev, out.conversation));
    };

    if (socket?.connected) {
      socket.emit(
        'support:message',
        {
          conversationId: id,
          text,
          ...(replyTo ? { replyTo } : {}),
          ...(attachments.length ? { attachments } : {}),
        },
        (res) => {
          if (!res?.ok) {
            setThread((prev) => ({ ...prev, messages: prev.messages.filter((m) => m.id !== tempId) }));
            toast.error(res?.error || 'Could not send');
            return;
          }
          applyResult(res);
        }
      );
      return;
    }

    try {
      const out = await postSupportDeskMessage(id, text, {
        replyTo,
        attachments,
      });
      applyResult(out);
    } catch (err) {
      setThread((prev) => ({ ...prev, messages: prev.messages.filter((m) => m.id !== tempId) }));
      toast.error(err?.message || 'Could not send');
    }
  };

  const handleClose = async () => {
    const id = thread.conversation?.id;
    if (!id) return;
    setBusy(true);
    try {
      const out = await closeSupportConversation(id);
      setThread((prev) => ({ ...prev, conversation: out.conversation || prev.conversation }));
      loadQueue(tab);
    } catch (err) {
      toast.error(err?.message || 'Could not close');
    } finally {
      setBusy(false);
    }
  };

  const handleInputChange = (value) => {
    setInput(value);
    const id = thread.conversation?.id;
    if (!id) return;
    emitTyping(id, true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(id, false), 1200);
  };

  const openCompose = () => {
    setComposeOpen(true);
    setComposeQuery('');
    setComposeResults([]);
    setComposeSelected(null);
    setComposeText('');
  };

  const closeCompose = () => {
    if (composeSending) return;
    setComposeOpen(false);
    setComposeQuery('');
    setComposeResults([]);
    setComposeSelected(null);
    setComposeText('');
  };

  useEffect(() => {
    if (!composeOpen) return undefined;
    const q = composeQuery.trim();
    if (q.length < 2) {
      setComposeResults([]);
      setComposeSearching(false);
      return undefined;
    }
    setComposeSearching(true);
    window.clearTimeout(composeSearchTimer.current);
    composeSearchTimer.current = window.setTimeout(async () => {
      try {
        const out = await searchSupportDeskUsers({ q, limit: 20 });
        setComposeResults(Array.isArray(out?.users) ? out.users : []);
      } catch (err) {
        toast.error(err?.message || 'Search failed');
        setComposeResults([]);
      } finally {
        setComposeSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(composeSearchTimer.current);
  }, [composeQuery, composeOpen]);

  const handleOutboundSend = async () => {
    if (!composeSelected?.id) {
      toast.error('Pick a user first');
      return;
    }
    const text = composeText.trim();
    if (!text) {
      toast.error('Enter a message');
      return;
    }
    setComposeSending(true);
    try {
      const out = await startSupportDeskOutbound({
        userId: composeSelected.id,
        text,
      });
      const conversation = out?.conversation;
      if (conversation) {
        setTab('inbox');
        setRows((prev) => upsertRow(prev, conversation, { fromUserMessage: false }));
        applyDeskInboxUpdate(conversation, { silent: true });
        await openConversation(conversation.id, conversation);
      }
      toast.success('Message sent');
      setComposeOpen(false);
      setComposeQuery('');
      setComposeResults([]);
      setComposeSelected(null);
      setComposeText('');
    } catch (err) {
      toast.error(err?.message || 'Could not send');
    } finally {
      setComposeSending(false);
    }
  };

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'S';
  const convo = thread.conversation;

  return (
    <motion.div className={classes.page} variants={presets.root} initial="hidden" animate="visible">
      <motion.div className={classes.shell} variants={presets.child}>
        <aside className={classes.inbox}>
          <div className={classes.inboxHead}>
            <div className={classes.inboxTitleRow}>
              <HeadphonesIcon size={16} />
              <h2>Inbox</h2>
              <button
                type="button"
                className={classes.messageUserBtn}
                onClick={openCompose}
                title="Message a user"
              >
                <MessageSquarePlus size={15} />
                <span>Message</span>
              </button>
            </div>
          </div>

          <div className={classes.tabs} role="tablist">
            {['inbox', 'closed'].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`${classes.tab} ${tab === id ? classes.tabActive : ''}`}
                onClick={() => handleTab(id)}
              >
                {id}
              </button>
            ))}
          </div>

          <label className={classes.searchWrap}>
            <Search size={14} />
            <input
              className={classes.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
            />
          </label>

          <div className={classes.list}>
            {inboxLoading ? (
              <div className={classes.listLoading} aria-busy="true" aria-label="Loading inbox">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={classes.rowSkeleton}>
                    <span className={classes.skelAvatar} />
                    <span className={classes.skelBody}>
                      <span className={classes.skelLine} />
                      <span className={`${classes.skelLine} ${classes.skelLineShort}`} />
                    </span>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className={classes.emptyList}>No conversations yet.</p>
            ) : filtered.map((row) => {
              const rowKey = String(row.id);
              const isSelected = selectedId && String(selectedId) === String(row.id);
              const attention = Number(attentionById[rowKey] || attentionById[row.id] || 0);
              const storeUnread = Number(deskUnreadById?.[row.id] || deskUnreadById?.[rowKey] || 0);
              const unreadCount = isSelected
                ? 0
                : Math.max(
                  attention,
                  storeUnread,
                  Number(row.unreadForSupport || 0),
                  deskUnreadCount(row, selectedId),
                );
              const unread = unreadCount > 0;
              return (
              <button
                key={row.id}
                type="button"
                className={`${classes.row} ${selectedId === row.id ? classes.rowActive : ''} ${unread ? classes.rowUnread : ''}`}
                onClick={() => openConversation(row.id, row)}
                disabled={threadLoading && selectedId === row.id}
              >
                <span className={classes.rowAvatar}>{rowInitial(row)}</span>
                <span className={classes.rowBody}>
                  <span className={classes.rowTop}>
                    <span className={classes.rowName}>{row.userName || row.userEmail || row.userId}</span>
                    <span className={`${classes.rowTime} ${unread ? classes.rowTimeUnread : ''}`}>
                      {relativeTime(row.lastMessageAt)}
                    </span>
                  </span>
                  <span className={classes.rowPreview}>{row.lastMessagePreview || 'No messages yet'}</span>
                </span>
                {unread ? (
                  <span className={classes.unreadBadge} aria-label={`${unreadCount} unread`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>
              );
            })}
          </div>
        </aside>

        <section className={classes.chatPane}>
          {convo ? (
            <>
              <div className={classes.chatMeta}>
                <div className={classes.chatMetaLeft}>
                  <span className={classes.chatAvatar}>
                    {(convo.userName || convo.userEmail || 'U').charAt(0).toUpperCase()}
                  </span>
                  <div className={classes.chatMetaText}>
                    <p className={classes.chatName}>{convo.userName || convo.userEmail || 'Conversation'}</p>
                    <p className={classes.chatSub}>
                      <span
                        className={`${classes.liveDot} ${convo.status === 'closed' ? '' : classes.liveDotOn}`}
                        aria-hidden="true"
                      />
                      <span className={classes.chatStatus}>
                        {convo.status === 'closed' ? 'Closed' : 'Live chat'}
                      </span>
                      {convo.userEmail ? (
                        <span className={classes.chatEmail}>{convo.userEmail}</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className={classes.chatActions}>
                  {threadLoading ? (
                    <span className={classes.threadSpinner} aria-label="Loading conversation">
                      <Loader2 size={16} className={classes.spin} />
                    </span>
                  ) : null}
                  {convo.status !== 'closed' ? (
                    <button type="button" className={classes.closeBtn} onClick={handleClose} disabled={busy || threadLoading}>
                      {busy ? 'Closing…' : 'Close'}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className={classes.threadWrap}>
                <SupportThread
                  desk
                  compact
                  alignRole="support"
                  messages={thread.messages}
                  input={input}
                  onInputChange={handleInputChange}
                  onSend={handleSend}
                  typing={userTyping}
                  online
                  loading={threadLoading}
                  userInitial={userInitial}
                  title={convo.userName || convo.userEmail || 'Conversation'}
                  otherInitial={(convo.userName || convo.userEmail || 'U').charAt(0).toUpperCase()}
                  emptyHint="Anyone on support can reply — the user sees Admin or Support agent."
                  disabled={busy || threadLoading || convo.status === 'closed'}
                  hideHeader
                  timeZone={thread.conversation?.userTimeZone || convo.userTimeZone}
                  selfId={user?.uid}
                  conversationId={convo.id}
                  peerLastReadAt={thread.conversation?.userLastReadAt || convo.userLastReadAt || null}
                />
              </div>
            </>
          ) : (
            <div className={classes.emptyChat}>
              <div className={classes.emptyIcon}><HeadphonesIcon size={28} /></div>
              <p className={classes.emptyTitle}>Pick a conversation</p>
              <p className={classes.emptyCopy}>
                Shared inbox — admin and support can both reply live.
              </p>
            </div>
          )}
        </section>
      </motion.div>

      {composeOpen ? (
        <div className={classes.composeOverlay} role="presentation" onClick={closeCompose}>
          <div
            className={classes.composeModal}
            role="dialog"
            aria-modal="true"
            aria-label="Message a user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={classes.composeHeader}>
              <div className={classes.composeHeaderText}>
                <span className={classes.composeBadge}>
                  <MessageSquarePlus size={13} />
                  Outbound
                </span>
                <h3 className={classes.composeTitle}>Message a user</h3>
                <p className={classes.composeSub}>
                  {composeSelected
                    ? 'Write your message and send it to their support inbox.'
                    : 'Search anyone on the platform, then send the first message.'}
                </p>
              </div>
              <button type="button" className={classes.composeClose} onClick={closeCompose} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className={classes.composeSteps} aria-hidden="true">
              <span className={`${classes.composeStep} ${!composeSelected ? classes.composeStepActive : classes.composeStepDone}`}>
                1. Pick user
              </span>
              <span className={classes.composeStepDivider} />
              <span className={`${classes.composeStep} ${composeSelected ? classes.composeStepActive : ''}`}>
                2. Write message
              </span>
            </div>

            {!composeSelected ? (
              <div className={classes.composePanel}>
                <div className={classes.composeSearchWrap}>
                  <Search size={15} aria-hidden="true" />
                  <input
                    className={classes.composeSearch}
                    value={composeQuery}
                    onChange={(e) => setComposeQuery(e.target.value)}
                    placeholder="Name or email…"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {composeSearching ? <Loader2 size={14} className={classes.spin} /> : null}
                </div>

                <div className={classes.composeResults}>
                  {composeQuery.trim().length < 2 ? (
                    <div className={classes.composeEmpty}>
                      <Search size={18} />
                      <p>Type at least 2 characters to search</p>
                    </div>
                  ) : composeSearching ? (
                    <div className={classes.composeEmpty}>
                      <Loader2 size={18} className={classes.spin} />
                      <p>Searching users…</p>
                    </div>
                  ) : composeResults.length === 0 ? (
                    <div className={classes.composeEmpty}>
                      <p>No users match “{composeQuery.trim()}”</p>
                    </div>
                  ) : (
                    composeResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className={classes.composeResult}
                        onClick={() => {
                          setComposeSelected(u);
                          setComposeQuery('');
                          setComposeResults([]);
                        }}
                      >
                        <span className={classes.composeAvatar}>
                          {String(u.name || u.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className={classes.composeResultBody}>
                          <span className={classes.composeResultName}>{u.name || u.id}</span>
                          {u.email ? <span className={classes.composeResultEmail}>{u.email}</span> : null}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className={classes.composePanel}>
                <div className={classes.composeRecipient}>
                  <span className={classes.composeAvatar}>
                    {String(composeSelected.name || composeSelected.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className={classes.composeResultBody}>
                    <span className={classes.composeRecipientLabel}>To</span>
                    <span className={classes.composeResultName}>
                      {composeSelected.name || composeSelected.id}
                    </span>
                    {composeSelected.email ? (
                      <span className={classes.composeResultEmail}>{composeSelected.email}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className={classes.composeChangeBtn}
                    onClick={() => {
                      setComposeSelected(null);
                      setComposeText('');
                    }}
                    disabled={composeSending}
                  >
                    Change
                  </button>
                </div>

                <textarea
                  className={classes.composeTextarea}
                  value={composeText}
                  onChange={(e) => setComposeText(e.target.value)}
                  placeholder="Hi — reaching out from support…"
                  rows={5}
                  disabled={composeSending}
                  autoFocus
                />
              </div>
            )}

            <div className={classes.composeActions}>
              <button type="button" className={classes.composeCancel} onClick={closeCompose} disabled={composeSending}>
                Cancel
              </button>
              <button
                type="button"
                className={classes.composeSend}
                onClick={handleOutboundSend}
                disabled={composeSending || !composeSelected || !composeText.trim()}
              >
                {composeSending ? <Loader2 size={14} className={classes.spin} /> : null}
                {composeSending ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
};

export default SupportDeskPage;
