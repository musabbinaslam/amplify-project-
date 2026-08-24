import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, CircleDollarSign, Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import {
  getAdminOverviewLite,
  getAdminAnalyticsBundle,
  listAdminCallContests,
  countAdminQaReviewsPending,
} from '../../services/adminService';
import { ADMIN_MODULES, ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminModuleCard from '../../components/admin/AdminModuleCard';
import classes from './AdminHubPage.module.css';

const HUB_TZ = 'America/New_York';

function todayRangeInTz(tz = HUB_TZ) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return { from: day, to: day, tz };
}

function formatCount(value) {
  if (value == null) return { display: '—', title: '—' };
  const n = Number(value);
  if (!Number.isFinite(n)) return { display: '—', title: '—' };
  const display = new Intl.NumberFormat('en-US').format(n);
  return { display, title: display, raw: n };
}

function formatMoney(value) {
  if (value == null) return { display: '—', title: '—' };
  const n = Number(value);
  if (!Number.isFinite(n)) return { display: '—', title: '—' };
  const display = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);
  return { display, title: display, raw: n };
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return { display: '—', title: '—' };
  const display = `${Number(value)}%`;
  return { display, title: display };
}

const VALUE_MAX_PX = 22;
const VALUE_MIN_PX = 11;

/* eslint-disable react/prop-types */
function MetricValue({ loading, display, title }) {
  const ref = useRef(null);
  const text = display == null ? '—' : String(display);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el || loading) return;
    el.style.fontSize = `${VALUE_MAX_PX}px`;
    let size = VALUE_MAX_PX;
    while (size > VALUE_MIN_PX && el.scrollWidth > el.clientWidth + 0.5) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [loading]);

  useLayoutEffect(() => {
    fit();
    const el = ref.current;
    const parent = el?.parentElement;
    if (!parent) return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [fit, text]);

  return (
    <strong
      ref={ref}
      className={classes.metricValue}
      title={loading ? undefined : (title || text)}
    >
      {loading ? <span className={classes.metricSkeleton} /> : text}
    </strong>
  );
}

