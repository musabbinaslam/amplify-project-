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

function truncate(text, max = 140) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function stateCopy(status) {
  if (!status) {
    return {
      tone: 'warn',
      label: 'Checking',
      title: 'Checking AI…',
      detail: 'Loading Gemini pipeline status.',
      Icon: Loader,
      spin: true,
    };
  }
  if (status.state === 'analyzing') {
    return {
      tone: 'live',
      label: 'Live',
      title: 'Analyzing recording',
      detail: `${status.counts?.processing || 1} call${(status.counts?.processing || 1) === 1 ? '' : 's'} in progress.`,
      Icon: Loader,
      spin: true,
    };
  }
  if (status.state === 'working') {
    const last = status.lastReview;
    const pending = status.counts?.pending || 0;
    if (pending > 0 || last?.status === 'pending_review') {
      const n = pending || last?.violationCount || 1;
      return {
        tone: 'flag',
        label: 'Action needed',
        title: 'Flags ready for review',
        detail: `${n} violation${n === 1 ? '' : 's'} waiting in Pending.`,
        Icon: Flag,
      };
    }
    if (last?.status === 'clear') {
      return {
        tone: 'ok',
        label: 'Healthy',
        title: 'AI is working',
        detail: `Last call was clear${formatAgo(status.lastGeminiAt) ? ` · ${formatAgo(status.lastGeminiAt)}` : ''}.`,
        Icon: CheckCircle2,
      };
    }
    return {
      tone: 'ok',
      label: 'Healthy',
      title: 'AI is working',
      detail: `Last success ${formatAgo(status.lastGeminiAt) || 'recently'}.`,
      Icon: CheckCircle2,
    };
  }
  if (status.state === 'disabled') {
    return {
      tone: 'warn',
      label: 'Off',
      title: 'AI Flags Gemini is disabled',
      detail: 'Set AI_FLAGS_GEMINI_ENABLED=true in backend .env and restart to resume.',
      Icon: AlertTriangle,
    };
  }
  if (status.state === 'missing_key') {
    return {
      tone: 'bad',
      label: 'Blocked',
      title: 'Gemini key missing',
      detail: 'Set GEMINI_API_KEY in backend .env and restart.',
      Icon: AlertTriangle,
    };
  }
  if (status.state === 'no_rules') {
    return {
      tone: 'warn',
      label: 'Setup',
      title: 'No active rules',
      detail: 'Add a compliance rule before calls can be flagged.',
      Icon: AlertTriangle,
    };
  }
  if (status.state === 'billing') {
    return {
      tone: 'bad',
      label: 'Billing',
      title: 'Gemini credits depleted',
      detail: 'Add credits in Google AI Studio, then re-run analysis.',
      Icon: AlertTriangle,
    };
  }
  if (status.state === 'quota') {
    return {
      tone: 'warn',
      label: 'Limited',
      title: 'Rate limit hit',
      detail: 'Wait a minute, then analyze 1 short call.',
      Icon: AlertTriangle,
    };
  }
  if (status.state === 'fallback') {
    return {
      tone: 'warn',
      label: 'Issue',
      title: 'Last run did not use Gemini',
      detail: truncate(status.lastReview?.summary, 120) || 'Recording fetched, but scoring failed.',
      Icon: AlertTriangle,
    };
  }
  return {
    tone: 'idle',
    label: 'Ready',
    title: 'Gemini ready',
    detail: 'Waiting for the next call, or analyze recordings below.',
    Icon: Activity,
  };
}

/* eslint-disable react/prop-types */
export default function QaAiStatusBanner({ fetchStatus, pollMs = 8000, onStatus }) {
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
  }, [load, pollMs]);

  const copy = stateCopy(status);
  const Icon = copy.Icon;
  const counts = status?.counts || {};
  const lastSource = status?.lastReview?.source;
  const lastStatus = status?.lastReview?.status;
  const lastSummary = truncate(status?.lastReview?.summary, 160);
  const showSummary = Boolean(lastSummary)
    && (status?.state === 'working' || status?.state === 'fallback' || status?.state === 'billing' || status?.state === 'analyzing');

  return (
    <div className={`${classes.qaStatusBanner} ${classes[`qaStatus_${copy.tone}`] || ''}`}>
      <div className={classes.qaStatusTop}>
        <div className={classes.qaStatusMain}>
          <span className={classes.qaStatusIcon} aria-hidden="true">
            <Icon size={18} className={copy.spin ? classes.spin : ''} />
          </span>
          <div className={classes.qaStatusCopy}>
            <div className={classes.qaStatusHeadingRow}>
              <span className={classes.qaStatusLabel}>{copy.label}</span>
              <strong className={classes.qaStatusTitle}>{copy.title}</strong>
            </div>
            <p className={classes.qaStatusDetail}>{copy.detail}</p>
          </div>
        </div>
        {showSummary ? (
          <p className={classes.qaStatusSummary}>{lastSummary}</p>
        ) : null}
      </div>

      <div className={classes.qaStatusMeta}>
        <div className={classes.qaStatusStat}>
          <span className={classes.qaStatusStatLabel}>Key</span>
          <span className={`${classes.qaStatusStatValue} ${status?.geminiConfigured ? classes.qaStatOk : classes.qaStatBad}`}>
            {status?.geminiConfigured ? 'Ready' : 'Missing'}
          </span>
        </div>
        <div className={classes.qaStatusStat}>
          <span className={classes.qaStatusStatLabel}>Rules</span>
          <span className={classes.qaStatusStatValue}>{status?.activeRuleCount ?? '—'}</span>
        </div>
        <div className={classes.qaStatusStat}>
          <span className={classes.qaStatusStatLabel}>Analyzing</span>
          <span className={classes.qaStatusStatValue}>{counts.processing ?? 0}</span>
        </div>
        <div className={`${classes.qaStatusStat} ${(counts.pending || 0) > 0 ? classes.qaStatusStatHot : ''}`}>
          <span className={classes.qaStatusStatLabel}>Pending</span>
          <span className={classes.qaStatusStatValue}>{counts.pending ?? 0}</span>
        </div>
        <div className={`${classes.qaStatusStat} ${classes.qaStatusStatWide}`}>
          <span className={classes.qaStatusStatLabel}>Last run</span>
          <span className={classes.qaStatusStatValue}>
            {prettyStatus(lastStatus)}
            {lastSource && lastSource !== lastStatus ? (
              <span className={classes.qaStatusStatMuted}> · {prettyStatus(lastSource)}</span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
