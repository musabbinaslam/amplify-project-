import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, DollarSign, Loader, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download, Upload, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { apiFetch } from '../services/apiClient';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../motion/appMotion';
import { auth } from '../config/firebase';
import CustomSelect from '../components/ui/CustomSelect';
import PageLoader from '../components/ui/PageLoader';
import classes from './CallLogsPage.module.css';

const FILTER_OPTIONS = ['All', 'Inbound', 'Missed'];

/** Short table labels — matches Take Calls campaign titles (not pricing subtitles). */
const CAMPAIGN_SHORT_LABELS = {
  fe_inbounds_short: 'FE Inbounds Short',
  fe_inbounds: 'FE Inbounds',
  fe_tv_calls: 'FE TV Calls',
  medicare_transfers: 'Medicare Transfers',
  medicare_inbound_1: 'Medicare Inbounds (1)',
  medicare_inbound_2: 'Medicare Inbounds (2)',
  aca_transfers: 'ACA Transfers',
};

/** Longer descriptive labels shown on hover. */
const CAMPAIGN_FULL_LABELS = {
  fe_inbounds_short: 'FE Inbounds Short Duration',
  fe_inbounds: 'Direct inbound Final Expense calls',
  fe_tv_calls: 'High-intent Final Expense TV calls',
  medicare_transfers: 'Live transfer Medicare calls',
  medicare_inbound_1: 'High-intent Medicare inbound calls',
  medicare_inbound_2: 'Standard Medicare inbound calls',
  aca_transfers: 'Live transfer ACA health calls',
};

function getCampaignDisplayLabel(log) {
  const id = log?.campaign;
  if (id && CAMPAIGN_SHORT_LABELS[id]) return CAMPAIGN_SHORT_LABELS[id];
  return log?.campaignLabel || log?.campaign || '—';
}

function getCampaignFullLabel(log) {
  const stored = String(log?.campaignLabel || '').trim();
  const id = log?.campaign;
  const mapped = id ? CAMPAIGN_FULL_LABELS[id] : null;
  if (stored && stored !== CAMPAIGN_SHORT_LABELS[id]) return stored;
  if (mapped) return mapped;
  return stored || log?.campaign || '—';
}

function CampaignTagCell({ log }) {
  const display = getCampaignDisplayLabel(log);
  const full = getCampaignFullLabel(log);
  const showTooltip = full !== display && full !== '—';
  const anchorRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const openTooltip = useCallback(() => {
    if (!showTooltip || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const maxWidth = 280;
    const margin = 8;
    let left = rect.left;
    if (left + maxWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - maxWidth - margin);
    }
    setTooltip({
      text: full,
      left,
      top: rect.bottom + 6,
    });
  }, [full, showTooltip]);

  const closeTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    if (!tooltip) return undefined;
    const onScroll = () => setTooltip(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [tooltip]);

  return (
    <>
      <span className={classes.campaignTagWrap}>
        <span
          ref={anchorRef}
          className={`${classes.campaignTag}${showTooltip ? ` ${classes.campaignTagHoverable}` : ''}`}
          onMouseEnter={openTooltip}
          onMouseLeave={closeTooltip}
          onFocus={openTooltip}
          onBlur={closeTooltip}
        >
          {display}
        </span>
      </span>
      {tooltip && createPortal(
        <div
          className={classes.campaignTooltipFixed}
          style={{ left: tooltip.left, top: tooltip.top }}
          role="tooltip"
        >
          {tooltip.text}
        </div>,
        document.body,
      )}
    </>
  );
}

/* eslint-disable react/prop-types -- local stat card helper */
const StatCard = ({ label, value, icon: Icon, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.statIconBox}>
        <Icon size={18} />
      </div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>{value}</div>
    </motion.div>
  );
};

const CONTEST_CATEGORIES = [
  { id: 'disconnect', label: 'Call disconnected' },
  { id: 'server_outage', label: 'Server / platform outage' },
  { id: 'audio_quality', label: 'Audio / connection quality' },
  { id: 'other', label: 'Other' },
];

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_PROOF_TOTAL_BYTES = 12 * 1024 * 1024;
const CONTEST_MAX_AGE_HOURS = 24;
const CONTEST_MAX_AGE_MS = CONTEST_MAX_AGE_HOURS * 60 * 60 * 1000;
const CONTEST_WINDOW_LABEL = '24 hours';