export default function AdminHubPage() {
  const presets = useSubtlePageMotion();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    liveAgents: null,
    available: null,
    liveCalls: null,
    pendingContests: 0,
    pendingAiFlags: 0,
    callsToday: null,
    answerRate: null,
    billableRate: null,
    totalSignups: null,
    costToday: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const range = todayRangeInTz();
        const [overview, contests, analytics, aiFlags] = await Promise.all([
          getAdminOverviewLite(),
          listAdminCallContests('pending', 50),
          getAdminAnalyticsBundle(range),
          countAdminQaReviewsPending().catch(() => ({ pending: 0 })),
        ]);
        if (cancelled) return;
        const pool = overview?.pool || {};
        const summary = analytics?.summary || {};
        setStats({
          liveAgents: overview?.totalAgents ?? 0,
          available: Array.isArray(pool.available) ? pool.available.length : 0,
          liveCalls: Array.isArray(overview?.liveCalls) ? overview.liveCalls.length : 0,
          pendingContests: Array.isArray(contests?.contests) ? contests.contests.length : 0,
          pendingAiFlags: Number(aiFlags?.pending || 0),
          callsToday: summary.totalCalls ?? 0,
          answerRate: Math.round((summary.answerRate || 0) * 100),
          billableRate: Math.round((summary.billableRate || 0) * 100),
          totalSignups: overview?.totalSignups ?? 0,
          costToday: summary.totalCost ?? 0,
        });
      } catch {
        if (!cancelled) {
          setStats({
            liveAgents: null,
            available: null,
            liveCalls: null,
            pendingContests: 0,
            pendingAiFlags: 0,
            callsToday: null,
            answerRate: null,
            billableRate: null,
            totalSignups: null,
            costToday: null,
          });
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const badges = {
    pendingContests: stats.pendingContests,
    pendingAiFlags: stats.pendingAiFlags,
  };

  const liveMetrics = [
    { key: 'live', label: 'Live agents', ...formatCount(stats.liveAgents) },
    { key: 'available', label: 'Available', ...formatCount(stats.available) },
    { key: 'calls', label: 'Live calls', ...formatCount(stats.liveCalls) },
  ];

  const attentionItems = [
    {
      key: 'contests',
      label: 'Contests',
      ...formatCount(stats.pendingContests),
      icon: CircleDollarSign,
      to: '/app/admin/call-contests',
      tone: 'warn',
    },
    {
      key: 'flags',
      label: 'AI flags',
      ...formatCount(stats.pendingAiFlags),
      icon: Flag,
      to: '/app/admin/ai-flags',
      tone: 'alert',
    },
  ];

  const todayMetrics = [
    { key: 'callsToday', label: 'Calls', ...formatCount(stats.callsToday) },
    { key: 'answer', label: 'Answer', ...formatPercent(stats.answerRate) },
    { key: 'billable', label: 'Billable', ...formatPercent(stats.billableRate) },
    { key: 'cost', label: 'Cost', ...formatMoney(stats.costToday) },
    { key: 'signups', label: 'Signups', ...formatCount(stats.totalSignups) },
  ];

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.iconBox} aria-hidden="true">
          <Shield size={22} />
        </div>
        <div>
          <h2>Admin Control Center</h2>
          <p>Choose a module to manage operations, agents, and configuration.</p>
        </div>
      </motion.div>

      <motion.div
        className={`glass ${classes.metricsBar}`}
        variants={presets.child}
        aria-label="Admin overview metrics"
      >
        <section className={`${classes.metricGroup} ${classes.liveGroup}`}>
          <div className={classes.groupHead}>
            <h3 className={classes.groupLabel}>Live</h3>
          </div>
          <div className={classes.groupCells}>
            {liveMetrics.map((metric) => (
              <div key={metric.key} className={classes.metricCell}>
                <span className={classes.metricLabel}>{metric.label}</span>
                <MetricValue loading={statsLoading} display={metric.display} title={metric.title} />
              </div>
            ))}
          </div>
        </section>

        <div className={classes.groupDivider} aria-hidden="true" />

        <section className={`${classes.metricGroup} ${classes.attentionGroup}`}>
          <div className={classes.groupHead}>
            <h3 className={classes.groupLabel}>Attention</h3>
          </div>
          <div className={classes.groupCells}>
            {attentionItems.map((item) => {
              const Icon = item.icon;
              const active = Number(item.raw) > 0;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={`${classes.metricCell} ${classes.metricLink} ${active ? classes[`tone_${item.tone}`] : ''}`}
                >
                  <span className={classes.metricLabel}>
                    <Icon size={12} className={classes.linkIcon} aria-hidden="true" />
                    {item.label}
                  </span>
                  <MetricValue loading={statsLoading} display={item.display} title={item.title} />
                </Link>
              );
            })}
          </div>
        </section>

        <div className={classes.groupDivider} aria-hidden="true" />

        <section className={`${classes.metricGroup} ${classes.todayGroup}`}>
          <div className={classes.groupHead}>
            <h3 className={classes.groupLabel}>Today · ET</h3>
          </div>
          <div className={classes.groupCells}>
            {todayMetrics.map((metric) => (
              <div key={metric.key} className={classes.metricCell}>
                <span className={classes.metricLabel}>{metric.label}</span>
                <MetricValue loading={statsLoading} display={metric.display} title={metric.title} />
              </div>
            ))}
          </div>
        </section>
      </motion.div>

      <motion.div className={classes.moduleGrid} variants={presets.grid}>
        {ADMIN_MODULES.map((mod) => (
          <AdminModuleCard
            key={mod.id}
            title={mod.title}
            description={mod.description}
            icon={mod.icon}
            route={mod.route}
            category={ADMIN_CATEGORIES[mod.category]}
            badge={mod.badgeKey ? badges[mod.badgeKey] : undefined}
            variants={presets.child}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
