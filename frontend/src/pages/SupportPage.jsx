import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Mail,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useSupportChatStore from '../store/useSupportChatStore';
import {
  sendSupportEmail,
  validateAttachments,
  SUPPORT_ATTACHMENT_LIMITS,
} from '../services/supportService';
import SupportThread from '../components/support/SupportThread';
import { motion } from 'framer-motion';
import CustomSelect from '../components/ui/CustomSelect';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { browserTimeZone } from '../utils/chatDaySeparators';
import classes from './SupportPage.module.css';

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const CATEGORIES = ['Billing', 'Technical', 'Account', 'Other'];

const SupportPage = () => {
  const presets = useSubtlePageMotion();
  const location = useLocation();
  const isEmail = /\/support\/email\/?$/.test(location.pathname);
  const user = useAuthStore((s) => s.user);
  const getIdToken = useAuthStore((s) => s.getIdToken);
  const conversation = useSupportChatStore((s) => s.conversation);
  const messages = useSupportChatStore((s) => s.messages);
  const loading = useSupportChatStore((s) => s.loading);
  const staffOnline = useSupportChatStore((s) => s.staffOnline);
  const supportTyping = useSupportChatStore((s) => s.supportTyping);
  const loadMine = useSupportChatStore((s) => s.loadMine);
  const emitTyping = useSupportChatStore((s) => s.emitTyping);
  const markRead = useSupportChatStore((s) => s.markRead);
  const setViewingThread = useSupportChatStore((s) => s.setViewingThread);

  const [input, setInput] = useState('');
  const typingTimer = useRef(null);

  const [emailSubject, setEmailSubject] = useState('');
  const [emailCategory, setEmailCategory] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  const canSendEmail =
    emailSubject.trim().length > 0 &&
    emailCategory.trim().length > 0 &&
    emailBody.trim().length > 0 &&
    !emailSending;

  useEffect(() => {
    setViewingThread(!isEmail);
    loadMine()
      .then(() => {
        if (!isEmail) markRead();
      })
      .catch((err) => {
        if (!isEmail) toast.error(err?.message || 'Could not load support chat.');
      });
    return () => setViewingThread(false);
  }, [isEmail, loadMine, markRead, setViewingThread]);

  useEffect(() => {
    if (isEmail || !messages.length) return undefined;
    const hasStaffMessage = messages.some((m) => m?.senderRole === 'support' || m?.senderRole === 'admin');
    if (hasStaffMessage) markRead();
    return undefined;
  }, [isEmail, messages, markRead]);

  const handleAddFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const combined = [...attachments, ...incoming];
    const check = validateAttachments(combined);
    if (check.error) {
      toast.error(check.error);
      return;
    }
    setAttachments(combined);
  };

  const handleFileInputChange = (e) => {
    handleAddFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendEmail = async () => {
    if (!canSendEmail) return;
    setEmailSending(true);
    try {
      await sendSupportEmail(
        {
          subject: emailSubject.trim(),
          category: emailCategory,
          description: emailBody.trim(),
          attachments,
        },
        getIdToken
      );
      toast.success(
        "Support request sent! Check your inbox for a confirmation — we'll reply within 24 hours.",
        { duration: 6000 }
      );
      setEmailSubject('');
      setEmailCategory('');
      setEmailBody('');
      setAttachments([]);
    } catch (err) {
      toast.error(err?.message || 'Could not send support email. Please try again.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleInputChange = (value) => {
    setInput(value);
    const convoId = conversation?.id;
    if (!convoId) return;
    emitTyping(convoId, true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(convoId, false), 1200);
  };

  const handleSend = async (meta = {}) => {
    const text = String(meta.text ?? input).trim();
    const attachments = Array.isArray(meta.attachments) ? meta.attachments : [];
    if (!text && !attachments.length) return;
    setInput('');
    const store = useSupportChatStore.getState();
    store.emitTyping(store.conversation?.id, false);
    try {
      if (!store.conversation?.id) await store.loadMine();
      await store.sendMessage(text, {
        replyTo: meta.replyTo || undefined,
        attachments: attachments.length ? attachments : undefined,
      });
      store.markRead();
    } catch (err) {
      toast.error(err?.message || 'Could not send message.');
    }
  };

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.headerLead}>
          <div className={classes.iconBox}>
            {isEmail ? <Mail size={22} /> : <MessageSquare size={22} />}
          </div>
          <div>
            <h2>{isEmail ? 'Email support' : 'Live chat'}</h2>
            <p>
              {isEmail
                ? 'Send a ticket and we will reply to your inbox within 24 hours.'
                : 'Message our team live. Stay here or keep working — we will pop in.'}
            </p>
          </div>
        </div>
        <nav className={classes.switcher} aria-label="Support channel">
          <NavLink
            to="/app/support"
            end
            className={({ isActive }) =>
              `${classes.switchBtn} ${isActive ? classes.switchBtnActive : ''}`
            }
          >
            <MessageSquare size={14} />
            Live chat
          </NavLink>
          <NavLink
            to="/app/support/email"
            className={({ isActive }) =>
              `${classes.switchBtn} ${isActive ? classes.switchBtnActive : ''}`
            }
          >
            <Mail size={14} />
            Email
          </NavLink>
        </nav>
      </motion.div>

      {isEmail ? (
        <motion.div className={`glass ${classes.emailStage}`} variants={presets.child}>
          <div className={classes.emailHead}>
            <div>
              <h3>New ticket</h3>
              <p>We read every email. Attach screenshots if it helps.</p>
            </div>
          </div>

          <div className={classes.emailBody}>
            <div className={classes.emailGrid}>
              <div className={classes.formGroup}>
                <div className={classes.formLabel}>Subject</div>
                <input
                  type="text"
                  className={classes.formInput}
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Brief summary"
                />
              </div>
              <div className={classes.formGroup}>
                <div className={classes.formLabel}>Category</div>
                <div className={classes.selectField}>
                  <CustomSelect
                    options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                    value={emailCategory}
                    onChange={setEmailCategory}
                    placeholder="Select a category"
                    className={classes.supportSelect}
                  />
                </div>
              </div>
            </div>
            <div className={`${classes.formGroup} ${classes.descriptionGroup}`}>
              <div className={classes.formLabel}>Description</div>
              <textarea
                className={classes.formTextarea}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Describe your issue..."
                rows={8}
              />
            </div>
            {attachments.length > 0 ? (
              <ul className={classes.attachmentList}>
                {attachments.map((file, idx) => {
                  const isImage = (file.type || '').startsWith('image/');
                  return (
                    <li key={`${file.name}-${idx}`} className={classes.attachmentChip}>
                      <span className={classes.attachmentIcon}>
                        {isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                      </span>
                      <span className={classes.attachmentName} title={file.name}>
                        {file.name}
                      </span>
                      <span className={classes.attachmentSize}>{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        className={classes.attachmentRemove}
                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove ${file.name}`}
                        disabled={emailSending}
                      >
                        <X size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className={classes.emailFooter}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={SUPPORT_ATTACHMENT_LIMITS.acceptList.join(',')}
              onChange={handleFileInputChange}
              className={classes.fileInputHidden}
            />
            <button
              type="button"
              className={classes.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={emailSending || attachments.length >= SUPPORT_ATTACHMENT_LIMITS.maxFiles}
            >
              <Paperclip size={15} />
              {attachments.length > 0 ? 'Add more' : 'Add files'}
              <span className={classes.attachmentHint}>
                up to {SUPPORT_ATTACHMENT_LIMITS.maxFiles}
              </span>
            </button>
            <button
              type="button"
              className={classes.submitBtn}
              onClick={handleSendEmail}
              disabled={!canSendEmail}
            >
              {emailSending ? (
                <>
                  <Loader2 size={16} className={classes.spinIcon} />
                  Sending...
                </>
              ) : (
                <>Send email</>
              )}
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div className={`glass ${classes.chatStage}`} variants={presets.child}>
          <SupportThread
            portal
            messages={messages}
            input={input}
            onInputChange={handleInputChange}
            onSend={handleSend}
            typing={supportTyping}
            online={staffOnline}
            loading={loading}
            userInitial={userInitial}
            title="Live chat"
            timeZone={conversation?.userTimeZone || browserTimeZone()}
            selfId={user?.uid}
            conversationId={conversation?.id || user?.uid}
            peerLastReadAt={conversation?.supportLastReadAt || null}
          />
        </motion.div>
      )}
    </motion.div>
  );
};

export default SupportPage;