function getCallOccurredMs(log) {
  const raw = log?.createdAt || log?.timestamp;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function isWithinContestWindow(log) {
  const occurredMs = getCallOccurredMs(log);
  if (occurredMs == null) return true;
  return Date.now() - occurredMs <= CONTEST_MAX_AGE_MS;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function compressImageForUpload(file, maxBytes = MAX_PROOF_BYTES) {
  if (!file.type?.startsWith('image/') || file.size <= maxBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const maxDim = 1920;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

    let quality = 0.88;
    let blob = null;
    while (quality >= 0.45) {
      // eslint-disable-next-line no-await-in-loop
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });
      if (blob && blob.size <= maxBytes) break;
      quality -= 0.1;
    }

    if (blob && blob.size <= maxBytes) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'proof';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareOneProofFile(file) {
  if (file.type?.startsWith('image/')) {
    const compressed = await compressImageForUpload(file);
    if (compressed) return compressed;
    if (file.size > MAX_PROOF_BYTES) {
      throw new Error(`"${file.name}" is too large (${formatBytes(file.size)}). Use a screenshot under ${formatBytes(MAX_PROOF_BYTES)} or a smaller image.`);
    }
    return file;
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error(`"${file.name}" is too large (${formatBytes(file.size)}). PDFs must be under ${formatBytes(MAX_PROOF_BYTES)}.`);
  }
  return file;
}

async function prepareProofFiles(files) {
  const out = await Promise.all(files.slice(0, 3).map((file) => prepareOneProofFile(file)));
  const total = out.reduce((s, f) => s + f.size, 0);
  if (total > MAX_PROOF_TOTAL_BYTES) {
    throw new Error(`Total attachment size is ${formatBytes(total)}. Combined files must be under ${formatBytes(MAX_PROOF_TOTAL_BYTES)}.`);
  }
  return out;
}

const ContestChargeModal = ({ log, onClose, onSubmitted }) => {
  const [category, setCategory] = useState('disconnect');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 3);
    setFiles(picked);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error('Please explain what happened (at least 10 characters).');
      return;
    }
    if (!isWithinContestWindow(log)) {
      toast.error(`Contests must be submitted within ${CONTEST_WINDOW_LABEL} of the call`);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('reason', trimmed);
      fd.append('category', category);
      if (files.length > 0) {
        const prepared = await prepareProofFiles(files);
        prepared.forEach((f) => fd.append('proof', f));
      }
      await apiFetch(`/api/voice/logs/${encodeURIComponent(log.id)}/contest`, {
        method: 'POST',
        body: fd,
      });
      toast.success('Contest submitted — our team will review it shortly.');
      onSubmitted?.(log.id);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to submit contest', { duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className={classes.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className={classes.contestModal}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div className={classes.contestModalHeader}>
          <h3>Contest call charge</h3>
          <button type="button" className={classes.contestCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </motion.div>
        <p className={classes.contestModalSub}>
          This call was billed at ${Number(log.cost || 0).toFixed(2)}. Contests must be submitted within {CONTEST_WINDOW_LABEL} of the call. Explain what happened (disconnect, outage, etc.). Screenshots or PDFs are optional but helpful. Large images are compressed automatically — max 5 MB per file. We already have the call recording when available.
        </p>
        <form onSubmit={handleSubmit} className={classes.contestForm}>
          <label className={classes.contestLabel}>
            Category
            <select
              className={classes.contestSelect}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CONTEST_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className={classes.contestLabel}>
            What happened?
            <textarea
              className={classes.contestTextarea}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the disconnect or issue..."
              required
            />
          </label>
          <label className={classes.contestLabel}>
            Proof <span className={classes.contestOptional}>(optional, up to 3 files)</span>
            <div className={classes.contestUploadBox}>
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} />
              <div className={classes.contestUploadInner}>
                <Upload size={24} className={classes.contestUploadIcon} aria-hidden />
                <span className={classes.contestUploadText}>
                  {files.length ? files.map((f) => f.name).join(', ') : 'PNG, JPG, or PDF (max 5 MB each)'}
                </span>
              </div>
            </div>
          </label>
          <div className={classes.contestActions}>
            <button type="button" className={classes.contestCancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={classes.contestSubmitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit contest'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

function BillingStatusCell({ log, onContest }) {
  if (log.refunded) {
    return <span className={`${classes.dispBadge} ${classes.contestCredited}`}>Credited</span>;
  }
  if (log.contestStatus === 'pending') {
    return <span className={`${classes.dispBadge} ${classes.contestPending}`}>Under review</span>;
  }
  if (log.contestStatus === 'denied') {
    return (
      <span className={`${classes.dispBadge} ${classes.contestDenied}`} title={log.contestDenyNote || 'Contest denied'}>
        <AlertCircle size={12} /> Denied
      </span>
    );
  }
  if (log.isBillable && Number(log.cost || 0) > 0) {
    if (!isWithinContestWindow(log)) {
      return (
        <span
          className={`${classes.dispBadge} ${classes.contestExpired}`}
          title={`Contests must be submitted within ${CONTEST_WINDOW_LABEL} of the call`}
        >
          Window closed
        </span>
      );
    }
    return (
      <button type="button" className={classes.contestBtn} onClick={() => onContest(log)}>
        Contest charge
      </button>
    );
  }
  return <span className={classes.scoreDash}>—</span>;
}

function extractRecordingSid(recordingUrl) {
  const value = String(recordingUrl || '').trim();
  if (!value) return '';
  const match = value.match(/(RE[0-9a-fA-F]{32})/);
  if (match?.[1]) return match[1];
  // Fallback for non-standard values
  const cleanTail = value.split('?')[0].split('/').pop() || '';
  return cleanTail.replace(/\.(json|mp3)$/i, '');
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75];

function formatClock(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return '--:--';
  const s = Math.floor(n);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function normalizeDuration(...candidates) {
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function formatRecordingDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const RecordingModal = ({ log, onClose }) => {
  const recordingSidDirect = log?.recordingSid || null;
  const recordingUrl       = log?.recordingUrl  || null;
  const logDuration        = normalizeDuration(log?.duration);

  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const audioRef = useRef(null);
  const durationRef = useRef(logDuration);
  const scrubbingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(logDuration);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    durationRef.current = logDuration;
    if (logDuration > 0) setTotal(logDuration);
  }, [logDuration]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadAudio = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        setCurrent(0);
        setBuffered(0);
        setPlaying(false);
        const recordingSid = recordingSidDirect || extractRecordingSid(recordingUrl);
        if (!recordingSid) {
          throw new Error('Invalid recording SID');
        }
        const token = await auth?.currentUser?.getIdToken();
        const API_URL = import.meta.env.VITE_API_URL || '';
        const cleanApiUrl = API_URL.replace(/\/$/, '');
        const url = `${cleanApiUrl}/api/voice/recording/${recordingSid}?token=${encodeURIComponent(token)}`;
        if (isMounted) setStreamUrl(url);
      } catch (err) {
        console.error('Error loading audio:', err);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadAudio();
    return () => { isMounted = false; };
  }, [recordingSidDirect, recordingUrl]);

  const resolveDuration = useCallback((el) => {
    const fromAudio = el ? normalizeDuration(el.duration) : 0;
    const resolved = fromAudio || durationRef.current || logDuration;
    if (resolved > 0) {
      durationRef.current = resolved;
      setTotal(resolved);
    }
    return resolved;
  }, [logDuration]);

  const handlePlaybackEnd = useCallback(() => {
    const el = audioRef.current;
    const dur = durationRef.current;
    if (el) {
      el.pause();
      if (dur > 0) el.currentTime = dur;
    }
    setPlaying(false);
    setCurrent(dur > 0 ? dur : 0);
  }, []);

  const syncTimeFromAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el || scrubbingRef.current) return;

    const dur = resolveDuration(el);
    const t = el.currentTime || 0;
    setCurrent(t);

    if (dur > 0 && t >= dur - 0.12 && !el.paused) {
      handlePlaybackEnd();
    }
  }, [resolveDuration, handlePlaybackEnd]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !streamUrl) return undefined;

    const onLoadedMetadata = () => resolveDuration(el);
    const onDurationChange = () => resolveDuration(el);
    const onTimeUpdate = () => syncTimeFromAudio();
    const onProgress = () => {
      const b = el.buffered;
      if (b?.length > 0) setBuffered(b.end(b.length - 1));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => handlePlaybackEnd();
    const onError = () => setLoadError(true);

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('durationchange', onDurationChange);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('progress', onProgress);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('durationchange', onDurationChange);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [streamUrl, resolveDuration, syncTimeFromAudio, handlePlaybackEnd]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const dur = durationRef.current;
    const atEnd = el.ended || (dur > 0 && el.currentTime >= dur - 0.05);
    if (el.paused || atEnd) {
      if (atEnd) {
        el.currentTime = 0;
        setCurrent(0);
      }
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const seekTo = useCallback((secs) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(secs)) return;
    const dur = durationRef.current || normalizeDuration(el.duration, logDuration);
    const clamped = dur > 0 ? Math.max(0, Math.min(secs, dur)) : Math.max(0, secs);
    el.currentTime = clamped;
    setCurrent(clamped);
    if (dur > 0 && clamped >= dur - 0.05) {
      handlePlaybackEnd();
    } else if (el.paused === false) {
      setPlaying(true);
    }
  }, [logDuration, handlePlaybackEnd]);

  const skip = useCallback((delta) => {
    const el = audioRef.current;
    if (!el) return;
    seekTo((el.currentTime || 0) + delta);
  }, [seekTo]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const changeVolume = useCallback((v) => {
    const n = Math.max(0, Math.min(1, Number(v) || 0));
    setVolume(n);
    if (audioRef.current) {
      audioRef.current.volume = n;
      if (n > 0 && muted) {
        audioRef.current.muted = false;
        setMuted(false);
      }
    }
  }, [muted]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skip(5);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, toggleMute, onClose]);

  const callerDisplay = log?.isBillable
    ? (log?.from || 'Unknown caller')
    : (log?.from ? 'Hidden caller' : 'Unknown caller');
  const campaignDisplay = (() => {
    const label = getCampaignDisplayLabel(log);
    return label !== '—' ? label : 'Call Recording';
  })();
  const dateDisplay = formatRecordingDate(log?.timestamp || log?.createdAt);

  const effectiveTotal = total > 0 ? total : logDuration;
  const sliderMax = Math.max(effectiveTotal, 0.001);
  const sliderValue = Math.min(current, sliderMax);
  const playedPct = effectiveTotal > 0 ? (sliderValue / effectiveTotal) * 100 : 0;
  const bufferedPct = effectiveTotal > 0 ? Math.min(100, (buffered / effectiveTotal) * 100) : 0;

  return (
    <div
      className={classes.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recordingTitle"
    >
      <div className={`glass ${classes.modalContent}`} onClick={(e) => e.stopPropagation()}>
        <div className={classes.recordingHeader}>
          <div className={classes.recordingHeaderMain}>
            <h3 id="recordingTitle" className={classes.recordingTitle}>{callerDisplay}</h3>
            <span className={classes.recordingCampaign}>{campaignDisplay}</span>
          </div>
          <div className={classes.recordingHeaderRight}>
            {dateDisplay && <span className={classes.recordingDate}>{dateDisplay}</span>}
            <button className={classes.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className={classes.recordingBody}>
          {loading ? (
            <div className={classes.loadingState}>
              <Loader size={18} className={classes.spinner} /> Loading recording...
            </div>
          ) : loadError || !streamUrl ? (
            <div className={classes.errorState}>
              Could not load playback. The recording may still be processing.
            </div>
          ) : (
            <div className={classes.playerPanel}>
              <audio
                ref={audioRef}
                src={streamUrl}
                preload="auto"
                autoPlay
                className={classes.hiddenAudio}
              />

              <div
                className={`${classes.playerVisual} ${playing ? classes.playerVisualActive : ''}`}
                aria-hidden="true"
              >
                <div className={classes.visualizerBars}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                    <span
                      key={i}
                      className={classes.visualizerBar}
                      style={{ animationDelay: `${i * 0.07}s` }}
                    />
                  ))}
                </div>
                <div
                  className={classes.visualizerProgress}
                  style={{ width: `${playedPct}%` }}
                />
              </div>

              <div className={classes.progressBlock}>
                <span className={classes.timeLabel}>{formatClock(current)}</span>
                <div
                  className={classes.scrubber}
                  style={{
                    '--played-pct': `${playedPct}%`,
                    '--buffered-pct': `${bufferedPct}%`,
                  }}
                >
                  <input
                    type="range"
                    className={classes.scrubberInput}
                    min={0}
                    max={sliderMax}
                    step={0.05}
                    value={sliderValue}
                    onPointerDown={() => { scrubbingRef.current = true; }}
                    onPointerUp={() => { scrubbingRef.current = false; }}
                    onPointerCancel={() => { scrubbingRef.current = false; }}
                    onInput={(e) => seekTo(Number(e.target.value))}
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={effectiveTotal || 0}
                    aria-valuenow={sliderValue}
                  />
                </div>
                <span className={classes.timeLabel}>{formatClock(effectiveTotal)}</span>
              </div>

              <div className={classes.controlsRow}>
                <button
                  type="button"
                  className={classes.skipBtn}
                  onClick={() => skip(-10)}
                  aria-label="Rewind 10 seconds"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className={classes.playBtn}
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button
                  type="button"
                  className={classes.skipBtn}
                  onClick={() => skip(10)}
                  aria-label="Forward 10 seconds"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              <div className={classes.volumeBlock}>
                <button
                  type="button"
                  className={classes.volumeBtn}
                  onClick={toggleMute}
                  aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  className={classes.volumeInput}
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(e.target.value)}
                  aria-label="Volume"
                  style={{ '--volume-pct': `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>

              <div className={classes.footerActions}>
                <button
                  type="button"
                  className={classes.speedPill}
                  onClick={cycleSpeed}
                  aria-label={`Playback speed ${speed}x`}
                  title="Playback speed"
                >
                  {speed}x
                </button>
                <a
                  className={classes.downloadBtn}
                  href={streamUrl}
                  download={`recording-${recordingSidDirect || extractRecordingSid(recordingUrl) || 'call'}.mp3`}
                  aria-label="Download recording"
                  title="Download"
                >
                  <Download size={16} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CallLogsPage = () => {
  const presets = useSubtlePageMotion();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  const [contestLog, setContestLog] = useState(null);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch real call logs from backend
  const fetchLogs = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      let queryUrl = '/api/voice/logs';
      let params = new URLSearchParams();
      
      const now = new Date();
      if (dateFilter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.append('startDate', startOfToday.toISOString());
      } else if (dateFilter === 'last_7') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        params.append('startDate', sevenDaysAgo.toISOString());
      } else if (dateFilter === 'last_30') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        params.append('startDate', thirtyDaysAgo.toISOString());
      } else if (dateFilter === 'custom') {
        if (startDate) params.append('startDate', new Date(startDate).toISOString());
        if (endDate) {
           const endObj = new Date(endDate);
           endObj.setDate(endObj.getDate() + 1);
           params.append('endDate', endObj.toISOString());
        }
      }
      
      const qs = params.toString();
      if (qs) queryUrl += `?${qs}`;

      const data = await apiFetch(queryUrl);
      setCallLogs(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching call logs:', err);
      setError('Failed to load call logs');
    } finally {
      if (showLoader) setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
    // Avoid re-render jitter while user is interacting with the audio controls.
    if (activeRecording) return undefined;
    const interval = setInterval(() => fetchLogs(false), 15000);
    return () => clearInterval(interval);
  }, [dateFilter, startDate, endDate, activeRecording]);

  useEffect(() => {
    const onContestResolved = () => fetchLogs(false);
    window.addEventListener('contest:resolved', onContestResolved);
    return () => window.removeEventListener('contest:resolved', onContestResolved);
  }, [dateFilter, startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, dateFilter, startDate, endDate]);

  // Determine call type for display (inbound vs outbound vs transfer)
  const getCallType = (log) => {
    if (log.type === 'Transfer') return 'outbound';
    return 'inbound';
  };

  // Determine status for filtering
  const getCallStatus = (log) => {
    if (log.status === 'missed') return 'missed';
    return 'completed';
  };

  // Format duration from seconds to mm:ss
  const formatDuration = (seconds) => {
    const secs = parseInt(seconds) || 0;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${remainSecs.toString().padStart(2, '0')}`;
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const filtered = useMemo(() => {
    return callLogs.filter((log) => {
      // 1. Search filter
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (log.from || '').toLowerCase().includes(q) ||
        (log.campaignLabel || '').toLowerCase().includes(q) ||
        (log.campaign || '').toLowerCase().includes(q);
        
      // 2. Type/Status filter
      const callType = getCallType(log);
      const callStatus = getCallStatus(log);
      const matchesType =
        typeFilter === 'All' ||
        (typeFilter === 'Missed' ? callStatus === 'missed' : callType === typeFilter.toLowerCase());

      return matchesSearch && matchesType;
    });
  }, [search, typeFilter, callLogs]);

  const stats = useMemo(() => {
    const total = callLogs.length;
    const completed = callLogs.filter((c) => c.status === 'completed').length;
    const missed = callLogs.filter((c) => c.status === 'missed').length;
    const sold = callLogs.filter((c) => c.isBillable).length;
    return { total, completed, missed, sold };
  }, [callLogs]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const handleContestSubmitted = (callLogId) => {
    setCallLogs((prev) =>
      prev.map((row) =>
        row.id === callLogId ? { ...row, contestStatus: 'pending' } : row,
      ),
    );
  };

  if (initialLoading) return <PageLoader />;

  return (
    <>
    <motion.div
      className={classes.callLogs}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div>
          <h2>All Call Logs</h2>
          <p className={classes.subtitle}>Review and manage your recent calls</p>
        </div>
        <div className={classes.searchBox}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by caller or campaign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      <motion.div className={classes.statsRow} variants={presets.statsStrip}>
        <StatCard label="Total Calls" value={stats.total} icon={Phone} variants={presets.child} />
        <StatCard label="Completed" value={stats.completed} icon={PhoneIncoming} variants={presets.child} />
        <StatCard label="Missed" value={stats.missed} icon={PhoneMissed} variants={presets.child} />
        <StatCard label="Sold" value={stats.sold} icon={DollarSign} variants={presets.child} />
      </motion.div>

      <motion.div className={classes.filters} variants={presets.child}>
        <div className={classes.filterGroup}>
          <div className={`glass ${classes.filterTabs}`}>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`${classes.filterTab} ${typeFilter === opt ? classes.filterActive : ''}`}
                onClick={() => setTypeFilter(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className={classes.dateSwitch}>
            <CustomSelect
              className={classes.dateSelect}
              options={[
                { value: 'all_time', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'last_7', label: 'Last 7 Days' },
                { value: 'last_30', label: 'Last 30 Days' },
                { value: 'custom', label: 'Custom Range' }
              ]}
              value={dateFilter}
              onChange={setDateFilter}
            />
            
            {dateFilter === 'custom' && (
              <div className={classes.customDateInputs}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <span>-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <span className={classes.totalCalls}>{filtered.length} calls</span>
      </motion.div>

      <motion.div className={`glass ${classes.tableWrap}`} variants={presets.child}>
        {loading ? (
          <div className={classes.emptyState}>
            <Loader size={20} className={classes.spinner} />
            Loading call logs...
          </div>
        ) : error ? (
          <div className={classes.emptyState}>{error}</div>
        ) : (
          <>
            <div className={classes.tableScroll}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th className={classes.colCampaign}>Campaign</th>
                  <th className={classes.colCaller}>Caller</th>
                  <th className={classes.colType}>Type</th>
                  <th className={classes.colDuration}>Duration</th>
                  <th className={classes.colStatus}>Status</th>
                  <th className={classes.colDisposition}>Disposition</th>
                  <th className={classes.colCost}>Cost</th>
                  <th className={classes.colBilling}>Billing</th>
                  <th className={classes.colRecording}>Recording</th>
                  <th className={classes.colDate}>Date</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => {
                  const callType = getCallType(log);
                  const isInbound = callType === 'inbound';
                  const TypeIcon = isInbound ? PhoneIncoming : PhoneOutgoing;
                  const typeCls = isInbound ? 'typeInbound' : 'typeOutbound';

                  return (
                    <tr key={log.id} className={log.status === 'missed' ? classes.rowMissed : ''}>
                      <td className={classes.colCampaign}>
                        <CampaignTagCell log={log} />
                      </td>
                      <td className={`${classes.phoneCell} ${classes.colCaller}`}>
                        {log.isBillable ? log.from : <span className={classes.hiddenPhone}>Hidden</span>}
                      </td>
                      <td className={classes.colType}>
                        <span className={`${classes.typeBadge} ${classes[typeCls]}`}>
                          <TypeIcon size={13} />
                          {isInbound ? 'Inbound' : 'Transfer'}
                        </span>
                      </td>
                      <td className={classes.colDuration}>
                        <span className={classes.duration}>
                          <Clock size={13} />
                          {formatDuration(log.duration)}
                        </span>
                      </td>
                      <td className={classes.colStatus}>
                        <div className={classes.statusCell}>
                          {log.isBillable ? (
                            <span className={`${classes.dispBadge} ${classes.dispSold}`}>
                              <DollarSign size={12} /> SOLD {log.saleAmount ? `($${Number(log.saleAmount).toFixed(0)})` : ''}
                            </span>
                          ) : log.status === 'missed' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Missed</span>
                          ) : (
                            <span className={`${classes.dispBadge} ${classes.dispAnswered}`}>Answered</span>
                          )}
                        </div>
                      </td>
                      <td className={classes.colDisposition}>
                        <div className={classes.statusCell}>
                          {log.disposition === 'callback' ? (
                            <span className={`${classes.dispBadge} ${classes.dispAnswered}`}>Call back</span>
                          ) : log.disposition === 'not_interested' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Not Interested</span>
                          ) : log.disposition === 'busy' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Busy</span>
                          ) : log.disposition === 'dead_air' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Dead Air</span>
                          ) : log.disposition === 'policy_closed' ? (
                            <span className={`${classes.dispBadge} ${classes.dispPolicyClosed}`}>Policy Closed</span>
                          ) : log.disposition === 'sold' || log.isBillable ? (
                            <span className={`${classes.dispBadge} ${classes.dispSold}`}>Sold</span>
                          ) : (
                            <span className={classes.scoreDash}>—</span>
                          )}
                        </div>
                      </td>
                      <td className={classes.colCost}>
                        {log.cost > 0 ? (
                          <span className={classes.costValue}>
                            ${log.cost}
                            {log.refunded ? ' (credited)' : ''}
                          </span>
                        ) : (
                          <span className={classes.scoreDash}>—</span>
                        )}
                      </td>
                      <td className={classes.colBilling}>
                        <BillingStatusCell log={log} onContest={setContestLog} />
                      </td>
                      <td className={`${classes.audioCell} ${classes.colRecording}`}>
                        {(log.recordingSid || log.recordingUrl) ? (
                          <button 
                            className={classes.loadAudioBtn} 
                            onClick={() => setActiveRecording(log)}
                          >
                            <Play size={14} /> Play
                          </button>
                        ) : (
                          <span className={classes.scoreDash}>—</span>
                        )}
                      </td>
                      <td className={`${classes.dateCell} ${classes.colDate}`}>{formatDate(log.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {filtered.length === 0 && (
              <div className={classes.emptyState}>
                {callLogs.length === 0
                  ? 'No call logs yet. Start taking calls to see your activity here.'
                  : 'No calls match your search'}
              </div>
            )}

            {filtered.length > 0 && (
              <div className={classes.pagination}>
                <button
                  className={classes.pageBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className={classes.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className={classes.pageBtn}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
                <div style={{ marginLeft: '1rem', width: '130px' }}>
                  <CustomSelect
                    options={[
                      { value: 10, label: '10 per page' },
                      { value: 20, label: '20 per page' }
                    ]}
                    value={itemsPerPage}
                    onChange={(val) => {
                      setItemsPerPage(Number(val));
                      setCurrentPage(1);
                    }}
                    menuAlign="top"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>

      {activeRecording && (
        <RecordingModal
          log={activeRecording}
          onClose={() => setActiveRecording(null)}
        />
      )}
      {contestLog && (
        <ContestChargeModal
          log={contestLog}
          onClose={() => setContestLog(null)}
          onSubmitted={handleContestSubmitted}
        />
      )}
    </>
  );
};

export default CallLogsPage;

