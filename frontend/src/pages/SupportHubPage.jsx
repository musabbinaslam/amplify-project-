import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Clock, HeadphonesIcon, Inbox } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import AdminModuleCard from '../components/admin/AdminModuleCard';
import { SUPPORT_MODULES } from '../config/supportModules';
import { getSupportDeskKpis } from '../services/supportLiveService';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import useAuthStore from '../store/authStore';
import adminClasses from './admin/AdminHubPage.module.css';
import classes from './SupportHubPage.module.css';

function formatCount(value) {
  if (value == null) return { display: '—', title: '—', raw: null };
  const n = Number(value);
  if (!Number.isFinite(n)) return { display: '—', title: '—', raw: null };
  const display = new Intl.NumberFormat('en-US').format(n);
  return { display, title: display, raw: n };
}

function formatLabel(value) {
  if (value == null || value === '') return { display: '—', title: '—' };
  const text = String(value);
  return { display: text, title: text };
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
      className={adminClasses.metricValue}
      title={loading ? undefined : (title || text)}
    >
      {loading ? <span className={adminClasses.metricSkeleton} /> : text}
    </strong>
  );
}

export default function SupportHubPage() {
  const role = useAuthStore((s) => s.user?.role);
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    if (role === 'support') return undefined;
    let live = true;
    setLoading(true);
    getSupportDeskKpis({ lite: true })
      .then((out) => {
        if (live) setKpis(out || {});
      })
      .catch((err) => {
        if (live) toast.error(err?.message || 'Could not load support metrics');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [role]);

  // Support agents use Analytics + Inbox in the sidebar — no admin-style hub.
  if (role === 'support') {
    return <Navigate to="/app/support-desk/analytics" replace />;
  }

  const queueMetrics = [
    { key: 'waiting', label: 'Waiting', ...formatCount(kpis?.waiting) },
    { key: 'open', label: 'Open', ...formatCount(kpis?.open) },
    { key: 'staff', label: 'Staff online', ...formatCount(kpis?.staffOnline) },
  ];

  const attentionItems = [
    {
      key: 'oldest',
      label: 'Oldest wait',
      ...formatLabel(kpis?.oldestWaitLabel),
      raw: Number(kpis?.oldestWaitMs) || 0,
      icon: Clock,
      to: '/app/support-desk/inbox',
      tone: 'warn',
    },
    {
      key: 'inbox',
      label: 'Needs reply',
      ...formatCount(kpis?.waiting),
      icon: Inbox,
      to: '/app/support-desk/inbox',
      tone: 'alert',
    },
  ];

  const todayMetrics = [
    { key: 'conversations', label: 'Conversations', ...formatCount(kpis?.conversationsToday) },
    { key: 'closed', label: 'Closed', ...formatCount(kpis?.closedToday) },
    { key: 'avgReply', label: 'Avg 1st reply', ...formatLabel(kpis?.avgFirstReplyLabel) },
    { key: 'mineReply', label: 'My 1st reply', ...formatLabel(kpis?.mineFirstReplyLabel) },
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
          <HeadphonesIcon size={22} />
        </div>
        <div>
          <h2>Support Desk</h2>
          <p>Live inbox and queue analytics for support and admin.</p>
        </div>
      </motion.div>

      <motion.div
        className={`glass ${adminClasses.metricsBar} ${classes.metricsBar}`}
        variants={presets.child}
        aria-label="Support overview metrics"
        aria-busy={loading}
      >
        <section className={`${adminClasses.metricGroup} ${adminClasses.liveGroup}`}>
          <div className={adminClasses.groupHead}>
            <h3 className={adminClasses.groupLabel}>Queue</h3>
          </div>
          <div className={adminClasses.groupCells}>
            {queueMetrics.map((metric) => (
              <div key={metric.key} className={adminClasses.metricCell}>
                <span className={adminClasses.metricLabel}>{metric.label}</span>
                <MetricValue loading={loading} display={metric.display} title={metric.title} />
              </div>
            ))}
          </div>
        </section>

        <div className={adminClasses.groupDivider} aria-hidden="true" />

        <section className={`${adminClasses.metricGroup} ${adminClasses.attentionGroup}`}>
          <div className={adminClasses.groupHead}>
            <h3 className={adminClasses.groupLabel}>Attention</h3>
          </div>
          <div className={adminClasses.groupCells}>
            {attentionItems.map((item) => {
              const Icon = item.icon;
              const active = Number(item.raw) > 0;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={`${adminClasses.metricCell} ${adminClasses.metricLink} ${active ? adminClasses[`tone_${item.tone}`] : ''}`}
                >
                  <span className={adminClasses.metricLabel}>
                    <Icon size={12} className={adminClasses.linkIcon} aria-hidden="true" />
                    {item.label}
                  </span>
                  <MetricValue loading={loading} display={item.display} title={item.title} />
                </Link>
              );
            })}
          </div>
        </section>

        <div className={adminClasses.groupDivider} aria-hidden="true" />

        <section className={`${adminClasses.metricGroup} ${adminClasses.todayGroup}`}>
          <div className={adminClasses.groupHead}>
            <h3 className={adminClasses.groupLabel}>Today</h3>
          </div>
          <div className={`${adminClasses.groupCells} ${classes.todayCells}`}>
            {todayMetrics.map((metric) => (
              <div key={metric.key} className={adminClasses.metricCell}>
                <span className={adminClasses.metricLabel}>{metric.label}</span>
                <MetricValue loading={loading} display={metric.display} title={metric.title} />
              </div>
            ))}
          </div>
        </section>
      </motion.div>

      <motion.div className={classes.moduleGrid} variants={presets.grid}>
        {SUPPORT_MODULES.map((mod) => (
          <AdminModuleCard
            key={mod.id}
            title={mod.title}
            description={mod.description}
            icon={mod.icon}
            route={mod.route}
            category={mod.category}
            variants={presets.child}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
