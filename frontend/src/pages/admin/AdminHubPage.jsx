import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import {
  getAdminOverviewLite,
  getAdminAnalyticsBundle,
  listAdminCallContests,
} from '../../services/adminService';
import { ADMIN_MODULES, ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminModuleCard from '../../components/admin/AdminModuleCard';
import classes from './AdminHubPage.module.css';

function todayRange() {
  const day = new Date().toISOString().slice(0, 10);
  return { from: day, to: day };
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `$${n.toFixed(2)}`;
}

export default function AdminHubPage() {
  const presets = useSubtlePageMotion();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    liveAgents: null,
    available: null,
    liveCalls: null,
    pendingContests: 0,
    callsToday: null,
    answerRate: null,
    billableRate: null,
    costToday: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const [overview, contests, analytics] = await Promise.all([
          getAdminOverviewLite(),
          listAdminCallContests('pending', 50),
          getAdminAnalyticsBundle(todayRange()),
        ]);
        if (cancelled) return;
        const pool = overview?.pool || {};
        const summary = analytics?.summary || {};
        setStats({
          liveAgents: overview?.totalAgents ?? 0,
          available: Array.isArray(pool.available) ? pool.available.length : 0,
          liveCalls: Array.isArray(overview?.liveCalls) ? overview.liveCalls.length : 0,
          pendingContests: Array.isArray(contests?.contests) ? contests.contests.length : 0,
          callsToday: summary.totalCalls ?? 0,
          answerRate: Math.round((summary.answerRate || 0) * 100),
          billableRate: Math.round((summary.billableRate || 0) * 100),
          costToday: summary.totalCost ?? 0,
        });
      } catch {
        if (!cancelled) {
          setStats({
            liveAgents: null,
            available: null,
            liveCalls: null,
            pendingContests: 0,
            callsToday: null,
            answerRate: null,
            billableRate: null,
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
  };

  const metrics = [
    { label: 'Live agents', value: stats.liveAgents },
    { label: 'Available', value: stats.available },
    { label: 'Live calls', value: stats.liveCalls },
    { label: 'Pending contests', value: stats.pendingContests },
    { label: 'Calls today', value: stats.callsToday },
    { label: 'Answer rate', value: stats.answerRate === null ? null : `${stats.answerRate}%` },
    { label: 'Billable rate', value: stats.billableRate === null ? null : `${stats.billableRate}%` },
    { label: 'Cost today', value: stats.costToday === null ? null : formatMoney(stats.costToday) },
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
        {metrics.map((metric) => (
          <div key={metric.label} className={classes.metricItem}>
            <span className={classes.metricLabel}>{metric.label}</span>
            <strong className={classes.metricValue}>
              {statsLoading ? (
                <span className={classes.metricSkeleton} />
              ) : (
                metric.value ?? '—'
              )}
            </strong>
          </div>
        ))}
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
