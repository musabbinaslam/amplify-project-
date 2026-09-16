import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronsDown,
  Check,
  CheckCheck,
  Clock,
  FileText,
  HeadphonesIcon,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Square,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import classes from './SupportThread.module.css';
import { formatChatTime, withDaySeparators } from '../../utils/chatDaySeparators';
import {
  CHAT_MEDIA_LIMITS,
  fetchSupportMediaObjectUrl,
  supportMediaSrc,
  supportMediaSrcSync,
  uploadSupportMedia,
  warmSupportMediaToken,
} from '../../services/supportLiveService';

const WELCOME = 'Message our team here. Someone will pick this up live.';

function isStaffRole(role) {
  return role === 'admin' || role === 'support';
}

function isOwnMessage(msg, alignRole, selfId) {
  if (selfId && msg?.senderId) return String(msg.senderId) === String(selfId);
  const role = msg?.senderRole || msg?.role;
  if (alignRole === 'support' || alignRole === 'staff') return isStaffRole(role);
  return role === 'user';
}

function staffLabel(msg) {
  const role = msg?.senderRole;
  if (role === 'admin') return 'Admin';
  if (role === 'support') return 'Support agent';
  return '';
}

function quoteAuthor(msg, selfId) {
  if (selfId && msg?.senderId && String(msg.senderId) === String(selfId)) return 'You';
  if (msg?.senderRole === 'admin') return 'Admin';
  if (msg?.senderRole === 'support') return 'Support agent';
  return msg?.senderName || 'User';
}

function quotePreview(text, max = 80) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function receiptState(msg, peerLastReadAt) {
  if (!msg?.id || String(msg.id).startsWith('tmp-')) return 'pending';
  if (!peerLastReadAt || !msg.createdAt) return 'sent';
  const readMs = new Date(peerLastReadAt).getTime();
  const createdMs = new Date(msg.createdAt).getTime();
  if (Number.isNaN(readMs) || Number.isNaN(createdMs)) return 'sent';
  // Require read cursor to be at/after the message, with a tiny skew buffer.
  return readMs + 50 >= createdMs ? 'seen' : 'sent';
}

function MessageMeta({ when, receipt, mine }) {
  if (!when && !mine) return null;
  return (
    <span className={`${classes.msgTime} ${!when ? classes.msgTimeSolo : ''}`}>
      {when ? <span>{when}</span> : null}
      {mine ? (
        <span
          className={`${classes.receipt} ${receipt === 'seen' ? classes.receiptSeen : ''}`}
          aria-label={receipt === 'seen' ? 'Seen' : receipt === 'pending' ? 'Sending' : 'Sent'}
          title={receipt === 'seen' ? 'Seen' : receipt === 'pending' ? 'Sending' : 'Sent'}
        >
          {receipt === 'pending' ? (
            <Clock size={12} strokeWidth={2.4} />
          ) : receipt === 'seen' ? (
            <CheckCheck size={14} strokeWidth={2.4} />
          ) : (
            <Check size={13} strokeWidth={2.4} />
          )}
        </span>
      ) : null}
    </span>
  );
}

function toReplyPayload(msg) {
  if (!msg?.id) return null;
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  const preview = quotePreview(msg.text, 140)
    || (attachments[0]?.kind === 'audio' ? 'Voice message' : '')
    || (attachments[0]?.kind === 'image' ? 'Photo' : '')
    || attachments[0]?.name
    || 'Message';
  return {
    id: msg.id,
    text: preview,
    senderName: msg.senderName || '',
    senderRole: msg.senderRole || '',
    senderId: msg.senderId || '',
  };
}

function sameSender(a, b) {
  if (!a || !b) return false;
  if (a.senderId && b.senderId) return String(a.senderId) === String(b.senderId);
  return (a.senderRole || '') === (b.senderRole || '');
}

function decorateTimeline(items) {
  return items.map((item, i) => {
    if (item.type !== 'msg') return item;
    const prev = items[i - 1]?.type === 'msg' ? items[i - 1].msg : null;
    const next = items[i + 1]?.type === 'msg' ? items[i + 1].msg : null;
    return {
      ...item,
      stacked: sameSender(prev, item.msg),
      clusterEnd: !sameSender(next, item.msg),
    };
  });
}

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms = 0) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

