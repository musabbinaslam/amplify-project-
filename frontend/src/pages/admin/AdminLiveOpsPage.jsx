import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Radio,
  Users,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Headphones,
  Trash2,
  RefreshCw,
  Search,
  X,
  Timer,
  ArrowRight,
  Flag,
  Copy,
  UserRound,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  getAdminLiveCalls,
  forceRemoveAgent,
} from '../../services/adminService';
import useAuthStore from '../../store/authStore';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import SlidingTabs from '../../components/ui/SlidingTabs';
import CustomSelect from '../../components/ui/CustomSelect';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminLiveOpsPage.module.css';

/* ── Constants ─────────────────────────────────────────────── */

const VISIBLE_MS = 15000;
const HIDDEN_MS = 120000;
const LONG_CALL_SEC = 10 * 60;
const VERY_LONG_CALL_SEC = 20 * 60;

const POOL_LABELS = {
  available: 'Available',
  busy: 'In Call',
  ringing: 'Ringing',
  wrap_up: 'Wrap Up',
  unknown: 'Unknown',
  reserved: 'Available',
};

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  IN_CALL: 'In Call',
  RINGING: 'Ringing',
  WRAP_UP: 'Wrap Up',
  UNKNOWN: 'Unknown',
  RESERVED: 'Available',
  PAUSED: 'Paused',
};

/** Normalised status bucket used for colour, filters and ordering. */
const statusKey = (status) => {
  switch (status) {
    case 'AVAILABLE':
    case 'RESERVED':
      return 'available';
    case 'IN_CALL':
      return 'incall';
    case 'RINGING':
      return 'ringing';
    case 'WRAP_UP':
      return 'wrapup';
    case 'PAUSED':
      return 'paused';
    default:
      return 'unknown';
  }
};

const STATUS_ORDER = { incall: 0, ringing: 1, wrapup: 2, available: 3, paused: 4, unknown: 5 };

const STATUS_BUCKETS = [
  { key: 'incall', label: 'In call' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'wrapup', label: 'Wrap up' },
  { key: 'available', label: 'Available' },
  { key: 'paused', label: 'Paused' },
  { key: 'unknown', label: 'Unknown' },
];

/* ── Helpers ───────────────────────────────────────────────── */

const initialsOf = (name) => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((p) => p[0]?.toUpperCase())
  .join('') || '?';

/** 75 → "1:15", 3725 → "1:02:05" */
function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Spoken form for screen readers: "3 minutes 5 seconds". */
const spokenDuration = (totalSec) => {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  parts.push(`${s % 60} second${s % 60 === 1 ? '' : 's'}`);
  return parts.join(' ');
};

/**
 * Seconds a call has been live right now.
 * Prefers `startedAt` (corrected for server/client clock skew) and falls back to
 * the server's `durationSec` plus the time elapsed since that response arrived.
 */
function liveSeconds(row, now, sync) {
  const started = row?.startedAt ? Date.parse(row.startedAt) : NaN;
  if (Number.isFinite(started)) {
    return Math.max(0, Math.floor((now + (sync?.offsetMs || 0) - started) / 1000));
  }
  const base = Number(row?.durationSec) || 0;
  const since = sync?.receivedAt ? Math.max(0, now - sync.receivedAt) : 0;
  return Math.max(0, Math.floor(base + since / 1000));
}

/**
 * A real display name for an agent, or null when the API could only return the
 * raw user ID (the backend falls back to the ID when no profile name is found).
 */
const realNameOf = (...rows) => {
  for (const r of rows) {
    if (!r) continue;
    const id = getAgentId(r);
    const name = [r.agentName, r.displayName, r.name].find((n) => n && String(n).trim() && n !== id && n !== r.id);
    if (name) return String(name).trim();
  }
  return null;
};

/** Twilio party → readable label ("client:<uid>" is the agent's web dialer). */
const formatParty = (raw) => {
  if (!raw) return 'Unknown';
  const v = String(raw);
  if (v.startsWith('client:')) return 'Agent web dialer';
  if (v.startsWith('sip:')) return v.slice(4).split('@')[0] || v;
  return formatPhone(v);
};

