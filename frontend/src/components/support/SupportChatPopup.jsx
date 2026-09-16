import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Minus, MessageSquare, X } from 'lucide-react';
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
  const popupOpen = useSupportChatStore((s) => s.popupOpen);
  const popupMinimized = useSupportChatStore((s) => s.popupMinimized);
  const unreadForUser = useSupportChatStore((s) => s.unreadForUser);
  const staffOnline = useSupportChatStore((s) => s.staffOnline);
  const supportTyping = useSupportChatStore((s) => s.supportTyping);
  const viewingThread = useSupportChatStore((s) => s.viewingThread);
  const sendMessage = useSupportChatStore((s) => s.sendMessage);
  const emitTyping = useSupportChatStore((s) => s.emitTyping);
  const markRead = useSupportChatStore((s) => s.markRead);
  const openPopup = useSupportChatStore((s) => s.openPopup);
  const minimizePopup = useSupportChatStore((s) => s.minimizePopup);
  const closePopup = useSupportChatStore((s) => s.closePopup);
  const [input, setInput] = useState('');
  const typingTimer = useRef(null);
  const [pulse, setPulse] = useState(false);
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '');
  const onUserSupport = path === '/app/support' || path === '/app/support/email';
  const onDesk = path.startsWith('/app/support-desk');

  useEffect(() => {
    if (unreadForUser > 0 && popupMinimized) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [unreadForUser, popupMinimized]);

  if (!user || role === 'support') return null;
  if (onUserSupport || onDesk) return null;
  if (viewingThread) return null;
  if (!popupOpen && unreadForUser <= 0) return null;

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'U';
  const expanded = popupOpen && !popupMinimized;

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
    try {
      await sendMessage(text, {
        replyTo: meta.replyTo || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      markRead();
    } catch {
      /* toast handled by page if needed */
    }
  };

  const handleExpand = () => {
    openPopup();
    markRead();
  };

  return (
    <div className={classes.wrap}>
      {expanded ? (
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
      ) : (
        <button
          type="button"
          className={`${classes.bubble} ${pulse ? classes.bubblePulse : ''}`}
          onClick={handleExpand}
          aria-label="Open support chat"
        >
          <MessageSquare size={22} />
          {unreadForUser > 0 ? (
            <span className={classes.badge}>{unreadForUser > 99 ? '99+' : unreadForUser}</span>
          ) : null}
        </button>
      )}
    </div>
  );
}
