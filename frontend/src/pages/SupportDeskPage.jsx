import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeadphonesIcon, Loader2, Search } from 'lucide-react';
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

function upsertRow(rows, conversation) {
  if (!conversation?.id) return rows;
  const next = rows.filter((r) => r.id !== conversation.id);
  next.unshift(conversation);
  return next;
}

function laterIso(a, b) {
  const aMs = a ? new Date(a).getTime() : 0;
  const bMs = b ? new Date(b).getTime() : 0;
  if (!aMs && !bMs) return b || a || null;
  if (!aMs || Number.isNaN(aMs)) return b || null;
  if (!bMs || Number.isNaN(bMs)) return a || null;
  return bMs >= aMs ? b : a;
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
  const joinConversation = useSupportChatStore((s) => s.joinConversation);
  const emitTyping = useSupportChatStore((s) => s.emitTyping);
  const userTyping = useSupportChatStore((s) => s.userTyping);

  const [tab, setTab] = useState('inbox');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState({ conversation: null, messages: [] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const typingTimer = useRef(null);
  const openReq = useRef(0);
  const selectedIdRef = useRef(null);
  const refreshTimer = useRef(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const markConversationSeen = useCallback((id) => {
    if (!id) return;
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
  }, [socket]);

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
      setRows(Array.isArray(out?.rows) ? out.rows : []);
    } catch (err) {
      toast.error(err?.message || 'Could not load inbox');
    } finally {
      setInboxLoading(false);
    }
  }, [tab]);

  const openConversation = useCallback(async (id, preview) => {
    const req = ++openReq.current;
    setSelectedId(id);
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
        }));
      }
    } catch (err) {
      if (openReq.current !== req) return;
      toast.error(err?.message || 'Could not open conversation');
    } finally {
      if (openReq.current === req) setThreadLoading(false);
    }
  }, [joinConversation]);

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
      setRows((prev) => {
        const showClosed = tab === 'closed';
        if (isClosed !== showClosed) {
          return prev.filter((r) => r.id !== conversation.id);
        }
        return upsertRow(prev, conversation);
      });
      const activeId = selectedIdRef.current;
      if (String(conversation.id) !== String(activeId || '')) {
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
      if (conversation) {
        setRows((prev) => {
          const isClosed = conversation.status === 'closed';
          const showClosed = tab === 'closed';
          if (isClosed !== showClosed) {
            return prev.filter((r) => r.id !== conversation.id);
          }
          return upsertRow(prev, conversation);
        });
      }
      const activeId = selectedIdRef.current;
      if (!message?.id || !conversation?.id || String(conversation.id) !== String(activeId || '')) {
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
      if (message.senderRole === 'user') {
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
    socket.on('support:claimed', (p) => p?.conversation && onInbox(p.conversation));
    socket.on('support:closed', (p) => p?.conversation && onInbox(p.conversation));
    return () => {
      window.clearTimeout(refreshTimer.current);
      socket.off('connect', onConnect);
      socket.off('support:inbox:updated', onInbox);
      socket.off('support:message:new', onMessage);
      socket.off('support:read', onRead);
      socket.off('support:claimed');
      socket.off('support:closed');
    };
  }, [socket, tab, joinConversation, markConversationSeen, refreshActiveThread]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => (
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
            ) : filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`${classes.row} ${selectedId === row.id ? classes.rowActive : ''}`}
                onClick={() => openConversation(row.id, row)}
                disabled={threadLoading && selectedId === row.id}
              >
                <span className={classes.rowAvatar}>{rowInitial(row)}</span>
                <span className={classes.rowBody}>
                  <span className={classes.rowTop}>
                    <span className={classes.rowName}>{row.userName || row.userEmail || row.userId}</span>
                    <span className={classes.rowTime}>{relativeTime(row.lastMessageAt)}</span>
                  </span>
                  <span className={classes.rowPreview}>{row.lastMessagePreview || 'No messages yet'}</span>
                </span>
                {Number(row.unreadForSupport) > 0 ? <span className={classes.unread} /> : null}
              </button>
            ))}
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
    </motion.div>
  );
};

export default SupportDeskPage;