function MediaImage({ conversationId, media, desk = false }) {
  const mediaId = media?.id || '';
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const [previewSrc, setPreviewSrc] = useState('');
  const [fullSrc, setFullSrc] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [lightboxLoaded, setLightboxLoaded] = useState(false);

  useEffect(() => {
    if (!conversationId || !mediaId) {
      setFailed(true);
      return undefined;
    }

    let alive = true;
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 25000);
    const mediaSnapshot = mediaRef.current;

    setLoaded(false);
    setFailed(false);
    setPreviewSrc('');
    setFullSrc('');

    (async () => {
      try {
        let preview = '';
        try {
          preview = await fetchSupportMediaObjectUrl(conversationId, mediaSnapshot, {
            desk,
            variant: 'thumb',
            signal: ctrl.signal,
          });
        } catch {
          preview = await fetchSupportMediaObjectUrl(conversationId, mediaSnapshot, {
            desk,
            variant: 'full',
            signal: ctrl.signal,
          });
        }
        if (!alive) return;
        setPreviewSrc(preview);
        setLoaded(true);
        setFailed(false);

        fetchSupportMediaObjectUrl(conversationId, mediaSnapshot, {
          desk,
          variant: 'full',
          signal: ctrl.signal,
        }).then((full) => {
          if (alive && full) setFullSrc(full);
        }).catch(() => {});
      } catch {
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(timeout);
      ctrl.abort();
    };
  }, [conversationId, mediaId, desk]);

  useEffect(() => {
    if (!open) return undefined;
    setLightboxLoaded(false);
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When opening lightbox, ensure full blob is ready (or fall back to preview).
  useEffect(() => {
    if (!open || !conversationId || !mediaId || fullSrc) return undefined;
    let alive = true;
    const ctrl = new AbortController();
    const mediaSnapshot = mediaRef.current;
    fetchSupportMediaObjectUrl(conversationId, mediaSnapshot, {
      desk,
      variant: 'full',
      signal: ctrl.signal,
    }).then((full) => {
      if (alive && full) setFullSrc(full);
    }).catch(() => {});
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [open, conversationId, mediaId, desk, fullSrc]);

  const lightboxSrc = fullSrc || previewSrc;

  return (
    <>
      <button
        type="button"
        className={classes.mediaImageLink}
        onClick={() => (fullSrc || previewSrc) && setOpen(true)}
        aria-label={`Open ${media.name || 'photo'}`}
        disabled={!previewSrc && !failed}
      >
        {failed ? (
          <span className={classes.mediaImageError}>Photo unavailable</span>
        ) : !loaded || !previewSrc ? (
          <span className={classes.mediaImageLoading} role="status" aria-label="Loading photo">
            <Loader2 size={22} className={classes.mediaImageSpinner} aria-hidden="true" />
          </span>
        ) : (
          <img
            src={previewSrc}
            alt={media.name || 'Photo'}
            className={`${classes.mediaImage} ${classes.mediaImageReady}`}
            decoding="async"
          />
        )}
      </button>
      {open && lightboxSrc
        ? createPortal(
          <div
            className={classes.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={media.name || 'Photo'}
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              className={classes.lightboxClose}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            {!lightboxLoaded ? (
              <div className={classes.lightboxLoading} role="status" aria-label="Loading full photo">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt=""
                    className={classes.lightboxPreview}
                    aria-hidden="true"
                  />
                ) : null}
                <Loader2 size={36} className={classes.mediaImageSpinner} aria-hidden="true" />
              </div>
            ) : null}
            <img
              src={lightboxSrc}
              alt={media.name || 'Photo'}
              className={`${classes.lightboxImage} ${lightboxLoaded ? classes.lightboxImageReady : classes.lightboxImagePending}`}
              onClick={(e) => e.stopPropagation()}
              onLoad={() => setLightboxLoaded(true)}
              onError={() => setLightboxLoaded(true)}
              ref={(el) => {
                if (el?.complete && el.naturalWidth > 0) setLightboxLoaded(true);
              }}
            />
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

function MediaFile({ conversationId, media, desk = false }) {
  const [href, setHref] = useState(() => supportMediaSrcSync(conversationId, media, { desk }));
  useEffect(() => {
    let alive = true;
    const sync = supportMediaSrcSync(conversationId, media, { desk });
    if (sync) setHref(sync);
    supportMediaSrc(conversationId, media, { desk }).then((url) => {
      if (alive && url) setHref(url);
    }).catch(() => {});
    return () => { alive = false; };
  }, [conversationId, media, desk]);
  return (
    <a
      className={classes.mediaFile}
      href={href || '#'}
      target="_blank"
      rel="noreferrer"
      download={media.name}
      onClick={(e) => { if (!href) e.preventDefault(); }}
    >
      <span className={classes.mediaFileIcon}><FileText size={18} /></span>
      <span className={classes.mediaFileMeta}>
        <span className={classes.mediaFileName}>{media.name || 'File'}</span>
        <span className={classes.mediaFileSize}>{formatBytes(media.size)}</span>
      </span>
    </a>
  );
}

function MediaAudio({ conversationId, media, desk = false }) {
  const audioRef = useRef(null);
  const [src, setSrc] = useState(() => supportMediaSrcSync(conversationId, media, { desk }));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = media.durationMs || 0;

  useEffect(() => {
    let alive = true;
    const sync = supportMediaSrcSync(conversationId, media, { desk });
    if (sync) setSrc(sync);
    supportMediaSrc(conversationId, media, { desk }).then((url) => {
      if (alive && url) setSrc(url);
    }).catch(() => {});
    return () => { alive = false; };
  }, [conversationId, media, desk]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => toast.error('Could not play voice note.'));
    } else {
      el.pause();
    }
  };

  return (
    <div className={classes.mediaAudio}>
      <button type="button" className={classes.audioPlay} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className={classes.audioTrack}>
        <div className={classes.audioBar}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className={classes.audioDur}>{formatDuration(duration || (audioRef.current?.duration || 0) * 1000)}</span>
      </div>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
          onTimeUpdate={() => {
            const el = audioRef.current;
            if (!el?.duration) return;
            setProgress(el.currentTime / el.duration);
          }}
        />
      ) : null}
    </div>
  );
}

/* eslint-disable react/prop-types */
export default function SupportThread({
  messages = [],
  input,
  onInputChange,
  onSend,
  typing = false,
  online = false,
  userInitial = 'U',
  compact = false,
  title = 'Callsflow Support',
  emptyHint = WELCOME,
  placeholder = 'Type your message...',
  disabled = false,
  headerActions = null,
  hideHeader = false,
  alignRole = 'user',
  otherInitial = '',
  showStaffLabels = true,
  desk = false,
  portal = false,
  timeZone,
  selfId = '',
  conversationId = '',
  peerLastReadAt = null,
  loading = false,
}) {
  const messagesEndRef = useRef(null);
  const listRef = useRef(null);
  const listInnerRef = useRef(null);
  const prevConvoRef = useRef('');
  const prevCountRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStartedAt = useRef(0);
  const recordTimer = useRef(null);
  const streamRef = useRef(null);

  const [replyTo, setReplyTo] = useState(null);
  const [flashId, setFlashId] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);

  const timeline = useMemo(
    () => decorateTimeline(withDaySeparators(messages, timeZone)),
    [messages, timeZone]
  );

  const convoId = conversationId || messages[0]?.conversationId || '';

  useEffect(() => {
    warmSupportMediaToken();
  }, [convoId]);

  useEffect(() => {
    if (!messages.some((m) => Array.isArray(m.attachments) && m.attachments.length)) return;
    warmSupportMediaToken();
  }, [messages]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (loading && messages.length === 0) return;

    const convoKey = String(convoId || '');
    const convoChanged = convoKey !== String(prevConvoRef.current || '');
    const count = messages.length;
    const grew = count > prevCountRef.current;
    const wasEmpty = prevCountRef.current === 0 && count > 0;
    prevConvoRef.current = convoKey;
    prevCountRef.current = count;

    const pinBottom = () => {
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = true;
    };

    // Always stay on the latest message when opening a thread, first paint,
    // new messages, or typing — both desk and user views share this thread.
    if (convoChanged || wasEmpty || grew || typing) {
      pinBottom();
      requestAnimationFrame(() => {
        pinBottom();
        // Images/media can expand after paint — nudge again.
        window.setTimeout(pinBottom, 80);
        window.setTimeout(pinBottom, 280);
      });
    }
  }, [messages, typing, loading, convoId]);

  // Keep pinned when bubble content grows (thumbnails, voice players, etc.).
  useEffect(() => {
    const el = listRef.current;
    const inner = listInnerRef.current;
    if (!el || !inner || typeof ResizeObserver === 'undefined') return undefined;

    const pinIfStuck = () => {
      if (!stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    };

    const ro = new ResizeObserver(() => {
      pinIfStuck();
    });
    ro.observe(inner);

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [convoId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [input]);

  useEffect(() => () => {
    clearInterval(recordTimer.current);
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
  }, []);

  const stopRecording = (cancel = false) => {
    clearInterval(recordTimer.current);
    setRecording(false);
    setRecordMs(0);
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (cancel && rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* noop */ }
    }
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
    if (cancel) recordChunksRef.current = [];
    return rec;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (recording) {
        e.preventDefault();
        stopRecording(true);
        return;
      }
      if (replyTo) {
        e.preventDefault();
        setReplyTo(null);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendNow();
    }
  };

  const sendNow = async () => {
    const text = String(input || '').trim();
    if (disabled || uploading || recording) return;
    if (!text && !drafts.length) return;
    const attachments = drafts.map((d) => d.media);
    const pendingReply = replyTo || undefined;
    onInputChange?.('');
    setDrafts([]);
    setReplyTo(null);
    onSend?.({
      text,
      replyTo: pendingReply,
      attachments: attachments.length ? attachments : undefined,
    });
  };

  const startReply = (msg) => {
    setReplyTo(toReplyPayload(msg));
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const jumpToQuoted = (id) => {
    if (!id) return;
    const node = document.getElementById(`support-msg-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? '' : cur)), 1200);
  };

  const addFiles = async (fileList) => {
    if (!convoId) {
      toast.error('Open a conversation first.');
      return;
    }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    if (drafts.length + incoming.length > CHAT_MEDIA_LIMITS.maxFiles) {
      toast.error(`You can attach up to ${CHAT_MEDIA_LIMITS.maxFiles} files.`);
      return;
    }
    let total = drafts.reduce((sum, d) => sum + (d.media?.size || 0), 0);
    setUploading(true);
    try {
      for (const file of incoming) {
        if (file.size > CHAT_MEDIA_LIMITS.maxFileBytes) {
          toast.error(`${file.name} is too large (max 10 MB).`);
          continue;
        }
        total += file.size;
        if (total > CHAT_MEDIA_LIMITS.maxTotalBytes) {
          toast.error('Total attachment size exceeds 20 MB.');
          break;
        }
        const out = await uploadSupportMedia(convoId, file, { desk });
        if (out?.media) {
          setDrafts((prev) => [...prev, {
            localId: `${Date.now()}-${Math.random()}`,
            media: out.media,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          }]);
        }
      }
    } catch (err) {
      toast.error(err?.message || 'Could not upload file.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDraft = (localId) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.localId !== localId);
      const gone = prev.find((d) => d.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return next;
    });
  };

  const startRecording = async () => {
    if (disabled || uploading || recording) return;
    if (!convoId) {
      toast.error('Open a conversation first.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice notes are not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorderRef.current = recorder;
      recordStartedAt.current = Date.now();
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        const durationMs = Math.max(0, Date.now() - recordStartedAt.current);
        if (!chunks.length || durationMs < 400) return;
        const type = recorder.mimeType || mime || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks, { type });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type });
        setUploading(true);
        try {
          const out = await uploadSupportMedia(convoId, file, { durationMs, desk });
          if (out?.media) {
            onSend?.({
              text: '',
              replyTo: replyTo || undefined,
              attachments: [out.media],
            });
            setReplyTo(null);
          }
        } catch (err) {
          toast.error(err?.message || 'Could not send voice note.');
        } finally {
          setUploading(false);
        }
      };
      recorder.start(250);
      setRecording(true);
      setRecordMs(0);
      clearInterval(recordTimer.current);
      recordTimer.current = setInterval(() => {
        const elapsed = Date.now() - recordStartedAt.current;
        setRecordMs(elapsed);
        if (elapsed >= CHAT_MEDIA_LIMITS.maxVoiceMs) {
          finishRecording();
        }
      }, 200);
    } catch {
      toast.error('Microphone access was denied.');
    }
  };

  const finishRecording = () => {
    const rec = stopRecording(false);
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* noop */ }
    }
  };

  const cancelRecording = () => {
    stopRecording(true);
  };

  const canSend = !disabled && !uploading && !recording
    && (Boolean(String(input || '').trim()) || drafts.length > 0);
  const showMic = !String(input || '').trim() && !drafts.length && !recording;

  return (
    <div className={`${classes.thread} ${compact ? classes.compact : ''} ${desk ? classes.desk : ''} ${portal ? classes.portal : ''}`}>
      {hideHeader ? null : (
        <div className={classes.header}>
          <div className={classes.headerTitle}>
            <HeadphonesIcon size={16} />
            <span>{title}</span>
          </div>
          <div className={classes.headerActions}>
            {headerActions}
            <span className={classes.presence}>
              <span className={`${classes.pulse} ${online ? classes.pulseOn : ''}`} />
              {online ? 'Online' : 'Away'}
            </span>
          </div>
        </div>
      )}

      <div className={classes.messageList} ref={listRef}>
        <div className={classes.messageListInner} ref={listInnerRef}>
          {loading && messages.length === 0 ? (
            <div className={classes.threadLoading} aria-busy="true" aria-label="Loading messages">
              <div className={`${classes.skelBubble} ${classes.skelBubbleLeft}`} />
              <div className={`${classes.skelBubble} ${classes.skelBubbleRight}`} />
              <div className={`${classes.skelBubble} ${classes.skelBubbleLeft} ${classes.skelBubbleShort}`} />
              <div className={`${classes.skelBubble} ${classes.skelBubbleRight}`} />
            </div>
          ) : messages.length === 0 ? (
            <div className={classes.emptyState}>
              <p className={classes.emptyTitle}>Live thread</p>
              <p className={classes.emptyHint}>{emptyHint}</p>
            </div>
          ) : null}
          {!loading || messages.length > 0 ? timeline.map((item) => {
            if (item.type === 'day') {
              return (
                <div key={item.id} className={classes.daySep} role="separator">
                  <span>{item.label}</span>
                </div>
              );
            }
            const msg = item.msg;
            const mine = isOwnMessage(msg, alignRole, selfId);
            const system = msg.senderRole === 'system';
            const label = !mine && showStaffLabels && isStaffRole(msg.senderRole) ? staffLabel(msg) : '';
            const showLabel = Boolean(label) && !item.stacked;
            const when = formatChatTime(msg.createdAt, timeZone);
            const quoted = msg.replyTo;
            const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
            const initials = otherInitial && !isStaffRole(msg.senderRole)
              ? otherInitial
              : (msg.senderName || label || '?').charAt(0).toUpperCase();
            const receipt = mine ? receiptState(msg, peerLastReadAt) : null;
            return (
              <div
                key={msg.id}
                id={`support-msg-${msg.id}`}
                className={[
                  classes.messageRow,
                  mine ? classes.userRow : classes.botRow,
                  item.stacked ? classes.stacked : '',
                  item.clusterEnd ? classes.clusterEnd : '',
                  flashId === msg.id ? classes.msgFlash : '',
                ].filter(Boolean).join(' ')}
              >
                {!mine && !system ? (
                  item.clusterEnd ? (
                    <div className={classes.botAvatar}>{initials}</div>
                  ) : (
                    <span className={classes.avatarSpacer} />
                  )
                ) : null}

                <div className={classes.bubbleCol}>
                  {showLabel ? (
                    <span className={`${classes.roleLabel} ${msg.senderRole === 'admin' ? classes.roleAdmin : classes.roleSupport}`}>
                      {label}
                    </span>
                  ) : null}
                  <div
                    className={`${classes.bubble} ${
                      system ? classes.systemBubble : mine ? classes.userBubble : classes.botBubble
                    }`}
                  >
                    {quoted?.id ? (
                      <div
                        className={classes.quote}
                        role="button"
                        tabIndex={0}
                        onClick={() => jumpToQuoted(quoted.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            jumpToQuoted(quoted.id);
                          }
                        }}
                      >
                        <span className={classes.quoteName}>{quoteAuthor(quoted, selfId)}</span>
                        <span className={classes.quoteText}>
                          {quotePreview(quoted.text) || 'Message'}
                        </span>
                      </div>
                    ) : null}
                    {attachments.map((media) => {
                      if (media.kind === 'image') {
                        return <MediaImage key={media.id} conversationId={convoId} media={media} desk={desk} />;
                      }
                      if (media.kind === 'audio') {
                        return <MediaAudio key={media.id} conversationId={convoId} media={media} desk={desk} />;
                      }
                      return <MediaFile key={media.id} conversationId={convoId} media={media} desk={desk} />;
                    })}
                    {(msg.text || !attachments.length) ? (
                      <p className={classes.bubbleText}>
                        {msg.text}
                        <MessageMeta when={when} receipt={receipt} mine={mine && !system} />
                      </p>
                    ) : (
                      <MessageMeta when={when} receipt={receipt} mine={mine && !system} />
                    )}
                    {!system && !disabled ? (
                      <button
                        type="button"
                        className={classes.replyBtn}
                        onClick={() => startReply(msg)}
                        aria-label="Reply"
                      >
                        <ChevronsDown size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          }) : null}
          {typing ? (
            <div className={`${classes.messageRow} ${classes.botRow} ${classes.clusterEnd}`}>
              <div className={classes.botAvatar}>
                {otherInitial || <HeadphonesIcon size={compact ? 14 : 18} />}
              </div>
              <div className={`${classes.bubble} ${classes.botBubble}`}>
                <span className={classes.typingDots}>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className={classes.composer}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={CHAT_MEDIA_LIMITS.accept}
          className={classes.fileHidden}
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          className={classes.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || recording || drafts.length >= CHAT_MEDIA_LIMITS.maxFiles}
          aria-label="Attach file"
        >
          <Paperclip size={20} />
        </button>

        <div className={classes.composerCard}>
          {uploading ? (
            <div className={classes.uploadBar} aria-live="polite">
              <Loader2 size={14} className={classes.uploadSpin} />
              <span>Uploading…</span>
            </div>
          ) : null}
          {replyTo ? (
            <div className={classes.replyDock}>
              <div className={classes.replyDockBody}>
                <span className={classes.quoteName}>{quoteAuthor(replyTo, selfId)}</span>
                <span className={classes.quoteText}>{quotePreview(replyTo.text)}</span>
              </div>
              <button
                type="button"
                className={classes.replyDockClose}
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}

          {drafts.length ? (
            <ul className={classes.draftList}>
              {drafts.map((d) => (
                <li key={d.localId} className={classes.draftChip}>
                  {d.previewUrl ? (
                    <img src={d.previewUrl} alt="" className={classes.draftThumb} />
                  ) : d.media.kind === 'audio' ? (
                    <span className={classes.draftIcon}><Mic size={14} /></span>
                  ) : d.media.kind === 'image' ? (
                    <span className={classes.draftIcon}><ImageIcon size={14} /></span>
                  ) : (
                    <span className={classes.draftIcon}><FileText size={14} /></span>
                  )}
                  <span className={classes.draftName}>{d.media.name}</span>
                  <button
                    type="button"
                    className={classes.draftRemove}
                    onClick={() => removeDraft(d.localId)}
                    aria-label={`Remove ${d.media.name}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {recording ? (
            <div className={classes.recordBar}>
              <span className={classes.recordPulse} />
              <span className={classes.recordTimer}>{formatDuration(recordMs)}</span>
              <button type="button" className={classes.recordCancel} onClick={cancelRecording}>
                Cancel
              </button>
              <button type="button" className={classes.recordSend} onClick={finishRecording} aria-label="Send voice note">
                <Square size={14} />
                Send
              </button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className={classes.chatInput}
              value={input}
              onChange={(e) => onInputChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyTo ? 'Type a reply…' : placeholder}
              rows={1}
              disabled={disabled || uploading}
            />
          )}
        </div>

        {showMic ? (
          <button
            type="button"
            className={classes.micBtn}
            onClick={startRecording}
            disabled={disabled || uploading}
            aria-label="Record voice note"
          >
            <Mic size={18} />
          </button>
        ) : (
          <button
            type="button"
            className={classes.sendBtn}
            onClick={sendNow}
            disabled={!canSend}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
