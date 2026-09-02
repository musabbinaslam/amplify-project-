import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Flag, Loader } from 'lucide-react';
import classes from './adminShared.module.css';

function formatAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function prettyStatus(status) {
  if (status === 'pending_review') return 'Needs review';
  if (status === 'processing') return 'Analyzing';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'dismissed') return 'Dismissed';
  if (status === 'clear') return 'Clear';
  if (status === 'billing') return 'Billing issue';
  if (status === 'quota') return 'Rate limited';
  if (status === 'fallback') return 'Failed';
  if (status === 'gemini_audio') return 'Gemini';
  return status || '—';
}

function readinessCopy(status) {
  if (!status) {
    return { tone: 'warn', label: 'Checking', Icon: Loader, spin: true };
  }
  if (status.state === 'analyzing') {
    return { tone: 'live', label: 'Listening', Icon: Loader, spin: true };
  }
  if (status.state === 'disabled') {
    return { tone: 'warn', label: 'Off', Icon: AlertTriangle };
  }
  if (status.state === 'missing_key') {
    return { tone: 'bad', label: 'No key', Icon: AlertTriangle };
  }
  if (status.state === 'no_rules') {
    return { tone: 'warn', label: 'No rules', Icon: AlertTriangle };
  }
  if ((status.counts?.pending || 0) > 0) {
    return { tone: 'flag', label: 'Action', Icon: Flag };
  }
  if (status.state === 'working') {
    return { tone: 'ok', label: 'Ready', Icon: CheckCircle2 };
  }
  return { tone: 'idle', label: 'Ready', Icon: Activity };
}

/* eslint-disable react/prop-types */
export default function QaAiStatusBanner({ fetchStatus, pollMs = 8000, onStatus, reloadToken }) {
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!fetchStatus) return;
    try {
      const out = await fetchStatus();
      setStatus(out || null);
      onStatus?.(out || null);
    } catch {
      setStatus((prev) => prev || {
        state: 'idle',
        geminiConfigured: false,
        activeRuleCount: 0,
        counts: {},
      });
    }
  }, [fetchStatus, onStatus]);

  useEffect(() => {
    load();
    const interval = Math.max(1500, Number(pollMs) || 8000);
    const id = window.setInterval(load, interval);
    return () => window.clearInterval(id);
  }, [load, pollMs, reloadToken]);

  const copy = readinessCopy(status);
  const Icon = copy.Icon;
  const counts = status?.counts || {};
  const pending = counts.pending ?? 0;
  const processing = counts.processing ?? 0;
  const lastSource = status?.lastReview?.source;
  const lastStatus = status?.lastReview?.status;
  const lastAgo = formatAgo(status?.lastGeminiAt || status?.lastReview?.generatedAt);

  return (
    <div
      className={`glass ${classes.qaStrip} ${classes[`qaStrip_${copy.tone}`] || ''}`}
      role="status"
    >
      <div className={classes.qaStripCell}>
        <span className={classes.qaStripLabel}>Status</span>
        <span className={classes.qaStripValue}>
          <span className={classes.qaStripPulse} aria-hidden="true">
            <Icon size={14} className={copy.spin ? classes.spin : ''} />
          </span>
          {copy.label}
        </span>
      </div>
      <div className={`${classes.qaStripCell} ${pending > 0 ? classes.qaStripCellHot : ''}`}>
        <span className={classes.qaStripLabel}>Pending</span>
        <span className={classes.qaStripValue}>{pending}</span>
      </div>
      <div className={classes.qaStripCell}>
        <span className={classes.qaStripLabel}>Analyzing</span>
        <span className={classes.qaStripValue}>{processing}</span>
      </div>
      <div className={classes.qaStripCell}>
        <span className={classes.qaStripLabel}>Rules</span>
        <span className={classes.qaStripValue}>{status?.activeRuleCount ?? '—'}</span>
      </div>
      <div className={classes.qaStripCell}>
        <span className={classes.qaStripLabel}>Last run</span>
        <span className={classes.qaStripValue}>
          {lastStatus ? prettyStatus(lastStatus) : '—'}
        </span>
        {lastStatus ? (
          <span className={classes.qaStripSub}>
            {[
              lastSource && lastSource !== lastStatus ? prettyStatus(lastSource) : null,
              lastAgo,
              status?.geminiConfigured === false ? 'API key missing' : null,
            ].filter(Boolean).join(' · ')}
          </span>
        ) : (
          <span className={classes.qaStripSub}>No runs yet</span>
        )}
      </div>
    </div>
  );
}
