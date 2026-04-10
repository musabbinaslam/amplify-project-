import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Bot, Mail } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { sendMessage } from '../services/chatService';
import CustomSelect from '../components/ui/CustomSelect';
import classes from './SupportPage.module.css';

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

            <button type="button" className={classes.emailSubmitBtn} disabled>
              Send Email
              <span className={classes.comingSoon}>Coming Soon</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
