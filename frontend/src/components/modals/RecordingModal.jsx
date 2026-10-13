/* eslint-disable react/prop-types */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download } from 'lucide-react';
import { auth } from '../../config/firebase';
import IconSwap from '../ui/IconSwap';
import classes from './RecordingModal.module.css';

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

function getCampaignDisplayLabel(log) {
  const CAMPAIGN_SHORT_LABELS = {
    fe_inbounds_short: 'FE Inbounds Short',
    fe_tv_calls: 'FE TV Calls',
    medicare_transfers: 'Medicare Transfers',
    medicare_inbound_1: 'Medicare Inbounds (1)',
    medicare_inbound_2: 'Medicare Inbounds (2)',
    aca_transfers: 'ACA Transfers',
  };
  const id = log?.campaign;
  if (id && CAMPAIGN_SHORT_LABELS[id]) return CAMPAIGN_SHORT_LABELS[id];
  return log?.campaignLabel || log?.campaign || '—';
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
  const [downloading, setDownloading] = useState(false);
  const resolvedSid = recordingSidDirect || extractRecordingSid(recordingUrl);

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

  const handleDownload = useCallback(async () => {
    if (!streamUrl || downloading) return;
    const filename = `recording-${resolvedSid || 'call'}.mp3`;
    setDownloading(true);
    try {
      // Cross-origin <a download> is ignored — fetch blob, or fall back to attachment navigation.
      const downloadUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}download=1`;
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Recording download failed:', err);
      window.open(`${streamUrl}${streamUrl.includes('?') ? '&' : '?'}download=1`, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }, [streamUrl, downloading, resolvedSid]);

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

  const callerDisplay = (log?.revealCaller || log?.isBillable)
    ? (log?.from || log?.callSid || 'Unknown caller')
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

  return createPortal(
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
                  <IconSwap
                    state={playing ? 'a' : 'b'}
                    iconA={<Pause size={22} />}
                    iconB={<Play size={22} />}
                    ariaLabel={playing ? 'Pause' : 'Play'}
                  />
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
                <button
                  type="button"
                  className={classes.downloadBtn}
                  onClick={handleDownload}
                  disabled={downloading}
                  aria-label="Download recording"
                  title="Download"
                >
                  {downloading ? <Loader size={16} className={classes.spinner} /> : <Download size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