const formatPhone = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return String(raw);
};

const timeOf = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
};

const callTone = (sec, status) => {
  if (status === 'WRAP_UP') return 'muted';
  if (sec >= VERY_LONG_CALL_SEC) return 'hot';
  if (sec >= LONG_CALL_SEC) return 'warm';
  return 'live';
};

/** Re-render every `ms` while `active`. */
function useNow(active, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

/* ── Small components ──────────────────────────────────────── */

/* eslint-disable react/prop-types */
function KpiCard({ label, icon: Icon, value, foot, tone = 'brand', loading, variants, live = false }) {
  return (
    <motion.div className={`glass ${classes.kpi}`} variants={variants}>
      <div className={classes.kpiHead}>
        <span className={classes.kpiLabel}>{label}</span>
        <span className={`${classes.kpiIcon} ${classes[`tone_${tone}`] || ''}`} aria-hidden="true">
          <Icon size={16} />
        </span>
      </div>
      {loading ? (
        <span className={classes.skelValue} />
      ) : (
        <div className={`${classes.kpiValue} ${live ? classes.kpiValueLive : ''}`}>{value}</div>
      )}
      <div className={classes.kpiFoot}>{loading ? <span className={classes.skelLine} /> : foot}</div>
    </motion.div>
  );
}

function StatusPill({ status, children }) {
  const key = statusKey(status);
  return (
    <span className={`${classes.pill} ${classes[`pill_${key}`] || ''}`}>
      <i aria-hidden="true" />
      {children || STATUS_LABELS[status] || status || 'Unknown'}
    </span>
  );
}

function CallTimer({ seconds, status, size = 'md' }) {
  const tone = callTone(seconds, status);
  return (
    <span
      className={`${classes.timer} ${classes[`timer_${tone}`]} ${size === 'sm' ? classes.timerSm : ''}`}
      title={status === 'WRAP_UP' ? 'Time since the call started (agent is wrapping up)' : 'Time on call'}
    >
      <span className={classes.srOnly}>{spokenDuration(seconds)}</span>
      <span aria-hidden="true">{formatDuration(seconds)}</span>
    </span>
  );
}
/* eslint-enable react/prop-types */

/* ── Page ──────────────────────────────────────────────────── */

export default function AdminLiveOpsPage() {
  const presets = useSubtlePageMotion();
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [liveCalls, setLiveCalls] = useState([]);
  const [sync, setSync] = useState({ offsetMs: 0, receivedAt: 0 });
  const [nextRefreshAt, setNextRefreshAt] = useState(0);
  const [removingId, setRemovingId] = useState(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');

  const loadingRef = useRef(false);

  const loadShell = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const ov = await getAdminOverviewLite();
      const receivedAt = Date.now();
      const serverAt = Date.parse(ov?.live?.generatedAt || ov?.meta?.generatedAt || '');
      setSync({ offsetMs: Number.isFinite(serverAt) ? serverAt - receivedAt : 0, receivedAt });
      setOverview(ov);
      setLiveCalls(Array.isArray(ov?.liveCalls) ? ov.liveCalls : []);
    } catch (e) {
      try {
        const live = await getAdminLiveCalls();
        const receivedAt = Date.now();
        const serverAt = Date.parse(live?.meta?.generatedAt || '');
        setSync({ offsetMs: Number.isFinite(serverAt) ? serverAt - receivedAt : 0, receivedAt });
        setLiveCalls(Array.isArray(live?.rows) ? live.rows : []);
      } catch {
        // no-op
      }
      toast.error(e.message || 'Failed to load live operations');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUserRole?.();
    loadShell();
  }, [loadShell, refreshUserRole]);

  // Poll: faster while the tab is visible, slower when hidden; refresh on wake.
  useEffect(() => {
    let timerId = null;

    const schedule = () => {
      if (timerId) window.clearTimeout(timerId);
      const ms = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS;
      setNextRefreshAt(Date.now() + ms);
      timerId = window.setTimeout(async () => {
        await loadShell();
        schedule();
      }, ms);
    };

    const handleWake = () => {
      loadShell();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    return () => {
      if (timerId) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [loadShell]);

  const now = useNow(true, 1000);

  /* ── Derived data ───────────────────────────────────────── */

  const agents = useMemo(() => overview?.agents || [], [overview]);
  const pool = overview?.pool || { available: [], ringing: [], busy: [] };
  const byCampaign = useMemo(() => overview?.byCampaign || {}, [overview]);

  const campaignLabels = useMemo(() => {
    const map = new Map();
    (overview?.campaigns || []).forEach((c) => {
      if (c?.id) map.set(c.id, c.label || c.id);
    });
    return map;
  }, [overview]);
  const campaignName = useCallback((id) => (id ? campaignLabels.get(id) || id : '—'), [campaignLabels]);

  const callsByAgent = useMemo(() => {
    const map = new Map();
    liveCalls.forEach((row) => {
      if (row?.agentId) map.set(row.agentId, row);
    });
    return map;
  }, [liveCalls]);

  const agentsById = useMemo(() => {
    const map = new Map();
    agents.forEach((a) => map.set(a.id, a));
    return map;
  }, [agents]);

  const callRows = useMemo(() => liveCalls
    .map((row) => ({ row, sec: liveSeconds(row, now, sync) }))
    .sort((a, b) => b.sec - a.sec), [liveCalls, now, sync]);

  const activeCallSecs = callRows.filter((c) => c.row.status !== 'WRAP_UP').map((c) => c.sec);
  const longestSec = activeCallSecs.length ? Math.max(...activeCallSecs) : 0;
  const avgSec = activeCallSecs.length
    ? activeCallSecs.reduce((s, n) => s + n, 0) / activeCallSecs.length
    : 0;

  const counts = useMemo(() => {
    const c = { available: 0, incall: 0, ringing: 0, wrapup: 0, paused: 0, unknown: 0 };
    agents.forEach((a) => { c[statusKey(a.status)] += 1; });
    return c;
  }, [agents]);

  const availableCount = agents.filter((a) => a.status === 'AVAILABLE' || a.status === 'RESERVED').length;
  const ringingCount = agents.filter((a) => a.status === 'RINGING').length;
  const busyCount = pool.busy?.length ?? 0;
  const totalAgents = overview?.totalAgents ?? 0;

  const campaignRows = useMemo(() => Object.entries(byCampaign)
    .map(([id, n]) => ({ id, n: Number(n) || 0 }))
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)), [byCampaign]);
  const campaignMax = Math.max(1, ...campaignRows.map((r) => r.n));

  const campaignOptions = useMemo(() => {
    const ids = [...new Set(agents.map((a) => a.campaignId).filter(Boolean))].sort();
    return [{ value: 'all', label: 'All campaigns' }, ...ids.map((id) => ({ value: id, label: campaignName(id) }))];
  }, [agents, campaignName]);

  // A campaign that disappears from the pool resets the filter.
  useEffect(() => {
    if (campaignFilter !== 'all' && !campaignOptions.some((o) => o.value === campaignFilter)) {
      setCampaignFilter('all');
    }
  }, [campaignOptions, campaignFilter]);

  const statusTabs = useMemo(() => [
    { key: 'all', label: `All ${agents.length}` },
    ...STATUS_BUCKETS
      .filter((b) => counts[b.key] > 0 || b.key === 'incall' || b.key === 'available')
      .map((b) => ({ key: b.key, label: `${b.label} ${counts[b.key]}` })),
  ], [agents.length, counts]);

  useEffect(() => {
    if (statusFilter !== 'all' && !statusTabs.some((t) => t.key === statusFilter)) setStatusFilter('all');
  }, [statusTabs, statusFilter]);

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents
      .filter((a) => statusFilter === 'all' || statusKey(a.status) === statusFilter)
      .filter((a) => campaignFilter === 'all' || a.campaignId === campaignFilter)
      .filter((a) => {
        if (!q) return true;
        const hay = [
          realNameOf(a), getAgentId(a), a.phone, a.campaignId, campaignName(a.campaignId),
          ...(Array.isArray(a.licensedStates) ? a.licensedStates : []),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (STATUS_ORDER[statusKey(a.status)] - STATUS_ORDER[statusKey(b.status)])
        || (realNameOf(a) || `~${getAgentId(a)}`).localeCompare(realNameOf(b) || `~${getAgentId(b)}`));
  }, [agents, statusFilter, campaignFilter, query, campaignName]);

  const filtersActive = query.trim() !== '' || statusFilter !== 'all' || campaignFilter !== 'all';
  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setCampaignFilter('all');
  };

  const handleForceRemove = async (a) => {
    const agentId = a.id;
    if (!window.confirm(`FORCE remove ${getAgentName(a)} (${agentId})?`)) return;
    setRemovingId(agentId);
    try {
      const out = await forceRemoveAgent(agentId);
      if (out.success) {
        toast.success('Agent removed');
        await loadShell();
      }
    } catch (err) {
      toast.error(err.message || 'Error');
    } finally {
      setRemovingId(null);
    }
  };

  const copySid = async (sid) => {
    try {
      await navigator.clipboard.writeText(sid);
      toast.success('Call SID copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  if (loading && !overview) return <PageLoader />;

  const firstLoad = loading && !overview;
  const updatedAt = overview?.live?.generatedAt ? timeOf(overview.live.generatedAt) : null;
  const refreshIn = nextRefreshAt ? Math.max(0, Math.ceil((nextRefreshAt - now) / 1000)) : null;
  const poolMix = [
    { key: 'incall', label: 'In call', n: counts.incall },
    { key: 'ringing', label: 'Ringing', n: counts.ringing },
    { key: 'wrapup', label: 'Wrap up', n: counts.wrapup },
    { key: 'available', label: 'Available', n: counts.available },
    { key: 'paused', label: 'Paused', n: counts.paused },
    { key: 'unknown', label: 'Unknown', n: counts.unknown },
  ];
  const poolTotal = Math.max(1, agents.length);
  const utilisation = agents.length ? Math.round(((counts.incall + counts.ringing + counts.wrapup) / agents.length) * 100) : 0;

  const headerActions = (
    <div className={classes.headerActions}>
      <button type="button" className={classes.ghostBtn} onClick={loadShell} disabled={loading}>
        <RefreshCw size={16} className={loading ? shared.spin : ''} /> Refresh
      </button>
    </div>
  );

  return (
    <AdminPageShell
      title="Live Operations"
      description="Monitor live calls, pool status, and online agents in real time."
      icon={Radio}
      category={ADMIN_CATEGORIES.operations}
      actions={headerActions}
    >
      {/* ── Live status bar ──────────────────────────────────── */}
      <motion.div className={`glass ${classes.statusBar}`} variants={presets.child}>
        <div className={classes.statusMain}>
          <span className={classes.liveBadge}>
            <span className={classes.livePulse} aria-hidden="true" /> Live
          </span>
          <span className={classes.updated} aria-live="polite">
            {loading ? (
              <><span className={classes.dotBusy} aria-hidden="true" /> Updating…</>
            ) : (
              <>Updated {updatedAt || '—'}</>
            )}
          </span>
          {refreshIn != null && !loading ? (
            <span className={classes.muted}>Next refresh in {refreshIn}s</span>
          ) : null}
        </div>
        <div className={classes.statusMeta}>
          <span>Source <code>{overview?.live?.source || 'n/a'}</code></span>
          <span>Rows <b>{overview?.live?.rowCount ?? liveCalls.length}</b></span>
        </div>
      </motion.div>

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div className={classes.kpiGrid}>
        <KpiCard
          label="Live agents"
          icon={Users}
          value={totalAgents}
          foot={<span className={classes.kpiFootText}>{utilisation}% engaged · {counts.paused} paused</span>}
          tone="neutral"
          loading={firstLoad}
          variants={presets.child}
        />
        <KpiCard
          label="Available"
          icon={Radio}
          value={availableCount}
          foot={<span className={classes.kpiFootText}>Ready to take the next call</span>}
          tone="brand"
          loading={firstLoad}
          variants={presets.child}
        />
        <KpiCard
          label="Ringing"
          icon={PhoneIncoming}
          value={ringingCount}
          foot={<span className={classes.kpiFootText}>Calls being offered now</span>}
          tone="yellow"
          loading={firstLoad}
          variants={presets.child}
        />
        <KpiCard
          label="Busy"
          icon={Phone}
          value={busyCount}
          foot={<span className={classes.kpiFootText}>{counts.wrapup} in wrap up</span>}
          tone="cyan"
          loading={firstLoad}
          variants={presets.child}
        />
        <KpiCard
          label="Longest live call"
          icon={Timer}
          value={activeCallSecs.length ? formatDuration(longestSec) : '—'}
          live={activeCallSecs.length > 0}
          foot={(
            <span className={classes.kpiFootText}>
              {activeCallSecs.length
                ? `${activeCallSecs.length} on call · avg ${formatDuration(avgSec)}`
                : 'No calls in progress'}
            </span>
          )}
          tone="violet"
          loading={firstLoad}
          variants={presets.child}
        />
      </div>

      {/* ── Live calls + pool ────────────────────────────────── */}
      <div className={classes.bento}>
        <motion.section className={`glass ${classes.card}`} variants={presets.child} aria-labelledby="calls-title">
          <div className={classes.cardHead}>
            <div>
              <h2 id="calls-title" className={classes.cardTitle}>
                Live calls
                {liveCalls.length ? <span className={classes.countBadge}>{liveCalls.length}</span> : null}
              </h2>
              <p className={classes.cardSub}>Timers tick every second. Longest calls first.</p>
            </div>
            <div className={classes.legend} aria-hidden="true">
              <span><i className={classes.legendLive} /> Under 10 min</span>
              <span><i className={classes.legendWarm} /> 10 min+</span>
              <span><i className={classes.legendHot} /> 20 min+</span>
            </div>
          </div>

          {firstLoad ? (
            <div className={classes.callSkeleton}>
              <span /><span /><span />
            </div>
          ) : callRows.length === 0 ? (
            <div className={classes.empty}>
              <span className={classes.emptyIcon}><Phone size={22} /></span>
              <h4>No active calls right now</h4>
              <p>Live calls will appear here when agents are on the phone.</p>
            </div>
          ) : (
            <ul className={classes.callList}>
              {callRows.map(({ row, sec }, idx) => {
                const id = getAgentId(row);
                const agent = agentsById.get(row.agentId);
                const name = realNameOf(row, agent);
                const tone = callTone(sec, row.status);
                return (
                  <li key={`${row.agentId}-${row.callSid || idx}`} className={`${classes.callRow} ${classes[`callRow_${tone}`]}`}>
                    <div className={classes.callAgent}>
                      <span className={classes.avatar}>
                        {name ? initialsOf(name) : <UserRound size={16} aria-hidden="true" />}
                        <i className={`${classes.avatarDot} ${classes[`dot_${statusKey(row.status)}`]}`} aria-hidden="true" />
                      </span>
                      <span className={classes.agentText}>
                        <span className={classes.agentName}>
                          <span className={`${classes.agentNameText} ${name ? '' : classes.agentNameMissing}`} title={name || 'No name on this agent profile'}>
                            {name || 'Unnamed agent'}
                          </span>
                          {agent?.flagged ? (
                            <span className={classes.flag} title={agent.flagReason || 'Flagged'}><Flag size={10} /> Flagged</span>
                          ) : null}
                        </span>
                        <span className={classes.agentId} title={id}>{id}</span>
                        {row.phone || agent?.phone ? (
                          <a href={`tel:${row.phone || agent.phone}`} className={classes.agentPhone}>{row.phone || agent.phone}</a>
                        ) : null}
                      </span>
                    </div>

                    <div className={classes.callInfo}>
                      <span className={classes.campaignTag}>
                        <i aria-hidden="true" /> {campaignName(row.campaignId)}
                      </span>
                      {row.from || row.to ? (
                        <span className={classes.route}>
                          <span title={row.from || undefined}>{formatParty(row.from)}</span>
                          <ArrowRight size={12} aria-label="to" />
                          <span title={row.to || undefined}>{formatParty(row.to)}</span>
                        </span>
                      ) : null}
                      <span className={classes.sidLine}>
                        <span className={classes.mono}>{row.callSid || '—'}</span>
                        {row.callSid ? (
                          <button type="button" className={classes.iconBtn} onClick={() => copySid(row.callSid)} aria-label="Copy call SID" title="Copy call SID">
                            <Copy size={12} />
                          </button>
                        ) : null}
                      </span>
                    </div>

                    <div className={classes.callStatus}>
                      <StatusPill status={row.status} />
                      <span className={classes.startedAt}>
                        {row.startedAt ? `Started ${timeOf(row.startedAt)}` : `${row.durationSec || 0}s at last refresh`}
                      </span>
                    </div>

                    <div className={classes.callTime}>
                      <CallTimer seconds={sec} status={row.status} />
                      <span className={classes.timeTrack} aria-hidden="true">
                        <span
                          className={classes[`track_${tone}`]}
                          style={{ width: `${Math.min(100, (sec / VERY_LONG_CALL_SEC) * 100)}%` }}
                        />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>

        <motion.section className={`glass ${classes.card} ${classes.sideCard}`} variants={presets.child} aria-labelledby="pool-title">
          <div className={classes.cardHead}>
            <div>
              <h2 id="pool-title" className={classes.cardTitle}>Pool status</h2>
              <p className={classes.cardSub}>{agents.length} online · {utilisation}% engaged</p>
            </div>
          </div>
          <div className={classes.mixBar} role="img" aria-label={poolMix.map((m) => `${m.label} ${m.n}`).join(', ')}>
            {poolMix.map((m) => (
              <span key={m.key} className={classes[`mix_${m.key}`]} style={{ flexGrow: m.n }} />
            ))}
          </div>
          <ul className={classes.mixList}>
            {poolMix.filter((m) => m.n > 0 || ['incall', 'ringing', 'available'].includes(m.key)).map((m) => (
              <li key={m.key}>
                <i className={classes[`mix_${m.key}`]} aria-hidden="true" />
                <span>{m.label}</span>
                <b>{m.n}</b>
                <em>{Math.round((m.n / poolTotal) * 100)}%</em>
              </li>
            ))}
          </ul>

          <div className={classes.campaignBlock}>
            <h3 className={classes.miniTitle}><Headphones size={14} /> Agents by campaign</h3>
            {campaignRows.length === 0 ? (
              <div className={`${classes.empty} ${classes.emptySm}`}>
                <span className={classes.emptyIcon}><Users size={20} /></span>
                <h4>No agents in pool</h4>
                <p>Agents will appear here when they go online.</p>
              </div>
            ) : (
              <ul className={classes.campaignList}>
                {campaignRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`${classes.campaignRow} ${campaignFilter === r.id ? classes.campaignRowActive : ''}`}
                      onClick={() => setCampaignFilter((cur) => (cur === r.id ? 'all' : r.id))}
                      aria-pressed={campaignFilter === r.id}
                      title={campaignFilter === r.id ? 'Show all campaigns' : `Show only ${campaignName(r.id)} agents`}
                    >
                      <span className={classes.campaignName}>{campaignName(r.id)}</span>
                      <span className={classes.campaignVal}>{r.n}</span>
                      <span className={classes.campaignTrack}>
                        <span style={{ width: `${(r.n / campaignMax) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.section>
      </div>

      {/* ── Active agents ────────────────────────────────────── */}
      <motion.section className={`glass ${classes.card}`} variants={presets.child} aria-labelledby="agents-title">
        <div className={classes.cardHead}>
          <div>
            <h2 id="agents-title" className={classes.cardTitle}>Active agents</h2>
            <p className={classes.cardSub}>
              {filtersActive
                ? `Showing ${filteredAgents.length} of ${agents.length} agents`
                : 'Everyone in the routing pool, busiest first.'}
            </p>
          </div>
          <div className={classes.tools}>
            <label className={classes.search}>
              <Search size={15} aria-hidden="true" />
              <span className={classes.srOnly}>Search agents</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ID, phone, state…"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>
              ) : null}
            </label>
            <CustomSelect options={campaignOptions} value={campaignFilter} onChange={setCampaignFilter} menuAlign="right" />
          </div>
        </div>

        <div className={classes.tabsRow}>
          <SlidingTabs tabs={statusTabs} activeKey={statusFilter} onChange={setStatusFilter} ariaLabel="Filter agents by status" />
          {filtersActive ? (
            <button type="button" className={classes.linkBtn} onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>

        <div className={classes.tableScroll}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Campaign</th>
                <th scope="col">Pool</th>
                <th scope="col">Status</th>
                <th scope="col">Licensed States</th>
                <th scope="col"><span className={classes.srOnly}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {firstLoad ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} className={classes.skelRow}>
                    <td colSpan={6}><span /></td>
                  </tr>
                ))
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={classes.empty}>
                      <span className={classes.emptyIcon}><Users size={22} /></span>
                      <h4>No agents online</h4>
                      <p>Online agents will appear in this table.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={classes.empty}>
                      <span className={classes.emptyIcon}><Search size={20} /></span>
                      <h4>No agents match these filters</h4>
                      <p><button type="button" className={classes.linkBtn} onClick={clearFilters}>Clear filters</button></p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAgents.map((a) => {
                  const id = getAgentId(a);
                  const call = callsByAgent.get(a.id);
                  const name = realNameOf(a, call);
                  const callSec = call ? liveSeconds(call, now, sync) : null;
                  const states = Array.isArray(a.licensedStates) ? a.licensedStates : [];
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className={classes.agentCell}>
                          <span className={classes.avatar}>
                            {name ? initialsOf(name) : <UserRound size={16} aria-hidden="true" />}
                            <i className={`${classes.avatarDot} ${classes[`dot_${statusKey(a.status)}`]}`} aria-hidden="true" />
                          </span>
                          <span className={classes.agentText}>
                            <span className={classes.agentName}>
                              <span className={`${classes.agentNameText} ${name ? '' : classes.agentNameMissing}`} title={name || 'No name on this agent profile'}>
                                {name || 'Unnamed agent'}
                              </span>
                              {a.flagged ? (
                                <span className={classes.flag} title={a.flagReason || 'Flagged'}><Flag size={10} /> Flagged</span>
                              ) : null}
                            </span>
                            <span className={classes.agentId} title={id}>{id}</span>
                            {a.phone ? (
                              <a href={`tel:${a.phone}`} className={classes.agentPhone}>{a.phone}</a>
                            ) : (
                              <span className={`${classes.agentPhone} ${classes.agentPhoneNone}`}>No phone</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={classes.campaignCell} title={a.campaignId || undefined}>{campaignName(a.campaignId)}</span>
                      </td>
                      <td>
                        <span className={classes.poolTag}>{POOL_LABELS[a.pool] || a.pool || '—'}</span>
                      </td>
                      <td>
                        <div className={classes.statusCell}>
                          <StatusPill status={a.status} />
                          {call && callSec != null ? (
                            <span className={classes.inlineTimer}>
                              <PhoneCall size={12} aria-hidden="true" />
                              <CallTimer seconds={callSec} status={call.status} size="sm" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {states.length > 0 ? (
                          <span className={classes.states} title={states.join(', ')}>
                            {states.slice(0, 6).map((s) => <span key={s} className={classes.stateChip}>{s}</span>)}
                            {states.length > 6 ? <span className={classes.stateMore}>+{states.length - 6}</span> : null}
                          </span>
                        ) : (
                          <span className={classes.muted}>None</span>
                        )}
                      </td>
                      <td className={classes.actionsCell}>
                        <button
                          type="button"
                          className={classes.removeBtn}
                          title="Force remove agent from pool"
                          aria-label={`Force remove ${name || id} from pool`}
                          disabled={removingId === a.id}
                          onClick={() => handleForceRemove(a)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.section>
    </AdminPageShell>
  );
}
