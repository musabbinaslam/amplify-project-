import { useEffect, useState } from 'react';
import {
  BarChart2,
  Clock,
  Inbox,
  MessageSquare,
  Users,
  CheckCircle2,
  Timer,
  UserCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { getSupportDeskKpis } from '../services/supportLiveService';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './SupportAnalyticsPage.module.css';

/* eslint-disable react/prop-types */

function KpiCard({ title, value, icon: Icon, hint, className = '', size, loading = false }) {
  return (
    <div className={`glass ${classes.card} ${size === 'hero' ? classes.hero : ''} ${loading ? classes.cardLoading : ''} ${className}`.trim()}>
      <div className={classes.cardTop}>
        <div className={classes.icon}><Icon size={size === 'hero' ? 22 : 18} /></div>
      </div>
      <div className={classes.copy}>
        <div className={classes.label}>{title}</div>
        {loading ? (
          <span className={classes.skeletonValue} aria-hidden="true" />
        ) : (
          <div className={classes.value}>{value ?? '—'}</div>
        )}
        {hint ? (
          loading ? <span className={classes.skeletonHint} aria-hidden="true" /> : <div className={classes.hint}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

export default function SupportAnalyticsPage() {
  const presets = useSubtlePageMotion();
  const [period, setPeriod] = useState('today');
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getSupportDeskKpis()
      .then((out) => {
        if (live) setKpis(out || {});
      })
      .catch((err) => {
        if (live) toast.error(err?.message || 'Could not load analytics');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const isToday = period === 'today';
  const conversations = isToday ? kpis?.conversationsToday : kpis?.conversations7d;
  const messages = isToday ? kpis?.messagesToday : kpis?.messages7d;
  const mineReply = isToday ? kpis?.mineFirstReplyLabel : kpis?.mineFirstReply7dLabel;
  const periodHint = isToday ? 'Today' : 'Last 7 days';

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div className={classes.headerLead}>
          <div className={classes.iconBox}><BarChart2 size={22} /></div>
          <div>
            <h2>Analytics</h2>
            <p>Queue health, volume, and your replies.</p>
          </div>
        </div>
        <div className={classes.switcher} role="tablist" aria-label="Period">
          <button
            type="button"
            role="tab"
            aria-selected={isToday}
            className={`${classes.switchBtn} ${isToday ? classes.switchBtnActive : ''}`}
            onClick={() => setPeriod('today')}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isToday}
            className={`${classes.switchBtn} ${!isToday ? classes.switchBtnActive : ''}`}
            onClick={() => setPeriod('7d')}
          >
            7 days
          </button>
        </div>
      </motion.div>

      <motion.div className={classes.bento} variants={presets.child} aria-busy={loading}>
        <KpiCard
          className={classes.tileWaiting}
          title="Waiting"
          value={kpis?.waiting ?? 0}
          icon={Inbox}
          hint="Needs a first reply"
          loading={loading}
        />
        <KpiCard
          className={classes.tileOpen}
          size="hero"
          title="Open"
          value={kpis?.open ?? 0}
          icon={MessageSquare}
          hint="Live threads"
          loading={loading}
        />
        <KpiCard
          className={classes.tileClosed}
          title="Closed"
          value={kpis?.closed ?? 0}
          icon={CheckCircle2}
          hint="All time"
          loading={loading}
        />
        <KpiCard
          className={classes.tileOldest}
          title="Oldest wait"
          value={kpis?.oldestWaitLabel || '—'}
          icon={Clock}
          hint="Longest waiting thread"
          loading={loading}
        />
        <KpiCard
          className={classes.tileStaff}
          title="Staff online"
          value={kpis?.staffOnline ?? 0}
          icon={Users}
          loading={loading}
        />
        <KpiCard
          className={classes.tileConversations}
          title="Conversations"
          value={conversations ?? 0}
          icon={Inbox}
          hint={periodHint}
          loading={loading}
        />
        <KpiCard
          className={classes.tileMessages}
          title="Messages"
          value={messages ?? 0}
          icon={MessageSquare}
          hint={periodHint}
          loading={loading}
        />
        <KpiCard
          className={classes.tileReplied}
          title="I replied"
          value={kpis?.mineReplied ?? 0}
          icon={UserCheck}
          hint="Threads you have answered"
          loading={loading}
        />
        <KpiCard
          className={classes.tileReplyTime}
          title="My first reply"
          value={mineReply || '—'}
          icon={Timer}
          hint={periodHint}
          loading={loading}
        />
        <KpiCard
          className={classes.tileClosedByMe}
          title="Closed by me"
          value={kpis?.mineClosedToday ?? 0}
          icon={CheckCircle2}
          hint="Today"
          loading={loading}
        />
      </motion.div>
    </motion.div>
  );
}
