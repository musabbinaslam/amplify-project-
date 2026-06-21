import { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Phone, PhoneCall, CheckCircle2, DollarSign, Clock, Loader2, ChevronDown, TrendingUp, TrendingDown, Minus, PhoneIncoming } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie, Cell,
} from 'recharts';
import { motion, AnimatePresence, useReducedMotion, useMotionValue, animate } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getProfile } from '../services/profileService';
import { fetchDashboardLogs, fetchCampaignPricing } from '../services/dashboardService';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { dropdownPanelMotion, EASE_SMOOTH } from '../motion/appMotion';
import classes from './DashboardPage.module.css';

/* eslint-disable react/prop-types -- presentational helpers are local to this page */
const PERIOD_OPTIONS = ['This Week', 'This Month', 'Last 30 Days'];

const CAMPAIGN_DESCRIPTIONS = {
  fe_transfers: 'Live transfer Final Expense calls',
  fe_inbounds: 'Direct inbound Final Expense calls',
  fe_tv_calls: 'High-intent Final Expense TV calls',
  medicare_transfers: 'Live transfer Medicare calls',
  medicare_inbound_1: 'High-intent Medicare inbound calls',
  medicare_inbound_2: 'Standard Medicare inbound calls',
  aca_transfers: 'Live transfer ACA health calls',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computePeriodRange(period) {
  const now = new Date();
  const endDate = new Date(now);
  let startDate;
  if (period === 'This Month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else if (period === 'Last 30 Days') {
    startDate = startOfDay(now);
    startDate.setDate(startDate.getDate() - 29);
  } else {
    // This Week: rolling last 7 days (today + previous 6)
    startDate = startOfDay(now);
    startDate.setDate(startDate.getDate() - 6);
  }
  return { startDate, endDate };
}

/** Equivalent window immediately preceding the current one, for trend deltas. */
function computePreviousPeriodRange(period) {
  const { startDate, endDate } = computePeriodRange(period);
  const spanMs = endDate.getTime() - startDate.getTime();
  const prevEnd = new Date(startDate.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { startDate: prevStart, endDate: prevEnd };
}

function formatDurationSec(seconds) {
  const secs = parseInt(seconds) || 0;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}:${remainSecs.toString().padStart(2, '0')}`;
}

function formatTotalTalkTime(secs) {
  const total = parseInt(secs) || 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatRecentTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getCallType(log) {
  return log?.type || 'Inbound';
}

const DISPOSITION_LABELS = {
  sold: 'Sold',
  callback: 'Callback',
  not_interested: 'Not Interested',
  no_answer: 'No Answer',
};

function getDisposition(log) {
  if (log?.disposition && DISPOSITION_LABELS[log.disposition]) {
    return DISPOSITION_LABELS[log.disposition];
  }
  if (log?.isBillable) return 'Sold';
  if (log?.status === 'missed') return 'Missed';
  if (log?.status === 'completed' && Number(log?.duration) > 0) return 'Answered';
  return 'No Answer';
}

const DISP_CLS = {
  Sold: 'dispSold',
  Callback: 'dispCallback',
  'Not Interested': 'dispNotInterested',
  'No Answer': 'dispNoAnswer',
  Missed: 'dispNotInterested',
  Answered: 'dispCallback',
};

const DONUT_SEGMENTS = [
  { key: 'Sold', color: 'var(--brand-text)' },
  { key: 'Callback', color: 'var(--accent-yellow)' },
  { key: 'Answered', color: 'var(--accent-cyan)' },
  { key: 'No Answer', color: 'var(--text-tertiary)' },
  { key: 'Not Interested', color: 'var(--accent-red)' },
  { key: 'Missed', color: 'var(--accent-red)' },
];

/** Computes a percent delta between current and previous; null when no baseline. */
function trendDelta(current, previous) {
  if (previous === 0) {
    if (current === 0) return { dir: 'flat', pct: 0 };
    return { dir: 'up', pct: 100 };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { dir: 'up', pct };
  if (pct < 0) return { dir: 'down', pct: Math.abs(pct) };
  return { dir: 'flat', pct: 0 };
}

/** Animated number that counts up to `value` on mount/update (respects reduced motion). */
const CountUp = ({ value, decimals = 0, prefix = '', suffix = '' }) => {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(() =>
    `${prefix}${(0).toFixed(decimals)}${suffix}`,
  );

  useEffect(() => {
    const format = (v) => `${prefix}${Number(v).toFixed(decimals)}${suffix}`;
    if (reduceMotion) {
      setDisplay(format(value));
      return undefined;
    }
    const controls = animate(mv, value, {
      duration: 0.9,
      ease: EASE_SMOOTH,
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
  }, [value, decimals, prefix, suffix, reduceMotion, mv]);

  return <span>{display}</span>;
};

const TrendPill = ({ delta }) => {
  if (!delta) return null;
  const Icon = delta.dir === 'up' ? TrendingUp : delta.dir === 'down' ? TrendingDown : Minus;
  const cls =
    delta.dir === 'up' ? classes.trendUp : delta.dir === 'down' ? classes.trendDown : classes.trendFlat;
  return (
    <span className={`${classes.trendPill} ${cls}`}>
      <Icon size={13} />
      {delta.dir === 'flat' ? '0%' : `${delta.pct}%`}
    </span>
  );
};

const Sparkline = ({ data, dataKey }) => {
  if (!data || data.length === 0) return null;
  const hasActivity = data.some((d) => (Number(d[dataKey]) || 0) > 0);
  if (!hasActivity) return null;

  const color = 'var(--brand-text)';
  const gradId = `spark-${dataKey}`;
  return (
    <div className={classes.sparkline}>
      <ResponsiveContainer width="100%" height={44}>
        <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.55}
            fill={`url(#${gradId})`}
            isAnimationActive
            animationDuration={900}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const KpiCard = ({ title, displayValue, icon: Icon, spark, sparkKey, delta, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.kpiCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.kpiTop}>
        <div className={classes.kpiIcon}><Icon size={18} /></div>
        <TrendPill delta={delta} />
      </div>
      <div className={classes.kpiTitle}>{title}</div>
      <div className={classes.kpiValue}>{displayValue}</div>
      <Sparkline data={spark} dataKey={sparkKey} />
    </motion.div>
  );
};

const Gauge = ({ label, value, sub, gradId }) => {
  const reduceMotion = useReducedMotion();
  const safe = Math.max(0, Math.min(100, value || 0));
  const gaugeData = [{ name: label, value: safe }];
  return (
    <div className={`glass ${classes.gaugeCard}`}>
      <div className={classes.gaugeChart}>
        <ResponsiveContainer width="100%" height={170}>
          <RadialBarChart
            innerRadius="68%"
            outerRadius="92%"
            data={gaugeData}
            startAngle={90}
            endAngle={-270}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={1} />
              </linearGradient>
            </defs>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: 'color-mix(in srgb, var(--surface-container-highest) 80%, transparent)' }}
              dataKey="value"
              cornerRadius={999}
              fill={`url(#${gradId})`}
              isAnimationActive={!reduceMotion}
              animationDuration={1100}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className={classes.gaugeCenter}>
          <div className={classes.gaugeValue}>
            <CountUp value={safe} suffix="%" />
          </div>
          <div className={classes.gaugeCenterLabel}>{label}</div>
        </div>
      </div>
      <div className={classes.gaugeSub}>{sub}</div>
    </div>
  );
};

