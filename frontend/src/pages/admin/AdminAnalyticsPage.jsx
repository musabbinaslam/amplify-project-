import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp, Phone, RefreshCw, Activity, CircleDollarSign, Play, FileSpreadsheet,
  BadgeCheck, Search, X, ChevronRight, ChevronUp, ChevronDown, Megaphone, Users,
  CalendarDays, Clock3, Wallet, Flag, UserPlus, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import {
  getAdminOverviewLite,
  getAdminAnalyticsBundle,
  getAdminAnalyticsDrilldown,
  getAdminSignupAnalytics,
  refundAdminCall,
  listAdminCallContests,
  updateAdminCallLogDisposition,
} from '../../services/adminService';
import useAuthStore from '../../store/authStore';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { AdminDrilldownTrendChart } from '../../components/admin/AdminCharts';
import { AdminActionModal } from '../../components/admin/ContestReviewCard';
import AdminExportModal from '../../components/admin/AdminExportModal';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import CustomSelect from '../../components/ui/CustomSelect';
import SlidingTabs from '../../components/ui/SlidingTabs';
import NumberPopIn from '../../components/ui/NumberPopIn';
import { RecordingModal } from '../../components/modals/RecordingModal';
import { CallLogDispositionBadge } from '../../components/callLogs/CallLogStatusCells';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminAnalyticsPage.module.css';

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'UTC', label: 'UTC' },
];

const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom' },
];

const BREAKDOWN_TABS = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'agents', label: 'Agents' },
];

const CHART_MODES = [
  { key: 'volume', label: 'Call volume' },
  { key: 'spend', label: 'Spend' },
];

const SORT_FIELD_OPTIONS = [
  { value: 'date', label: 'Sort: Date' },
  { value: 'duration', label: 'Sort: Duration' },
];

const AGENT_PAGE_SIZE = 15;

const TOOLTIP_STYLE = {
  background: 'color-mix(in srgb, var(--surface-container-highest) 94%, transparent)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  fontSize: 13,
  color: 'var(--text-primary)',
};

