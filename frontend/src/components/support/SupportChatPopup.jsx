import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Minus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import useSupportChatStore from '../../store/useSupportChatStore';
import SupportThread from './SupportThread';
import classes from './SupportChatPopup.module.css';
import { browserTimeZone } from '../../utils/chatDaySeparators';

export default function SupportChatPopup() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const conversation = useSupportChatStore((s) => s.conversation);
  const messages = useSupportChatStore((s) => s.messages);
  const loading = useSupportChatStore((s) => s.loading);
  const popupOpen = useSupportChatStore((s) => s.popupOpen);
  const popupMinimized = useSupportChatStore((s) => s.popupMinimized);
  const staffOnline = useSupportChatStore((s) => s.staffOnline);
  const supportTyping = useSupportChatStore((s) => s.supportTyping);
  const viewingThread = useSupportChatStore((s) => s.viewingThread);
  const emitTyping = useSupportChatStore((s) => s.emitTyping);
  const markRead = useSupportChatStore((s) => s.markRead);
  const prepareUserChat = useSupportChatStore((s) => s.prepareUserChat);
  const minimizePopup = useSupportChatStore((s) => s.minimizePopup);
  const closePopup = useSupportChatStore((s) => s.closePopup);
  const [input, setInput] = useState('');
  const typingTimer = useRef(null);
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '');
  const onUserSupport = path === '/app/support' || path === '/app/support/email';
  const onDesk = path.startsWith('/app/support-desk');
  const expanded = popupOpen && !popupMinimized;

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  useEffect(() => {
    if (!expanded || !user?.uid || role === 'support') return undefined;
    let cancelled = false;
    prepareUserChat()
      .then(() => {
        if (!cancelled) markRead();
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Could not load support chat.');
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, user?.uid, role, prepareUserChat, markRead]);

  if (!user || role === 'support') return null;
  if (onUserSupport || onDesk) return null;
  if (viewingThread) return null;
  if (!expanded) return null;

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'U';

  const handleInputChange = (value) => {
    setInput(value);
    if (!conversation?.id) return;
    emitTyping(conversation.id, true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(conversation.id, false), 1200);
  };

  const handleSend = async (meta = {}) => {
    const text = String(meta.text ?? input).trim();
    const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
    if (!text && !attachments.length) return;
    setInput('');
    const store = useSupportChatStore.getState();
    store.emitTyping(store.conversation?.id, false);
    try {
      if (!store.conversation?.id) await store.prepareUserChat();
      await store.sendMessage(text, {
        replyTo: meta.replyTo || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      store.markRead();
    } catch (err) {
      toast.error(err?.message || 'Could not send message.');
    }
  };

  return (
    <div className={classes.wrap}>
      <div className={`glass ${classes.panel}`}>
        <SupportThread
          compact
          messages={messages}
          input={input}
          onInputChange={handleInputChange}
          onSend={handleSend}
          typing={supportTyping}
          online={staffOnline}
          userInitial={userInitial}
          title="Support"
          timeZone={conversation?.userTimeZone || browserTimeZone()}
          selfId={user?.uid}
          conversationId={conversation?.id || user?.uid}
          peerLastReadAt={conversation?.supportLastReadAt || null}
          loading={loading && messages.length === 0}
          headerActions={(
            <>
              <button type="button" className={classes.iconBtn} onClick={minimizePopup} aria-label="Minimize chat">
                <Minus size={16} />
              </button>
              <button type="button" className={classes.iconBtn} onClick={closePopup} aria-label="Close chat">
                <X size={16} />
              </button>
            </>
          )}
        />
      </div>
    </div>
  );
}
