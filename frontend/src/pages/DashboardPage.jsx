import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, Phone, PhoneCall, Target, CheckCircle2, DollarSign, Clock, Percent, Loader2, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getProfile } from '../services/profileService';
import { fetchDashboardLogs, fetchCampaignPricing } from '../services/dashboardService';
import classes from './DashboardPage.module.css';

const PERIOD_OPTIONS = ['This Week', 'This Month', 'Last 30 Days'];

const CAMPAIGN_DESCRIPTIONS = {
  fe_transfers: 'Live transfer Final Expense leads',
  fe_inbounds: 'Direct inbound Final Expense calls',
  medicare_transfers: 'Live transfer Medicare leads',
  medicare_inbound_1: 'High-intent Medicare inbound calls',
  medicare_inbound_2: 'Standard Medicare inbound calls',
  aca_transfers: 'Live transfer ACA health leads',
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
  return log?.type === 'Transfer' ? 'Outbound' : 'Inbound';
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

const StatCard = ({ title, value, icon: Icon }) => (
  <motion.div
    className={classes.statCard}
    whileHover={{ y: -4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
  >
    <div className={classes.statHeader}>
      <span className={classes.statTitle}>{title}</span>
      <div className={classes.iconWrapper}>
        <Icon size={18} />
      </div>
    </div>
    <div className={classes.statValue}>{value}</div>
  </motion.div>
);

const CampaignCard = ({ title, desc, price, buffer }) => {
  const unit = title.toLowerCase().includes('transfer') ? 'lead' : 'call';
  return (
    <motion.div
      className={classes.campaignCard}
      whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className={classes.campaignHeader}>
        <DollarSign size={16} className={classes.blueIcon} />
        <span className={classes.campaignTitle}>{title}</span>
      </div>
      <div className={classes.campaignDesc}>{desc}</div>
      <div className={classes.campaignPrice}>
        <span className={classes.priceLarge}>${Number(price).toFixed(0)}</span>
        <span className={classes.priceSub}>/{unit}</span>
      </div>
      <div className={classes.campaignBuffer}>
        <Clock size={12} />
        <span>{buffer}s buffer</span>
      </div>
    </motion.div>
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState('This Week');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
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
        const [profileRes, logsRes] = await Promise.all([
          getProfile(user.uid),
          fetchDashboardLogs({ startDate, endDate, limit: 1000 }),
        ]);
        if (cancelled) return;
        setProfile(profileRes || {});
        setLogs(Array.isArray(logsRes) ? logsRes : []);
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

  const metrics = useMemo(() => {
    const startOfToday = startOfDay(new Date()).getTime();
    const todayCalls = logs.filter((l) => new Date(l.createdAt || 0).getTime() >= startOfToday).length;
    const totalCalls = logs.length;

    const conversions = logs.filter((l) => l.isBillable).length;

    // Answered calls are completed calls with > 0 duration
    const answeredCalls = logs.filter((l) => l.status === 'completed' && Number(l.duration) > 0).length;

    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    const bufferHitRate = answeredCalls > 0 ? Math.round((conversions / answeredCalls) * 100) : 0;
    
    const spend = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const totalTalkTimeSecs = logs.reduce((sum, l) => sum + (Number(l.duration) || 0), 0);

    return {
      todayCalls,
      totalCalls,
      answeredCalls,
      sales: conversions,
      answerRate,
      bufferHitRate,
      spend,
      totalTalkTimeSecs,
    };
  }, [logs]);

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
        name: period === 'This Week'
          ? DAY_LABELS[d.getDay()]
          : String(d.getDate()),
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

  const recentCalls = useMemo(() => logs.slice(0, 5), [logs]);

  const campaignCards = campaigns.length > 0
    ? campaigns
    : Object.keys(CAMPAIGN_DESCRIPTIONS).map((id) => ({ id, label: '', price: 0, buffer: 0 }));

  return (
    <div className={classes.dashboard}>
      {error && (
        <div className={classes.errorBanner}>
          {error}
        </div>
      )}

      <div className={classes.sectionStats}>
        <StatCard title="Today's Calls" value={loading ? '…' : String(metrics.todayCalls)} icon={PhoneCall} />
        <StatCard title={period} value={loading ? '…' : String(metrics.totalCalls)} icon={Phone} />
        <StatCard title="Answer Rate" value={loading ? '…' : `${metrics.answerRate}%`} icon={Activity} />
        <StatCard title="Conversions" value={loading ? '…' : String(metrics.sales)} icon={CheckCircle2} />
      </div>

      <div className={classes.campaignSection}>
        <div className={classes.sectionHeader}>
          <h3>Campaign Pricing</h3>
          <button className={classes.dollarBtn}><DollarSign size={16} /></button>
        </div>
        {campaignsLoading ? (
          <div className={classes.sectionLoading}>
            <Loader2 size={16} className={classes.spinner} /> Loading campaign pricing…
          </div>
        ) : (
          <div className={classes.campaignGrid}>
            {campaignCards.map((c) => (
              <CampaignCard
                key={c.id}
                title={c.label || c.id}
                desc={CAMPAIGN_DESCRIPTIONS[c.id] || ''}
                price={c.price}
                buffer={c.buffer}
              />
            ))}
          </div>
        )}
      </div>

      <div className={classes.performanceHeader}>
        <h3><Activity size={18} /> Performance Stats</h3>
        <div className={classes.customDropdown} ref={dropdownRef}>
          <button
            className={classes.dropdownTrigger}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {period}
            <ChevronDown size={16} className={`${classes.dropdownIcon} ${isDropdownOpen ? classes.open : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className={classes.dropdownMenu}>
              {PERIOD_OPTIONS.map((opt) => (
                <div
                  key={opt}
                  className={`${classes.dropdownItem} ${period === opt ? classes.activeItem : ''}`}
                  onClick={() => {
                    setPeriod(opt);
                    setIsDropdownOpen(false);
                  }}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={classes.perfStatsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Spend</span>
            <div className={classes.iconWrapper}><DollarSign size={18} /></div>
          </div>
          <div className={classes.statValue}>{loading ? '…' : `$${metrics.spend.toFixed(2)}`}</div>
          <div className={classes.statSub}>Total cost on conversions</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Talk Time</span>
            <div className={classes.iconWrapper}><Clock size={18} /></div>
          </div>
          <div className={classes.statValue}>{loading ? '…' : formatTotalTalkTime(metrics.totalTalkTimeSecs)}</div>
          <div className={classes.statSub}>
            Time spent speaking to prospects
          </div>
        </div>
        <div className={`${classes.statCard} ${classes.wideCard}`}>
          <div className={classes.statHeader}>
            <span className={classes.statTitle}>Close Rate</span>
            <div className={classes.iconWrapper}><Target size={18} /></div>
          </div>
          <div className={classes.statValue} style={{ color: metrics.bufferHitRate >= 20 ? 'var(--accent-green)' : 'var(--text-primary)' }}>
            {loading ? '…' : `${metrics.bufferHitRate}%`}
          </div>
          <div className={classes.statSub}>Percentage of answered calls that converted</div>
        </div>
      </div>

      <div className={classes.chartSection}>
        <div className={classes.chartHeader}>
          <div className={classes.chartTitleBox}>
            <div className={classes.chartIcon}><Target size={16} /></div>
            <div>
              <div className={classes.chartTitle}>Close Rate</div>
              <div className={classes.chartValue}>{metrics.bufferHitRate}%</div>
            </div>
          </div>
          <div className={classes.chartStats}>
            <div>{metrics.sales} sales</div>
            <div>{metrics.answeredCalls} answered calls</div>
          </div>
        </div>
        <div className={classes.chartContainer}>
          {loading ? (
            <div className={classes.chartLoading}>
              <Loader2 size={24} className={classes.spinner} />
            </div>
          ) : chartData.every((d) => d.sales === 0 && d.calls === 0) ? (
            <div className={classes.chartEmpty}>
              No calls in this period yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fill: 'var(--text-secondary)' }} fontSize={12} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-secondary)' }} fontSize={12} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-secondary)' }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="var(--brand)" strokeWidth={2} dot={{ r: 4, fill: 'var(--brand)' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className={classes.callsSection}>
        <div className={classes.sectionHeader}>
          <h3>Recent Calls</h3>
          <button className={classes.viewAllBtn} onClick={() => navigate('/app/call-logs')}>View All</button>
        </div>
        <div className={classes.callsTable}>
          {recentCalls.length === 0 ? (
            <div className={classes.emptyState}>
              {loading ? 'Loading recent calls…' : 'No calls in this period yet.'}
            </div>
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
                      <td className={classes.callName}>{log.from || '—'}</td>
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
      </div>
    </div>
  );
};

export default DashboardPage;