const StatTile = ({ title, value, icon: Icon, sub }) => (
  <div className={`glass ${classes.statTile}`}>
    <div className={classes.statTileHeader}>
      <span className={classes.statTileTitle}>{title}</span>
      <div className={classes.statTileIcon}><Icon size={18} /></div>
    </div>
    <div className={classes.statTileValue}>{value}</div>
    {sub && <div className={classes.statTileSub}>{sub}</div>}
  </div>
);

const CampaignCard = ({ title, desc, price, buffer, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.campaignCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.campaignHeader}>
        <div className={classes.campaignIcon}><DollarSign size={15} /></div>
        <span className={classes.campaignTitle}>{title}</span>
      </div>
      <div className={classes.campaignDesc}>{desc}</div>
      <div className={classes.campaignPrice}>
        <span className={classes.priceLarge}>${Number(price).toFixed(0)}</span>
        <span className={classes.priceSub}>/call</span>
      </div>
      <div className={classes.campaignBuffer}>
        <Clock size={12} />
        <span>{buffer}s buffer</span>
      </div>
    </motion.div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className={classes.tooltip}>
      <div className={classes.tooltipLabel}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className={classes.tooltipRow}>
          <span className={classes.tooltipDot} style={{ background: p.color }} />
          <span className={classes.tooltipName}>{p.name}</span>
          <span className={classes.tooltipVal}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const reduceMotion = useReducedMotion();
  const presets = useSubtlePageMotion();
  const dropdownMotion = useMemo(() => dropdownPanelMotion(reduceMotion), [reduceMotion]);
  const [period, setPeriod] = useState('This Week');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [prevLogs, setPrevLogs] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCampaignsLoading(true);
        const camps = await fetchCampaignPricing();
        if (!cancelled) setCampaigns(camps);
      } catch (err) {
        console.error('Failed to load campaigns:', err);
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;
    const load = async (showSpinner = false) => {
      try {
        if (showSpinner) setLoading(true);
        const { startDate, endDate } = computePeriodRange(period);
        const prev = computePreviousPeriodRange(period);
        const [, logsRes, prevRes] = await Promise.all([
          getProfile(user.uid),
          fetchDashboardLogs({ startDate, endDate, limit: 1000 }),
          fetchDashboardLogs({ startDate: prev.startDate, endDate: prev.endDate, limit: 1000 }),
        ]);
        if (cancelled) return;
        setLogs(Array.isArray(logsRes) ? logsRes : []);
        setPrevLogs(Array.isArray(prevRes) ? prevRes : []);
        setError(null);
      } catch (err) {
        console.error('Dashboard load failed:', err);
        if (!cancelled) setError(err.message || 'Failed to load dashboard data');
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    };
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.uid, period]);

  const computeMetrics = (source) => {
    const startOfToday = startOfDay(new Date()).getTime();
    const todayCalls = source.filter((l) => new Date(l.createdAt || 0).getTime() >= startOfToday).length;
    const totalCalls = source.length;
    const conversions = source.filter((l) => l.isBillable).length;
    const answeredCalls = source.filter((l) => l.status === 'completed' && Number(l.duration) > 0).length;
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    const bufferHitRate = answeredCalls > 0 ? Math.round((conversions / answeredCalls) * 100) : 0;
    const spend = source.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const totalTalkTimeSecs = source.reduce((sum, l) => sum + (Number(l.duration) || 0), 0);
    return { todayCalls, totalCalls, answeredCalls, sales: conversions, answerRate, bufferHitRate, spend, totalTalkTimeSecs };
  };

  const metrics = useMemo(() => computeMetrics(logs), [logs]);
  const prevMetrics = useMemo(() => computeMetrics(prevLogs), [prevLogs]);

  const deltas = useMemo(() => ({
    todayCalls: trendDelta(metrics.todayCalls, prevMetrics.todayCalls),
    totalCalls: trendDelta(metrics.totalCalls, prevMetrics.totalCalls),
    answerRate: trendDelta(metrics.answerRate, prevMetrics.answerRate),
    sales: trendDelta(metrics.sales, prevMetrics.sales),
  }), [metrics, prevMetrics]);

  const chartData = useMemo(() => {
    const { startDate, endDate } = computePeriodRange(period);
    const start = startOfDay(startDate).getTime();
    const end = startOfDay(endDate).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const buckets = [];
    for (let t = start; t <= end; t += oneDay) {
      const d = new Date(t);
      buckets.push({
        ts: t,
        name: period === 'This Week' ? DAY_LABELS[d.getDay()] : String(d.getDate()),
        sales: 0,
        calls: 0,
      });
    }
    const byTs = new Map(buckets.map((b) => [b.ts, b]));
    for (const l of logs) {
      const ts = startOfDay(new Date(l.createdAt || 0)).getTime();
      const bucket = byTs.get(ts);
      if (!bucket) continue;
      bucket.calls += 1;
      const isSold = l.disposition === 'sold' || (!l.disposition && l.isBillable);
      if (isSold) bucket.sales += 1;
    }
    return buckets;
  }, [logs, period]);

  const dispositionData = useMemo(() => {
    const counts = new Map();
    for (const l of logs) {
      const disp = getDisposition(l);
      counts.set(disp, (counts.get(disp) || 0) + 1);
    }
    return DONUT_SEGMENTS
      .map((seg) => ({ name: seg.key, value: counts.get(seg.key) || 0, color: seg.color }))
      .filter((d) => d.value > 0);
  }, [logs]);

  const dispositionTotal = useMemo(
    () => dispositionData.reduce((sum, d) => sum + d.value, 0),
    [dispositionData],
  );

  const recentCalls = useMemo(() => logs.slice(0, 5), [logs]);

  const campaignCards = campaigns.length > 0
    ? campaigns
    : Object.keys(CAMPAIGN_DESCRIPTIONS).map((id) => ({ id, label: '', price: 0, buffer: 0 }));

  const hasChartData = chartData.some((d) => d.sales !== 0 || d.calls !== 0);

  if (loading) return <PageLoader />;

  return (
    <motion.div
      className={classes.dashboard}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      {error && <div className={classes.errorBanner}>{error}</div>}

      <motion.div className={classes.kpiGrid} variants={presets.statsStrip}>
        <KpiCard
          title="Today's Calls"
          displayValue={<CountUp value={metrics.todayCalls} />}
          icon={PhoneCall}
          spark={chartData}
          sparkKey="calls"
          delta={deltas.todayCalls}
          variants={presets.child}
        />
        <KpiCard
          title={period}
          displayValue={<CountUp value={metrics.totalCalls} />}
          icon={Phone}
          spark={chartData}
          sparkKey="calls"
          delta={deltas.totalCalls}
          variants={presets.child}
        />
        <KpiCard
          title="Answer Rate"
          displayValue={<CountUp value={metrics.answerRate} suffix="%" />}
          icon={Activity}
          spark={chartData}
          sparkKey="calls"
          delta={deltas.answerRate}
          variants={presets.child}
        />
        <KpiCard
          title="Conversions"
          displayValue={<CountUp value={metrics.sales} />}
          icon={CheckCircle2}
          spark={chartData}
          sparkKey="sales"
          delta={deltas.sales}
          variants={presets.child}
        />
      </motion.div>

      <motion.div className={classes.performanceHeader} variants={presets.child}>
        <h3><Activity size={18} /> Performance Stats</h3>
        <div className={classes.customDropdown} ref={dropdownRef}>
          <button
            type="button"
            className={classes.dropdownTrigger}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
          >
            {period}
            <ChevronDown size={16} className={`${classes.dropdownIcon} ${isDropdownOpen ? classes.open : ''}`} />
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div className={classes.dropdownMenu} role="listbox" {...dropdownMotion}>
                {PERIOD_OPTIONS.map((opt) => (
                  <div
                    key={opt}
                    role="option"
                    aria-selected={period === opt}
                    className={`${classes.dropdownItem} ${period === opt ? classes.activeItem : ''}`}
                    onClick={() => {
                      setPeriod(opt);
                      setIsDropdownOpen(false);
                    }}
                  >
                    {opt}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div className={classes.perfBand} variants={presets.child}>
        <Gauge label="Answer Rate" value={metrics.answerRate} sub={`${metrics.answeredCalls} of ${metrics.totalCalls} calls`} gradId="gaugeAnswer" />
        <Gauge label="Close Rate" value={metrics.bufferHitRate} sub="Answered calls converted" gradId="gaugeClose" />
        <div className={classes.tileStack}>
          <StatTile title="Spend" value={`$${metrics.spend.toFixed(2)}`} icon={DollarSign} sub="Total cost on conversions" />
          <StatTile title="Talk Time" value={formatTotalTalkTime(metrics.totalTalkTimeSecs)} icon={Clock} sub="Time speaking to prospects" />
        </div>
      </motion.div>

      <div className={classes.chartsRow}>
        <motion.div className={`glass ${classes.chartSection}`} variants={presets.child}>
          <div className={classes.chartHeader}>
            <div className={classes.chartTitleBox}>
              <div className={classes.chartIcon}><TrendingUp size={16} /></div>
              <div>
                <div className={classes.chartTitle}>Calls & Conversions</div>
                <div className={classes.chartValue}>{metrics.totalCalls} <span className={classes.chartValueSub}>calls</span></div>
              </div>
            </div>
            <div className={classes.chartLegend}>
              <span className={classes.legendItem}><span className={classes.legendDot} style={{ background: 'var(--brand-text)' }} /> Sales</span>
              <span className={classes.legendItem}><span className={classes.legendDot} style={{ background: 'var(--accent-cyan)' }} /> Calls</span>
            </div>
          </div>
          <div className={classes.chartContainer}>
            {!hasChartData ? (
              <div className={classes.chartEmpty}>No calls in this period yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fill: 'var(--text-secondary)' }} fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-secondary)' }} fontSize={12} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
                  <Area type="monotone" dataKey="calls" name="Calls" stroke="var(--accent-cyan)" strokeWidth={2} fill="url(#gradCalls)" isAnimationActive={!reduceMotion} animationDuration={1000} dot={false} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="var(--brand-text)" strokeWidth={2.5} fill="url(#gradSales)" isAnimationActive={!reduceMotion} animationDuration={1000} dot={false} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div className={`glass ${classes.donutSection}`} variants={presets.child}>
          <div className={classes.chartHeader}>
            <div className={classes.chartTitleBox}>
              <div className={classes.chartIcon}><PhoneIncoming size={16} /></div>
              <div>
                <div className={classes.chartTitle}>Dispositions</div>
                <div className={classes.chartValue}>{dispositionTotal} <span className={classes.chartValueSub}>calls</span></div>
              </div>
            </div>
          </div>
          {dispositionTotal === 0 ? (
            <div className={classes.chartEmpty}>No calls in this period yet.</div>
          ) : (
            <div className={classes.donutBody}>
              <div className={classes.donutChart}>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={dispositionData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="64%"
                      outerRadius="100%"
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={!reduceMotion}
                      animationDuration={900}
                    >
                      {dispositionData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className={classes.donutCenter}>
                  <div className={classes.donutTotal}><CountUp value={dispositionTotal} /></div>
                  <div className={classes.donutTotalLabel}>Total</div>
                </div>
              </div>
              <div className={classes.donutLegend}>
                {dispositionData.map((d) => (
                  <div key={d.name} className={classes.donutLegendItem}>
                    <span className={classes.legendDot} style={{ background: d.color }} />
                    <span className={classes.donutLegendName}>{d.name}</span>
                    <span className={classes.donutLegendVal}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <motion.div className={`glass ${classes.campaignSection}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><DollarSign size={18} /> Campaign Pricing</h3>
        </div>
        {campaignsLoading ? (
          <div className={classes.sectionLoading}>
            <Loader2 size={16} className={classes.spinner} /> Loading campaign pricing…
          </div>
        ) : (
          <motion.div className={classes.campaignGrid} variants={presets.grid}>
            {campaignCards.map((c) => (
              <CampaignCard
                key={c.id}
                title={c.label || c.id}
                desc={CAMPAIGN_DESCRIPTIONS[c.id] || ''}
                price={c.price}
                buffer={c.buffer}
                variants={presets.child}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      <motion.div className={`glass ${classes.callsSection}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><PhoneCall size={18} /> Recent Calls</h3>
          <button className={classes.viewAllBtn} onClick={() => navigate('/app/call-logs')}>View All</button>
        </div>
        <div className={classes.callsTable}>
          {recentCalls.length === 0 ? (
            <div className={classes.emptyState}>No calls in this period yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Campaign</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Time</th>
                  <th>Disposition</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((log) => {
                  const type = getCallType(log);
                  const disp = getDisposition(log);
                  return (
                    <tr key={log.id || log.callSid}>
                      <td className={classes.callName}>
                        {log.isBillable
                          ? (log.from || '—')
                          : (log.from ? <span className={classes.hiddenPhone}>Hidden</span> : '—')}
                      </td>
                      <td className={classes.callPhone}>{log.campaignLabel || log.campaign || '—'}</td>
                      <td>
                        <span className={`${classes.callType} ${type === 'Inbound' ? classes.callInbound : classes.callOutbound}`}>
                          {type}
                        </span>
                      </td>
                      <td className={classes.callDuration}>
                        <Clock size={13} /> {formatDurationSec(log.duration)}
                      </td>
                      <td className={classes.callTime}>{formatRecentTime(log.createdAt)}</td>
                      <td>
                        <span className={`${classes.callDisp} ${classes[DISP_CLS[disp]] || ''}`}>
                          {disp}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DashboardPage;
