import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Bot,
  Mail,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { sendMessage } from '../services/chatService';
import {
  sendSupportEmail,
  validateAttachments,
  SUPPORT_ATTACHMENT_LIMITS,
} from '../services/supportService';
import CustomSelect from '../components/ui/CustomSelect';
import classes from './SupportPage.module.css';

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: "Hi! I'm the Agent Calls support bot. I can help with billing, call setup, scripts, leads, and more. What can I help you with?",
};

const CATEGORIES = ['Billing', 'Technical', 'Account', 'Other'];

const SupportPage = () => {
  const user = useAuthStore((s) => s.user);
  const getIdToken = useAuthStore((s) => s.getIdToken);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

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

  const handleRemoveAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || typing) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setTyping(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const reply = await sendMessage(updated, getIdToken);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', text: reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text:
            err?.message?.trim() || 'Sorry, something went wrong. Please try again.',
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <div className={classes.supportPage}>
      <div className={classes.header}>
        <div className={classes.iconBox}><MessageSquare size={24} /></div>
        <div>
          <h2>Support</h2>
          <p>Get help from Agent Calls Bot and our support team</p>
        </div>
      </div>

      <div className={classes.twoCol}>
        <div className={classes.chatContainer}>
          <div className={classes.messageList}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${classes.messageRow} ${msg.role === 'user' ? classes.userRow : classes.botRow}`}
              >
                {msg.role === 'assistant' && (
                  <div className={classes.botAvatar}>
                    <Bot size={18} />
                  </div>
                )}
                <div
                  className={`${classes.bubble} ${msg.role === 'user' ? classes.userBubble : classes.botBubble}`}
                >
                  {msg.text}
                </div>
                {msg.role === 'user' && (
                  <div className={classes.userAvatar}>{userInitial}</div>
                )}
              </div>
            ))}

            {typing && (
              <div className={`${classes.messageRow} ${classes.botRow}`}>
                <div className={classes.botAvatar}>
                  <Bot size={18} />
                </div>
                <div className={`${classes.bubble} ${classes.botBubble}`}>
                  <span className={classes.typingDots}>
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={classes.inputArea}>
            <textarea
              ref={textareaRef}
              className={classes.chatInput}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
            />
            <button
              type="button"
              className={classes.sendBtn}
              onClick={handleSend}
              disabled={!input.trim() || typing}
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className={classes.emailCard}>
          <h3><Mail size={18} /> Email Support</h3>
          <p className={classes.emailNote}>
            Describe your issue and our team will respond within 24 hours.
          </p>

          <div className={classes.emailForm}>
            <div className={classes.emailGroup}>
              <label>Subject</label>
              <input
                type="text"
                className={classes.emailInput}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Brief summary of your issue"
              />
            </div>

            <div className={classes.emailGroup}>
              <label>Category</label>
              <CustomSelect
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                value={emailCategory}
                onChange={setEmailCategory}
                placeholder="Select a category"
              />
            </div>

            <div className={classes.emailGroup}>
              <label>Description</label>
              <textarea
                className={classes.emailTextarea}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows={5}
              />
            </div>

            <div className={classes.emailGroup}>
              <label>
                Attachments
                <span className={classes.attachmentHint}>
                  (optional · up to {SUPPORT_ATTACHMENT_LIMITS.maxFiles} files,{' '}
                  {SUPPORT_ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)} MB each)
                </span>
              </label>

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
                disabled={
                  emailSending || attachments.length >= SUPPORT_ATTACHMENT_LIMITS.maxFiles
                }
              >
                <Paperclip size={15} />
                {attachments.length > 0 ? 'Add more files' : 'Add files'}
              </button>

              {attachments.length > 0 && (
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
                        <span className={classes.attachmentSize}>
                          {formatBytes(file.size)}
                        </span>
                        <button
                          type="button"
                          className={classes.attachmentRemove}
                          onClick={() => handleRemoveAttachment(idx)}
                          aria-label={`Remove ${file.name}`}
                          disabled={emailSending}
                        >
                          <X size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <button
              type="button"
              className={classes.emailSubmitBtn}
              onClick={handleSendEmail}
              disabled={!canSendEmail}
            >
              {emailSending ? (
                <>
                  <Loader2 size={16} className={classes.spinIcon} />
                  Sending...
                </>
              ) : (
                <>Send Email</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