const pct = (v) => Math.round((Number(v) || 0) * 100);
const money = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = (v) => {
  const n = Number(v) || 0;
  if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const formatDay = (day) => {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const initialsOf = (name) => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((p) => p[0]?.toUpperCase())
  .join('') || '?';

const VERTICAL_COLORS = {
  'final expense': 'var(--brand-text)',
  'spanish final expense': 'color-mix(in srgb, var(--brand-text) 45%, var(--accent-cyan))',
  medicare: 'var(--accent-cyan)',
  aca: 'var(--accent-yellow)',
  leads: '#a78bfa',
  'not specified': 'color-mix(in srgb, var(--text-primary) 28%, transparent)',
};
const FALLBACK_COLORS = ['#f472b6', '#fb923c', '#60a5fa', '#34d399'];
const verticalColor = (name, i = 0) => VERTICAL_COLORS[String(name || '').toLowerCase()] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];

/* eslint-disable react/prop-types -- small page-local presentational components */

/** Tiny inline trend line for KPI cards. */
function Sparkline({ values, tone = 'brand' }) {
  const pts = (values || []).map((v) => Number(v) || 0);
  if (pts.length < 2) return <span className={classes.sparkEmpty} aria-hidden />;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = max - min || 1;
  const w = 120;
  const h = 36;
  const step = w / (pts.length - 1);
  const coords = pts.map((v, i) => [i * step, h - 3 - ((v - min) / span) * (h - 6)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg className={`${classes.spark} ${classes[`spark_${tone}`]}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} className={classes.sparkArea} />
      <path d={line} className={classes.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({ label, value, icon: Icon, foot, spark, tone, loading, variants }) {
  return (
    <motion.div className={`glass ${classes.kpi}`} variants={variants}>
      <div className={classes.kpiHead}>
        <span className={classes.kpiLabel}>{label}</span>
        <span className={`${classes.kpiIcon} ${tone ? classes[`kpiIcon_${tone}`] : ''}`}><Icon size={16} /></span>
      </div>
      <div className={classes.kpiValue}>
        {loading ? <span className={classes.skelValue} /> : <NumberPopIn value={value} />}
      </div>
      <div className={classes.kpiFoot}>
        <span className={classes.kpiFootText}>{loading ? <span className={classes.skelLine} /> : foot}</span>
        {!loading && spark ? <Sparkline values={spark} tone={tone} /> : null}
      </div>
    </motion.div>
  );
}

function RateCell({ value, tone = 'brand' }) {
  const p = Math.max(0, Math.min(100, pct(value)));
  return (
    <span className={classes.rateCell}>
      <span className={classes.rateNum}>{p}%</span>
      <span className={classes.rateTrack} aria-hidden>
        <span className={`${classes.rateFill} ${classes[`rateFill_${tone}`]}`} style={{ width: `${p}%` }} />
      </span>
    </span>
  );
}

function SortTh({ label, field, sort, onSort, align = 'left' }) {
  const active = sort.key === field;
  const Icon = active && sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      scope="col"
      className={align === 'right' ? classes.thRight : undefined}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={`${classes.sortBtn} ${active ? classes.sortBtnActive : ''}`} onClick={() => onSort(field)}>
        {label}
        <Icon size={13} className={classes.sortIcon} aria-hidden />
      </button>
    </th>
  );
}

function VolumeChart({ data, mode, reduceMotion }) {
  const rows = useMemo(() => (data || []).map((d) => {
    const total = Number(d.totalCalls) || 0;
    const answered = Number(d.answeredCalls) || 0;
    const missed = Number.isFinite(Number(d.missedCalls)) ? Number(d.missedCalls) : Math.max(0, total - answered);
    const billable = Math.min(answered, Number(d.billableCalls) || 0);
    return {
      day: d.day,
      billable,
      answered: Math.max(0, answered - billable),
      missed,
      totalCost: Number(d.totalCost) || 0,
    };
  }), [data]);

  const axis = { tick: { fill: 'var(--text-secondary)', fontSize: 12 }, axisLine: false, tickLine: false };

  if (mode === 'spend') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="analyticsSpendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatDay} {...axis} />
          <YAxis tickFormatter={(v) => moneyShort(v)} width={64} {...axis} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={formatDay} formatter={(v) => [money(v), 'Spend']} cursor={{ stroke: 'var(--glass-border)' }} />
          <Area type="monotone" dataKey="totalCost" stroke="var(--brand-text)" strokeWidth={2} fill="url(#analyticsSpendFill)" isAnimationActive={!reduceMotion} animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={formatDay}
          cursor={{ fill: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}
          formatter={(v, name) => [v, { answered: 'Answered, not billable', missed: 'Missed', billable: 'Billable' }[name] || name]}
        />
        <Bar dataKey="billable" stackId="calls" fill="var(--brand-text)" isAnimationActive={!reduceMotion} animationDuration={700} />
        <Bar dataKey="answered" stackId="calls" fill="var(--accent-cyan)" isAnimationActive={!reduceMotion} animationDuration={700} />
        <Bar dataKey="missed" stackId="calls" fill="color-mix(in srgb, var(--text-primary) 24%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={!reduceMotion} animationDuration={700} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
function SignupTrendChart({ byDay, verticals, reduceMotion }) {
  const rows = useMemo(() => (byDay || []).map((d) => ({ day: d.day, ...(d.byVertical || {}) })), [byDay]);
  const axis = { tick: { fill: 'var(--text-secondary)', fontSize: 12 }, axisLine: false, tickLine: false };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={formatDay} {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={formatDay}
          cursor={{ fill: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}
        />
        {verticals.map((v, i) => (
          <Bar
            key={v.vertical}
            dataKey={v.vertical}
            stackId="signups"
            fill={verticalColor(v.vertical, i)}
            radius={i === verticals.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={!reduceMotion}
            animationDuration={700}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
/* eslint-enable react/prop-types */

export default function AdminAnalyticsPage() {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const [rangePreset, setRangePreset] = useState('7d');
  const [timezone, setTimezone] = useState(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      return TIMEZONE_OPTIONS.some((o) => o.value === detected) ? detected : 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  });
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [callStats, setCallStats] = useState(null);
  const [campaignStats, setCampaignStats] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [analyticsMeta, setAnalyticsMeta] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownSortOrder, setDrilldownSortOrder] = useState('desc');
  const [drilldownSortField, setDrilldownSortField] = useState('date');
  const [drilldownDay, setDrilldownDay] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [activeRecording, setActiveRecording] = useState(null);
  const [refundingLogId, setRefundingLogId] = useState(null);
  const [updatingDispositionId, setUpdatingDispositionId] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [contestFilter] = useState('pending');
  const [chartMode, setChartMode] = useState('volume');
  const [signupStats, setSignupStats] = useState(null);
  const [signupLoading, setSignupLoading] = useState(true);
  const [signupError, setSignupError] = useState('');
  const [breakdownTab, setBreakdownTab] = useState('campaigns');
  const [campaignSort, setCampaignSort] = useState({ key: 'calls', dir: 'desc' });
  const [agentSort, setAgentSort] = useState({ key: 'calls', dir: 'desc' });
  const [agentLimit, setAgentLimit] = useState(AGENT_PAGE_SIZE);
  const drawerRef = useRef(null);

  const getRange = useCallback(() => {
    if (rangePreset === 'custom') {
      return { from: customStart, to: customEnd };
    }
    const now = new Date();
    if (rangePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      return { from: yStr, to: yStr };
    }
    const end = now.toISOString().slice(0, 10);
    const days = rangePreset === 'today' ? 0 : rangePreset === '30d' ? 29 : 6;
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - days);
    const from = fromDate.toISOString().slice(0, 10);
    return { from, to: end };
  }, [rangePreset, customStart, customEnd]);

  const loadShell = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await getAdminOverviewLite();
      setOverview(ov);
    } catch (e) {
      toast.error(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const range = getRange();
      const bundle = await getAdminAnalyticsBundle({ ...range, tz: timezone });
      setCallStats({
        from: bundle.from,
        to: bundle.to,
        summary: bundle.summary,
        byDay: bundle.byDay,
      });
      setCampaignStats(bundle.campaigns || []);
      setAgentStats(bundle.agents || []);
      setAnalyticsMeta(bundle.meta || null);
    } catch (e) {
      toast.error(e.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getRange, timezone]);

  const loadSignups = useCallback(async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      const range = getRange();
      const out = await getAdminSignupAnalytics({ ...range, tz: timezone });
      setSignupStats(out);
    } catch (e) {
      setSignupStats(null);
      setSignupError(e.message || 'Failed to load signup analytics');
    } finally {
      setSignupLoading(false);
    }
  }, [getRange, timezone]);

  const loadDrilldown = useCallback(async (type, id) => {
    if (!type || !id) {
      setDrilldown(null);
      return;
    }
    setDrilldownLoading(true);
    try {
      const range = getRange();
      const out = await getAdminAnalyticsDrilldown({ type, id, ...range, tz: timezone });
      setDrilldown(out);
    } catch (e) {
      toast.error(e.message || 'Failed to load drilldown');
    } finally {
      setDrilldownLoading(false);
    }
  }, [getRange, timezone]);

  useEffect(() => {
    if (selectedCampaign) {
      loadDrilldown('campaign', selectedCampaign);
      return;
    }
    if (selectedAgent) {
      loadDrilldown('agent', selectedAgent);
      return;
    }
    setDrilldown(null);
  }, [selectedCampaign, selectedAgent, rangePreset, loadDrilldown]);

  useEffect(() => {
    refreshUserRole?.();
    loadShell();
  }, [loadShell, refreshUserRole]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, timezone]);

  useEffect(() => {
    loadSignups();
  }, [loadSignups]);

  const drawerOpen = Boolean(selectedCampaign || selectedAgent);

  const closeDrawer = useCallback(() => {
    setSelectedCampaign('');
    setSelectedAgent('');
    setDrilldownDay('');
  }, []);

  // Escape closes the drilldown panel (unless a modal on top of it is open);
  // lock page scroll while it is open.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !actionModal && !activeRecording && !exportModalOpen) closeDrawer();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => drawerRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [drawerOpen, closeDrawer, actionModal, activeRecording, exportModalOpen]);

  const statsSummary = useMemo(() => callStats?.summary || {
    totalCalls: 0,
    answerRate: 0,
    billableRate: 0,
    totalCost: 0,
  }, [callStats?.summary]);

  const derived = useMemo(() => {
    const total = Number(statsSummary.totalCalls) || 0;
    const answered = Number.isFinite(Number(statsSummary.answeredCalls))
      ? Number(statsSummary.answeredCalls)
      : Math.round((statsSummary.answerRate || 0) * total);
    const billable = Number.isFinite(Number(statsSummary.billableCalls))
      ? Number(statsSummary.billableCalls)
      : Math.round((statsSummary.billableRate || 0) * total);
    const missed = Number.isFinite(Number(statsSummary.missedCalls))
      ? Number(statsSummary.missedCalls)
      : Math.max(0, total - answered);
    const cost = Number(statsSummary.totalCost) || 0;
    const days = Math.max(1, (callStats?.byDay || []).length);
    const byDay = callStats?.byDay || [];
    return {
      total,
      answered,
      missed,
      billable,
      answeredNotBillable: Math.max(0, answered - billable),
      cost,
      perDay: total / days,
      costPerBillable: billable > 0 ? cost / billable : 0,
      sparkCalls: byDay.map((d) => d.totalCalls),
      sparkAnswer: byDay.map((d) => (d.totalCalls ? (d.answeredCalls || 0) / d.totalCalls : 0)),
      sparkBillable: byDay.map((d) => d.billableCalls || 0),
      sparkCost: byDay.map((d) => d.totalCost || 0),
    };
  }, [statsSummary, callStats?.byDay]);

  const rangeLabel = useMemo(() => {
    if (rangePreset === 'custom') {
      return customStart === customEnd ? formatDay(customStart) : `${formatDay(customStart)} – ${formatDay(customEnd)}`;
    }
    return RANGE_PRESETS.find((r) => r.key === rangePreset)?.label || 'Last 7 days';
  }, [rangePreset, customStart, customEnd]);

  const tzLabel = TIMEZONE_OPTIONS.find((o) => o.value === timezone)?.label || timezone;

  const sortRows = (rows, sort, getName) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === 'name') return getName(a).localeCompare(getName(b)) * dir;
      const av = Number(sort.key === 'balance' ? a.walletBalanceCents : a[sort.key]) || 0;
      const bv = Number(sort.key === 'balance' ? b.walletBalanceCents : b[sort.key]) || 0;
      return (av - bv) * dir;
    });
  };

  const toggleSort = (setter) => (field) => setter((prev) => (
    prev.key === field
      ? { key: field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key: field, dir: field === 'name' ? 'asc' : 'desc' }
  ));

  const sortedCampaigns = useMemo(
    () => sortRows(campaignStats, campaignSort, (r) => String(r.campaignLabel || r.campaign || '')),
    [campaignStats, campaignSort],
  );

  const filteredAgentStats = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return agentStats;
    return agentStats.filter((row) => {
      const name = getAgentName(row).toLowerCase();
      const id = getAgentId(row).toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [agentStats, agentSearch]);

  const sortedAgents = useMemo(
    () => sortRows(filteredAgentStats, agentSort, (r) => getAgentName(r)),
    [filteredAgentStats, agentSort],
  );

  useEffect(() => {
    setAgentLimit(AGENT_PAGE_SIZE);
  }, [agentSearch, agentStats]);

  const topCampaigns = useMemo(
    () => [...campaignStats].sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0)).slice(0, 4),
    [campaignStats],
  );

  const filteredSortedDrilldownLogs = useMemo(() => {
    const allRaw = Array.isArray(drilldown?.recentLogs) ? [...drilldown.recentLogs] : [];
    const all = allRaw.map(log => {
      let mappedName = getAgentName(log);
      if (mappedName === getAgentId(log)) {
        mappedName = overview?.agents?.find(a => a.id === log.agentId)?.displayName || agentStats?.find(a => a.agentId === log.agentId)?.agentName || mappedName;
      }
      return { ...log, agentName: mappedName };
    });
    const dayFiltered = drilldownDay
      ? all.filter((log) => {
        const dt = new Date(log?.createdAt || 0);
        if (Number.isNaN(dt.getTime())) return false;
        const localY = dt.getFullYear();
        const localM = String(dt.getMonth() + 1).padStart(2, '0');
        const localD = String(dt.getDate()).padStart(2, '0');
        return `${localY}-${localM}-${localD}` === drilldownDay;
      })
      : all;

    dayFiltered.sort((a, b) => {
      if (drilldownSortField === 'duration') {
        const aDur = Number(a?.duration || 0);
        const bDur = Number(b?.duration || 0);
        return drilldownSortOrder === 'asc' ? aDur - bDur : bDur - aDur;
      }
      const aTs = new Date(a?.createdAt || 0).getTime();
      const bTs = new Date(b?.createdAt || 0).getTime();
      const aSafe = Number.isFinite(aTs) ? aTs : 0;
      const bSafe = Number.isFinite(bTs) ? bTs : 0;
      return drilldownSortOrder === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
    return dayFiltered;
  }, [drilldown?.recentLogs, drilldownDay, drilldownSortOrder, drilldownSortField, overview?.agents, agentStats]);

  const handleDispositionUpdate = async (logId, val) => {
    const log = drilldown?.recentLogs?.find((l) => l.id === logId);
    if (!log) return;
    setUpdatingDispositionId(logId);
    try {
      await updateAdminCallLogDisposition(log.agentId || log.uid, logId, val);
      setDrilldown(prev => ({
        ...prev,
        recentLogs: prev.recentLogs.map(l => l.id === logId ? { ...l, disposition: val } : l),
      }));
      toast.success('Disposition updated');
    } catch {
      toast.error('Failed to update disposition');
    } finally {
      setUpdatingDispositionId(null);
    }
  };

  const openRefundCallModal = (log) => {
    if (log.contestStatus === 'pending') {
      toast.error('Resolve the pending contest first');
      return;
    }
    setActionNote('');
    setActionModal({
      type: 'refund_call',
      context: {
        log,
        agentName: log.agentName || log.agentId,
        amount: Number(log.cost || 0).toFixed(2),
      },
    });
  };

  const submitActionModal = async () => {
    const trimmed = actionNote.trim();
    if (trimmed.length < 10) {
      toast.error('Note must be at least 10 characters');
      return;
    }
    if (!actionModal) return;

    setActionSubmitting(true);
    try {
      if (actionModal.type === 'refund_call') {
        const { log } = actionModal.context;
        setRefundingLogId(log.id);
        await refundAdminCall({
          agentId: log.agentId,
          callLogId: log.id,
          reason: trimmed,
        });
        toast.success('Call refunded');
        setDrilldown((prev) => {
          if (!prev?.recentLogs) return prev;
          return {
            ...prev,
            recentLogs: prev.recentLogs.map((r) =>
              r.id === log.id ? { ...r, refunded: true, contestStatus: r.contestStatus } : r,
            ),
          };
        });
        void listAdminCallContests(contestFilter, 50);
        setRefundingLogId(null);
      }
      setActionModal(null);
      setActionNote('');
    } catch (err) {
      toast.error(err.message || 'Action failed');
      if (actionModal.type === 'refund_call') setRefundingLogId(null);
    } finally {
      setActionSubmitting(false);
    }
  };

  const closeActionModal = () => {
    if (actionSubmitting) return;
    setActionModal(null);
    setActionNote('');
  };

  const openCampaign = (id) => {
    setSelectedCampaign(id);
    setSelectedAgent('');
    setDrilldownDay('');
  };

  const openAgent = (id) => {
    setSelectedAgent(id);
    setSelectedCampaign('');
    setDrilldownDay('');
  };

  const onRowKey = (open) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const refreshAll = async () => {
    await loadShell();
    await Promise.all([loadAnalytics(), loadSignups()]);
  };

  if (loading && !overview) return <PageLoader />;

  const selectedAgentRow = selectedAgent ? agentStats.find((a) => a.agentId === selectedAgent) : null;
  const selectedCampaignRow = selectedCampaign ? campaignStats.find((c) => c.campaign === selectedCampaign) : null;
  const drawerTitle = selectedCampaign
    ? (selectedCampaignRow?.campaignLabel || selectedCampaign)
    : (overview?.agents?.find((a) => a.id === selectedAgent)?.displayName || selectedAgentRow?.agentName || selectedAgent);

  const updatedAt = analyticsMeta?.generatedAt ? new Date(analyticsMeta.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const visibleAgents = sortedAgents.slice(0, agentLimit);
  const outcomeTotal = Math.max(1, derived.total);

  const headerActions = (
    <div className={classes.headerActions}>
      <button type="button" className={classes.ghostBtn} onClick={() => setExportModalOpen(true)} title="Export to Excel (.xlsx)">
        <FileSpreadsheet size={16} /> Export Excel
      </button>
      <button type="button" className={classes.ghostBtn} onClick={refreshAll} disabled={loading || analyticsLoading}>
        <RefreshCw size={16} className={loading || analyticsLoading ? shared.spin : ''} /> Refresh
      </button>
    </div>
  );

  return (
    <>
      <AdminPageShell
        title="Analytics & Reports"
        description="Call trends, campaign and agent performance, and drilldown reports."
        icon={TrendingUp}
        category={ADMIN_CATEGORIES.operations}
        actions={headerActions}
      >
        {/* ── Filter bar ───────────────────────────────────────── */}
        <motion.div className={`glass ${classes.filterBar}`} variants={presets.child}>
          <div className={classes.filterMain}>
            <SlidingTabs tabs={RANGE_PRESETS} activeKey={rangePreset} onChange={setRangePreset} ariaLabel="Date range" />
            {rangePreset === 'custom' ? (
              <div className={classes.customRange}>
                <CalendarDays size={15} aria-hidden className={classes.mutedIcon} />
                <input type="date" className={classes.dateInput} value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} aria-label="Custom range start" />
                <span className={classes.muted}>to</span>
                <input type="date" className={classes.dateInput} value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} aria-label="Custom range end" />
              </div>
            ) : null}
          </div>
          <div className={classes.filterSide}>
            <span className={classes.updated} aria-live="polite">
              {analyticsLoading ? (
                <><span className={classes.liveDotBusy} /> Updating…</>
              ) : (
                <><span className={classes.liveDot} /> {updatedAt ? `Updated ${updatedAt}` : 'Up to date'}</>
              )}
            </span>
            <CustomSelect options={TIMEZONE_OPTIONS} value={timezone} onChange={setTimezone} menuAlign="right" />
          </div>
        </motion.div>

        {/* ── KPIs ─────────────────────────────────────────────── */}
        <div className={classes.kpiGrid}>
          <KpiCard
            label="Total calls"
            icon={Phone}
            value={derived.total}
            foot={`${derived.perDay.toFixed(derived.perDay < 10 ? 1 : 0)} per day avg`}
            spark={derived.sparkCalls}
            tone="neutral"
            loading={analyticsLoading}
            variants={presets.child}
          />
          <KpiCard
            label="Answer rate"
            icon={Activity}
            value={`${pct(statsSummary.answerRate)}%`}
            foot={`${derived.answered} answered · ${derived.missed} missed`}
            spark={derived.sparkAnswer}
            tone="cyan"
            loading={analyticsLoading}
            variants={presets.child}
          />
          <KpiCard
            label="Billable rate"
            icon={BadgeCheck}
            value={`${pct(statsSummary.billableRate)}%`}
            foot={`${derived.billable} billable calls`}
            spark={derived.sparkBillable}
            tone="brand"
            loading={analyticsLoading}
            variants={presets.child}
          />
          <KpiCard
            label="Total spend"
            icon={CircleDollarSign}
            value={money(derived.cost)}
            foot={derived.billable ? `${money(derived.costPerBillable)} per billable call` : 'No billable calls yet'}
            spark={derived.sparkCost}
            tone="yellow"
            loading={analyticsLoading}
            variants={presets.child}
          />
          <KpiCard
            label="New signups"
            icon={UserPlus}
            value={signupStats?.summary?.signups ?? 0}
            foot={signupError
              ? 'Unavailable'
              : `${signupStats?.summary?.spendingAgents ?? 0} started spending · ${pct(signupStats?.summary?.conversionRate)}%`}
            spark={(signupStats?.byDay || []).map((d) => d.total)}
            tone="violet"
            loading={signupLoading}
            variants={presets.child}
          />
        </div>

        {/* ── Trend + outcome mix ──────────────────────────────── */}
        <div className={classes.bento}>
          <motion.section className={`glass ${classes.card} ${classes.chartCard}`} variants={presets.child} aria-labelledby="trend-title">
            <div className={classes.cardHead}>
              <div>
                <h2 id="trend-title" className={classes.cardTitle}>Call trends</h2>
                <p className={classes.cardSub}>{rangeLabel} · {tzLabel}</p>
              </div>
              <SlidingTabs tabs={CHART_MODES} activeKey={chartMode} onChange={setChartMode} ariaLabel="Chart metric" />
            </div>
            {chartMode === 'volume' ? (
              <div className={classes.legend}>
                <span><i className={classes.legendBrand} />Billable</span>
                <span><i className={classes.legendCyan} />Answered, not billable</span>
                <span><i className={classes.legendMuted} />Missed</span>
              </div>
            ) : null}
            {analyticsLoading ? (
              <div className={classes.chartSkeleton}><span /><span /><span /><span /><span /><span /><span /></div>
            ) : derived.total === 0 ? (
              <div className={classes.empty}>
                <TrendingUp size={28} />
                <h4>No calls in this range</h4>
                <p>Try a wider date range, or refresh after more activity.</p>
              </div>
            ) : (
              <VolumeChart data={callStats?.byDay} mode={chartMode} reduceMotion={reduceMotion} />
            )}
          </motion.section>

          <motion.section className={`glass ${classes.card} ${classes.mixCard}`} variants={presets.child} aria-labelledby="mix-title">
            <h2 id="mix-title" className={classes.cardTitle}>Outcome mix</h2>
            <p className={classes.cardSub}>What happened to every call</p>
            {analyticsLoading ? (
              <div className={classes.mixSkeleton}><span /><span /><span /></div>
            ) : (
              <>
                <div className={classes.mixBar} role="img" aria-label={`${derived.billable} billable, ${derived.answeredNotBillable} answered not billable, ${derived.missed} missed`}>
                  <span className={classes.mixBillable} style={{ flexGrow: derived.billable }} />
                  <span className={classes.mixAnswered} style={{ flexGrow: derived.answeredNotBillable }} />
                  <span className={classes.mixMissed} style={{ flexGrow: derived.missed }} />
                </div>
                <ul className={classes.mixList}>
                  <li><i className={classes.mixBillable} /><span>Billable</span><b>{derived.billable}</b><em>{Math.round((derived.billable / outcomeTotal) * 100)}%</em></li>
                  <li><i className={classes.mixAnswered} /><span>Answered, not billable</span><b>{derived.answeredNotBillable}</b><em>{Math.round((derived.answeredNotBillable / outcomeTotal) * 100)}%</em></li>
                  <li><i className={classes.mixMissed} /><span>Missed</span><b>{derived.missed}</b><em>{Math.round((derived.missed / outcomeTotal) * 100)}%</em></li>
                </ul>
                <div className={classes.topList}>
                  <h3 className={classes.miniTitle}>Top campaigns by spend</h3>
                  {topCampaigns.length === 0 ? (
                    <p className={classes.muted}>No campaign spend in this range.</p>
                  ) : topCampaigns.map((c) => (
                    <button key={c.campaign} type="button" className={classes.topRow} onClick={() => openCampaign(c.campaign)}>
                      <span className={classes.topName}>{c.campaignLabel || c.campaign}</span>
                      <span className={classes.topVal}>{money(c.totalCost)}</span>
                      <span className={classes.topTrack} aria-hidden>
                        <span style={{ width: `${derived.cost ? Math.max(3, ((c.totalCost || 0) / derived.cost) * 100) : 0}%` }} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.section>
        </div>


        {/* ── Signups by vertical ──────────────────────────────── */}
        <motion.section className={`glass ${classes.card}`} variants={presets.child} aria-labelledby="signups-title">
          <div className={classes.cardHead}>
            <div>
              <h2 id="signups-title" className={classes.cardTitle}>Signups by vertical</h2>
              <p className={classes.cardSub}>New agents who finished signup in {rangeLabel.toLowerCase()}, by the vertical they picked, and the call spend they generated.</p>
            </div>
            {!signupLoading && signupStats ? (
              <div className={classes.signupChips}>
                <span className={classes.signupChip}><b>{signupStats.summary?.signups ?? 0}</b> signups</span>
                <span className={classes.signupChip}><b>{money(signupStats.summary?.revenue)}</b> revenue</span>
                <span className={classes.signupChip}><b>{money(signupStats.summary?.revenuePerSignup)}</b> per signup</span>
              </div>
            ) : null}
          </div>

          {signupLoading ? (
            <div className={classes.mixSkeleton}><span /><span /><span /><span /></div>
          ) : signupError ? (
            <div className={classes.empty}>
              <AlertTriangle size={26} />
              <h4>Signup data couldn&apos;t load</h4>
              <p>{signupError}</p>
              <button type="button" className={classes.ghostBtn} onClick={loadSignups}><RefreshCw size={15} /> Try again</button>
            </div>
          ) : !signupStats?.summary?.signups ? (
            <div className={classes.empty}>
              <UserPlus size={26} />
              <h4>No new signups in this range</h4>
              <p>Try a wider date range.</p>
            </div>
          ) : (
            <>
              <div className={classes.signupGrid}>
                <div className={classes.tableScroll}>
                  <table className={`${classes.table} ${classes.signupTable}`}>
                    <thead>
                      <tr>
                        <th scope="col">Vertical</th>
                        <th scope="col">Signups</th>
                        <th scope="col" className={classes.thRight}>Spending</th>
                        <th scope="col" className={classes.thRight}>Conversion</th>
                        <th scope="col" className={classes.thRight}>Revenue</th>
                        <th scope="col" className={classes.thRight}>Per signup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signupStats.verticals.map((v, i) => (
                        <tr key={v.vertical}>
                          <td>
                            <span className={classes.nameCell}>
                              <span className={classes.campaignDot} style={{ background: verticalColor(v.vertical, i) }} />
                              {v.vertical}
                            </span>
                          </td>
                          <td>
                            <span className={classes.rateCell}>
                              <span className={classes.rateNum}>{v.signups}</span>
                              <span className={classes.rateTrack} aria-hidden>
                                <span className={classes.rateFill} style={{ width: `${Math.max(2, (v.share || 0) * 100)}%`, background: verticalColor(v.vertical, i) }} />
                              </span>
                            </span>
                          </td>
                          <td className={classes.num}>{v.spendingAgents}</td>
                          <td className={classes.num}>{pct(v.conversionRate)}%</td>
                          <td className={classes.num}><span className={classes.spend}>{money(v.revenue)}</span></td>
                          <td className={classes.num}>{money(v.revenuePerSignup)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={classes.signupChart}>
                  <div className={classes.legend}>
                    {signupStats.verticals.map((v, i) => (
                      <span key={v.vertical}><i style={{ background: verticalColor(v.vertical, i) }} />{v.vertical}</span>
                    ))}
                  </div>
                  <SignupTrendChart byDay={signupStats.byDay} verticals={signupStats.verticals} reduceMotion={reduceMotion} />
                </div>
              </div>
              <p className={classes.metaLine}>
                Signup = onboarding completed in this range. Revenue = call spend by those new agents in the same range.
                Agents who picked more than one vertical are counted in each.
                {signupStats.meta?.truncated ? ' Showing the first 5,000 signups only.' : ''}
              </p>
            </>
          )}
        </motion.section>

        {/* ── Breakdown ────────────────────────────────────────── */}
        <motion.section className={`glass ${classes.card}`} variants={presets.child} aria-labelledby="breakdown-title">
          <div className={classes.cardHead}>
            <div>
              <h2 id="breakdown-title" className={classes.cardTitle}>Performance breakdown</h2>
              <p className={classes.cardSub}>Click any row to open its calls, trend and outcomes.</p>
            </div>
            <div className={classes.breakdownTools}>
              {breakdownTab === 'agents' ? (
                <label className={classes.search}>
                  <Search size={15} aria-hidden />
                  <input
                    placeholder="Search agent name or ID"
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                    aria-label="Search agents"
                  />
                  {agentSearch ? (
                    <button type="button" onClick={() => setAgentSearch('')} aria-label="Clear search"><X size={14} /></button>
                  ) : null}
                </label>
              ) : null}
              <SlidingTabs
                tabs={BREAKDOWN_TABS.map((t) => ({
                  ...t,
                  label: `${t.label} ${t.key === 'campaigns' ? campaignStats.length : agentStats.length}`,
                }))}
                activeKey={breakdownTab}
                onChange={setBreakdownTab}
                ariaLabel="Breakdown"
              />
            </div>
          </div>

          <div className={classes.tableScroll}>
            {breakdownTab === 'campaigns' ? (
              <table className={classes.table}>
                <thead>
                  <tr>
                    <SortTh label="Campaign" field="name" sort={campaignSort} onSort={toggleSort(setCampaignSort)} />
                    <SortTh label="Calls" field="calls" sort={campaignSort} onSort={toggleSort(setCampaignSort)} align="right" />
                    <SortTh label="Answer rate" field="answerRate" sort={campaignSort} onSort={toggleSort(setCampaignSort)} />
                    <SortTh label="Billable rate" field="billableRate" sort={campaignSort} onSort={toggleSort(setCampaignSort)} />
                    <SortTh label="Avg handle" field="avgHandleTime" sort={campaignSort} onSort={toggleSort(setCampaignSort)} align="right" />
                    <SortTh label="Spend" field="totalCost" sort={campaignSort} onSort={toggleSort(setCampaignSort)} align="right" />
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    [0, 1, 2, 3].map((i) => <tr key={i} className={classes.skelRow}><td colSpan={7}><span /></td></tr>)
                  ) : sortedCampaigns.length === 0 ? (
                    <tr><td colSpan={7}>
                      <div className={classes.empty}>
                        <Megaphone size={26} />
                        <h4>No campaign stats</h4>
                        <p>No campaign data in the selected range.</p>
                      </div>
                    </td></tr>
                  ) : sortedCampaigns.map((row) => (
                    <tr
                      key={row.campaign}
                      className={`${classes.row} ${selectedCampaign === row.campaign ? classes.rowActive : ''}`}
                      onClick={() => openCampaign(row.campaign)}
                      onKeyDown={onRowKey(() => openCampaign(row.campaign))}
                      tabIndex={0}
                      aria-label={`Open ${row.campaignLabel || row.campaign} drilldown`}
                    >
                      <td><span className={classes.nameCell}><span className={classes.campaignDot} />{row.campaignLabel || row.campaign}</span></td>
                      <td className={classes.num}>{row.calls}</td>
                      <td><RateCell value={row.answerRate} tone="cyan" /></td>
                      <td><RateCell value={row.billableRate} tone="brand" /></td>
                      <td className={classes.num}>{row.avgHandleTime}s</td>
                      <td className={classes.num}>
                        <span className={classes.spend}>{money(row.totalCost)}</span>
                        <span className={classes.share}>{derived.cost ? `${Math.round(((row.totalCost || 0) / derived.cost) * 100)}% of spend` : '—'}</span>
                      </td>
                      <td className={classes.chev}><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={classes.table}>
                <thead>
                  <tr>
                    <SortTh label="Agent" field="name" sort={agentSort} onSort={toggleSort(setAgentSort)} />
                    <SortTh label="Calls" field="calls" sort={agentSort} onSort={toggleSort(setAgentSort)} align="right" />
                    <SortTh label="Answer rate" field="answerRate" sort={agentSort} onSort={toggleSort(setAgentSort)} />
                    <SortTh label="Billable rate" field="billableRate" sort={agentSort} onSort={toggleSort(setAgentSort)} />
                    <SortTh label="Avg handle" field="avgHandleTime" sort={agentSort} onSort={toggleSort(setAgentSort)} align="right" />
                    <SortTh label="Spend" field="totalCost" sort={agentSort} onSort={toggleSort(setAgentSort)} align="right" />
                    <SortTh label="Balance" field="balance" sort={agentSort} onSort={toggleSort(setAgentSort)} align="right" />
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    [0, 1, 2, 3, 4].map((i) => <tr key={i} className={classes.skelRow}><td colSpan={8}><span /></td></tr>)
                  ) : visibleAgents.length === 0 ? (
                    <tr><td colSpan={8}>
                      <div className={classes.empty}>
                        <Users size={26} />
                        <h4>{agentSearch ? 'No agents match your search' : 'No agent stats'}</h4>
                        <p>{agentSearch ? 'Try a different name or ID.' : 'No agent activity in the selected range.'}</p>
                      </div>
                    </td></tr>
                  ) : visibleAgents.map((row) => {
                    const name = getAgentName(row);
                    const id = getAgentId(row);
                    return (
                      <tr
                        key={row.agentId}
                        className={`${classes.row} ${selectedAgent === row.agentId ? classes.rowActive : ''}`}
                        onClick={() => openAgent(row.agentId)}
                        onKeyDown={onRowKey(() => openAgent(row.agentId))}
                        tabIndex={0}
                        aria-label={`Open ${name} drilldown`}
                      >
                        <td>
                          <span className={classes.agentCell}>
                            <span className={classes.avatar}>{initialsOf(name)}</span>
                            <span className={classes.agentText}>
                              <span className={classes.agentName}>
                                {name}
                                {row.flagged ? <span className={classes.flag} title={row.flagReason || 'Flagged'}><Flag size={11} /> Flagged</span> : null}
                              </span>
                              {name !== id ? <span className={classes.agentId}>{id}</span> : null}
                            </span>
                          </span>
                        </td>
                        <td className={classes.num}>{row.calls}</td>
                        <td><RateCell value={row.answerRate} tone="cyan" /></td>
                        <td><RateCell value={row.billableRate} tone="brand" /></td>
                        <td className={classes.num}>{row.avgHandleTime}s</td>
                        <td className={classes.num}><span className={classes.spend}>{money(row.totalCost)}</span></td>
                        <td className={classes.num}>
                          {typeof row.walletBalanceCents === 'number'
                            ? <span className={row.walletBalanceCents <= 0 ? classes.balanceLow : undefined}>{money(row.walletBalanceCents / 100)}</span>
                            : <span className={classes.muted}>—</span>}
                        </td>
                        <td className={classes.chev}><ChevronRight size={16} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {breakdownTab === 'agents' && !analyticsLoading && sortedAgents.length > visibleAgents.length ? (
            <div className={classes.moreRow}>
              <span className={classes.muted}>Showing {visibleAgents.length} of {sortedAgents.length} agents</span>
              <button type="button" className={classes.ghostBtn} onClick={() => setAgentLimit((n) => n + 25)}>Show more</button>
              <button type="button" className={classes.linkBtn} onClick={() => setAgentLimit(sortedAgents.length)}>Show all</button>
            </div>
          ) : null}
        </motion.section>
      </AdminPageShell>

      {/* ── Drilldown panel ────────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {drawerOpen ? (
            <>
              <motion.div
                key="analytics-drawer-backdrop"
                className={classes.backdrop}
                onClick={closeDrawer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              />
              <motion.aside
                key="analytics-drawer"
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={`${selectedCampaign ? 'Campaign' : 'Agent'} drilldown: ${drawerTitle}`}
                className={classes.drawer}
                initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <header className={classes.drawerHead}>
                  <div className={classes.drawerTitleWrap}>
                    <span className={classes.kindChip}>
                      {selectedCampaign ? <Megaphone size={13} /> : <Users size={13} />}
                      {selectedCampaign ? 'Campaign' : 'Agent'}
                    </span>
                    <h2 className={classes.drawerTitle}>{drawerTitle}</h2>
                    <p className={classes.cardSub}>
                      {rangeLabel} · {tzLabel}
                      {selectedAgentRow && typeof selectedAgentRow.walletBalanceCents === 'number'
                        ? <> · <Wallet size={12} className={classes.inlineIcon} /> {money(selectedAgentRow.walletBalanceCents / 100)} balance</>
                        : null}
                    </p>
                  </div>
                  <button type="button" className={classes.closeBtn} onClick={closeDrawer} aria-label="Close drilldown"><X size={18} /></button>
                </header>

                <div className={classes.drawerBody}>
                  {drilldownLoading ? (
                    <div className={classes.drawerSkeleton}>
                      <div className={classes.miniKpis}><span /><span /><span /></div>
                      <span className={classes.skelChart} />
                      <span className={classes.skelLine} /><span className={classes.skelLine} /><span className={classes.skelLine} />
                    </div>
                  ) : !drilldown ? (
                    <div className={classes.empty}>
                      <TrendingUp size={28} />
                      <h4>No drilldown data</h4>
                      <p>Nothing was returned for this selection and range.</p>
                    </div>
                  ) : (
                    <>
                      <div className={classes.miniKpis}>
                        <div className={classes.miniKpi}><span>Calls</span><b>{drilldown.summary?.calls ?? 0}</b></div>
                        <div className={classes.miniKpi}><span>Answer rate</span><b>{pct(drilldown.summary?.answerRate)}%</b></div>
                        <div className={classes.miniKpi}><span>Billable rate</span><b>{pct(drilldown.summary?.billableRate)}%</b></div>
                      </div>

                      <section className={classes.drawerSection}>
                        <h3 className={classes.miniTitle}>Daily trend</h3>
                        <AdminDrilldownTrendChart data={drilldown.trend} loading={false} reduceMotion={reduceMotion} />
                      </section>

                      <section className={classes.drawerSection}>
                        <div className={classes.callsHead}>
                          <h3 className={classes.miniTitle}>
                            Recent calls <span className={classes.countPill}>{filteredSortedDrilldownLogs.length}</span>
                          </h3>
                          <div className={classes.callsTools}>
                            <CustomSelect options={SORT_FIELD_OPTIONS} value={drilldownSortField} onChange={setDrilldownSortField} menuAlign="right" />
                            <CustomSelect
                              options={[
                                { value: 'desc', label: drilldownSortField === 'duration' ? 'Longest first' : 'Newest first' },
                                { value: 'asc', label: drilldownSortField === 'duration' ? 'Shortest first' : 'Oldest first' },
                              ]}
                              value={drilldownSortOrder}
                              onChange={setDrilldownSortOrder}
                              menuAlign="right"
                            />
                            <input
                              type="date"
                              className={classes.dateInput}
                              value={drilldownDay}
                              onChange={(e) => setDrilldownDay(e.target.value)}
                              aria-label="Filter calls by day"
                            />
                            {drilldownDay ? (
                              <button type="button" className={classes.linkBtn} onClick={() => setDrilldownDay('')}>Clear day</button>
                            ) : null}
                          </div>
                        </div>

                        {(!drilldown.recentLogs || drilldown.recentLogs.length === 0) ? (
                          <p className={classes.muted}>No calls in this range.</p>
                        ) : (
                          <div className={classes.tableScroll}>
                            <table className={`${classes.table} ${classes.callsTable}`}>
                              <thead>
                                <tr>
                                  <th scope="col">Call</th>
                                  <th scope="col">{selectedCampaign ? 'Agent' : 'Campaign'}</th>
                                  <th scope="col" className={classes.thRight}>Duration</th>
                                  <th scope="col">Status</th>
                                  <th scope="col">Disposition</th>
                                  <th scope="col" className={classes.thRight}>Cost</th>
                                  <th scope="col">Contest</th>
                                  <th scope="col"><span className={classes.srOnly}>Recording</span></th>
                                  <th scope="col"><span className={classes.srOnly}>Actions</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredSortedDrilldownLogs.map((log) => {
                                  const created = log.createdAt ? new Date(log.createdAt) : null;
                                  const canSeeCaller = log.cost > 0 || log.isBillable;
                                  return (
                                    <tr key={log.id} className={classes.callRow}>
                                      <td>
                                        <span className={classes.callCell}>
                                          <span className={classes.callWhen}>
                                            {created ? created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                                            {created ? <em>{created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</em> : null}
                                          </span>
                                          <span className={classes.callFrom}>
                                            {canSeeCaller
                                              ? (log.from || log.customerPhone || <span className={classes.muted}>Unknown caller</span>)
                                              : <span className={classes.muted}>Caller hidden</span>}
                                          </span>
                                        </span>
                                      </td>
                                      <td>
                                        {selectedCampaign ? (
                                          <details className={classes.agentReveal}>
                                            <summary title="Show agent phone">
                                              <span className={classes.agentName}>{getAgentName(log)}</span>
                                              {getAgentName(log) !== getAgentId(log) ? <span className={classes.agentId}>{getAgentId(log)}</span> : null}
                                            </summary>
                                            {log.phone
                                              ? <a href={`tel:${log.phone}`} className={classes.phoneLink}>{log.phone}</a>
                                              : <span className={classes.muted}>No phone</span>}
                                          </details>
                                        ) : (
                                          <span className={classes.campaignName} title={log.campaign}>{log.campaign}</span>
                                        )}
                                      </td>
                                      <td className={classes.num}><Clock3 size={12} className={classes.inlineIcon} />{log.duration}s</td>
                                      <td>
                                        <span className={classes.pillStack}>
                                          {log.isBillable ? (
                                            <span className={`${shared.drillPill} ${shared.dispSold}`}>Billable</span>
                                          ) : log.status === 'completed' ? (
                                            <span className={`${shared.drillPill} ${shared.dispAnswered}`}>Answered</span>
                                          ) : (
                                            <span className={`${shared.drillPill} ${shared.dispMissed}`}>Missed</span>
                                          )}
                                          {log.qaAudioReview?.status ? (
                                            <span className={`${shared.drillPill} ${
                                              log.qaAudioReview.status === 'pending_review' ? shared.dispAnswered
                                                : log.qaAudioReview.status === 'confirmed' ? shared.dispMissed
                                                  : shared.dispSold
                                            }`}>
                                              AI {String(log.qaAudioReview.status).replace('_', ' ')}
                                            </span>
                                          ) : null}
                                        </span>
                                      </td>
                                      <td>
                                        <CallLogDispositionBadge
                                          log={log}
                                          editable
                                          loading={updatingDispositionId === log.id}
                                          onUpdate={handleDispositionUpdate}
                                        />
                                      </td>
                                      <td className={classes.num}>{log.cost > 0 ? money(log.cost) : <span className={classes.muted}>—</span>}</td>
                                      <td>
                                        {log.refunded ? (
                                          <span className={`${shared.drillPill} ${shared.dispSold}`}>Credited</span>
                                        ) : log.contestStatus === 'pending' ? (
                                          <span className={`${shared.drillPill} ${shared.dispAnswered}`}>Pending</span>
                                        ) : log.contestStatus === 'denied' ? (
                                          <span className={`${shared.drillPill} ${shared.dispMissed}`}>Denied</span>
                                        ) : (
                                          <span className={classes.muted}>—</span>
                                        )}
                                      </td>
                                      <td>
                                        {(log.recordingSid || log.recordingUrl) ? (
                                          <button type="button" className={classes.iconBtn} onClick={() => setActiveRecording(log)} aria-label="Play recording" title="Play recording">
                                            <Play size={14} />
                                          </button>
                                        ) : null}
                                      </td>
                                      <td>
                                        {log.isBillable && log.cost > 0 && !log.refunded && log.contestStatus !== 'pending' ? (
                                          <button
                                            type="button"
                                            className={classes.refundBtn}
                                            disabled={refundingLogId === log.id}
                                            onClick={() => openRefundCallModal(log)}
                                          >
                                            {refundingLogId === log.id ? '…' : 'Refund'}
                                          </button>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {filteredSortedDrilldownLogs.length === 0 ? (
                                  <tr><td colSpan={9} className={classes.muted}>No calls found for the selected day.</td></tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className={classes.metaLine}>
                          Source: {drilldown.meta?.source || 'n/a'} · Rows: {drilldown.meta?.rowCount ?? 0}
                          {drilldown.meta?.generatedAt ? ` · Updated ${new Date(drilldown.meta.generatedAt).toLocaleTimeString()}` : ''}
                        </p>
                      </section>
                    </>
                  )}
                </div>
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}

      {activeRecording && (
        <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />
      )}

      <AdminActionModal
        modal={actionModal}
        note={actionNote}
        onNoteChange={setActionNote}
        submitting={actionSubmitting}
        onClose={closeActionModal}
        onSubmit={submitActionModal}
      />

      <AdminExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        initialScope="all"
        initialCampaign={selectedCampaign || 'all'}
        initialRange={rangePreset}
      />
    </>
  );
}
