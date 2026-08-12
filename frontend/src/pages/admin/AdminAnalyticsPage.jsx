import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, Phone, Radio, RefreshCw, Activity, CircleDollarSign, Play,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  getAdminAnalyticsBundle,
  getAdminAnalyticsDrilldown,
  refundAdminCall,
  listAdminCallContests,
  updateAdminCallLogDisposition,
} from '../../services/adminService';
import useAuthStore from '../../store/authStore';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminStatCard from '../../components/admin/AdminStatCard';
import { AdminCallTrendChart, AdminDrilldownTrendChart } from '../../components/admin/AdminCharts';
import { AdminActionModal } from '../../components/admin/ContestReviewCard';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import CustomSelect from '../../components/ui/CustomSelect';
import { RecordingModal } from '../CallLogsPage';
import { CallLogDispositionBadge } from '../../components/callLogs/CallLogStatusCells';
import classes from '../../components/admin/adminShared.module.css';

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

  const statsSummary = callStats?.summary || {
    totalCalls: 0,
    answerRate: 0,
    billableRate: 0,
    totalCost: 0,
  };

  const filteredAgentStats = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return agentStats;
    return agentStats.filter((row) => {
      const name = getAgentName(row).toLowerCase();
      const id = getAgentId(row).toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [agentStats, agentSearch]);

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
  }, [drilldown?.recentLogs, drilldownDay, drilldownSortOrder, drilldownSortField]);

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
    } catch (err) {
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

  if (loading && !overview) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Analytics & Reports"
        description="Call trends, campaign and agent performance, and drilldown reports."
        icon={TrendingUp}
        category={ADMIN_CATEGORIES.operations}
      >
        <motion.section className={`glass ${classes.sectionCard} ${classes.summarySection}`} variants={presets.child}>
          <div className={classes.cardTopRow}>
            <h2 className={classes.cardTitle}>Summary ({
              rangePreset === 'today' ? 'Today' : 
              rangePreset === 'yesterday' ? 'Yesterday' :
              rangePreset === 'custom' ? 'Custom Range' :
              rangePreset === '30d' ? 'Last 30 days' : 'Last 7 days'
            })</h2>
            <div className={`glass ${classes.toolbar} ${classes.summaryToolbar}`}>
              <div className={classes.filterRow} role="tablist" aria-label="Date range">
                {RANGE_PRESETS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={rangePreset === key}
                    className={`${classes.filterBtn} ${rangePreset === key ? classes.filterBtnActive : ''}`}
                    onClick={() => setRangePreset(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {rangePreset === 'custom' ? (
                <div className={classes.customRangeRow}>
                  <input
                    type="date"
                    className={classes.dateInput}
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    aria-label="Custom range start"
                  />
                  <span className={classes.muted}>to</span>
                  <input
                    type="date"
                    className={classes.dateInput}
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    aria-label="Custom range end"
                  />
                </div>
              ) : null}

              <div className={classes.toolbarActions}>
                <CustomSelect
                  options={TIMEZONE_OPTIONS}
                  value={timezone}
                  onChange={setTimezone}
                  menuAlign="right"
                />
                <button
                  type="button"
                  className={classes.refreshBtn}
                  onClick={async () => {
                    await loadShell();
                    await loadAnalytics();
                  }}
                  disabled={loading}
                >
                  <RefreshCw size={16} className={loading ? classes.spin : ''} />
                  Refresh
                </button>
              </div>
            </div>
          </div>
          <div className={classes.statsRow}>
            <AdminStatCard label="Total calls" value={statsSummary.totalCalls} icon={Phone} variants={presets.child} loading={analyticsLoading} />
            <AdminStatCard label="Answer rate" value={`${Math.round((statsSummary.answerRate || 0) * 100)}%`} icon={Activity} variants={presets.child} loading={analyticsLoading} />
            <AdminStatCard label="Billable rate" value={`${Math.round((statsSummary.billableRate || 0) * 100)}%`} icon={Radio} variants={presets.child} loading={analyticsLoading} />
            <AdminStatCard label="Total cost" value={`$${(statsSummary.totalCost || 0).toFixed(2)}`} icon={CircleDollarSign} variants={presets.child} loading={analyticsLoading} wide />
          </div>
          <div className={classes.metaRow}>
            <span className={classes.muted}>Source: {analyticsMeta?.source || 'n/a'}</span>
            <span className={classes.muted}>
              Updated: {analyticsMeta?.generatedAt ? new Date(analyticsMeta.generatedAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <AdminCallTrendChart
            data={callStats?.byDay}
            loading={analyticsLoading}
            reduceMotion={reduceMotion}
            totalCalls={statsSummary.totalCalls}
            answerRatePct={Math.round((statsSummary.answerRate || 0) * 100)}
          />
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <h2 className={classes.cardTitle}>Campaign performance</h2>
          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Calls</th>
                    <th>Answer %</th>
                    <th>Billable %</th>
                    <th>Avg Handle (s)</th>
                    <th>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    <tr><td colSpan={6} className={classes.muted}>Loading analytics…</td></tr>
                  ) : campaignStats.length === 0 ? (
                    <tr><td colSpan={6}>
                      <div className={classes.emptyPanel}>
                        <TrendingUp size={28} className={classes.emptyPanelIcon} />
                        <h4>No campaign stats</h4>
                        <p>No campaign data in the selected range.</p>
                      </div>
                    </td></tr>
                  ) : (
                    campaignStats.map((row) => (
                      <tr
                        key={row.campaign}
                        className={`${classes.clickableRow} ${selectedCampaign === row.campaign ? classes.rowActive : ''}`}
                        onClick={() => {
                          setSelectedCampaign(row.campaign);
                          setSelectedAgent('');
                        }}
                      >
                        <td>{row.campaignLabel || row.campaign}</td>
                        <td>{row.calls}</td>
                        <td>{Math.round((row.answerRate || 0) * 100)}%</td>
                        <td>{Math.round((row.billableRate || 0) * 100)}%</td>
                        <td>{row.avgHandleTime}</td>
                        <td>${(row.totalCost || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.cardTopRow}>
            <h2 className={classes.cardTitle}>Agent performance</h2>
            <input
              className={classes.searchInput}
              placeholder="Search by agent name or ID"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />
          </div>
          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Calls</th>
                    <th>Answer %</th>
                    <th>Billable %</th>
                    <th>Avg Handle (s)</th>
                    <th>Total Cost</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    <tr><td colSpan={7} className={classes.muted}>Loading analytics…</td></tr>
                  ) : filteredAgentStats.length === 0 ? (
                    <tr><td colSpan={7} className={classes.muted}>No agent stats match this filter</td></tr>
                  ) : (
                    filteredAgentStats.map((row) => (
                      <tr
                        key={row.agentId}
                        className={`${classes.clickableRow} ${selectedAgent === row.agentId ? classes.rowActive : ''}`}
                        onClick={() => {
                          setSelectedAgent(row.agentId);
                          setSelectedCampaign('');
                        }}
                      >
                        <td className={classes.agentCell}>
                          <strong>{getAgentName(row)}</strong>
                          {getAgentName(row) !== getAgentId(row) ? (
                            <span className={classes.agentSubId}>{getAgentId(row)}</span>
                          ) : null}
                        </td>
                        <td>{row.calls}</td>
                        <td>{Math.round((row.answerRate || 0) * 100)}%</td>
                        <td>{Math.round((row.billableRate || 0) * 100)}%</td>
                        <td>{row.avgHandleTime}</td>
                        <td>${(row.totalCost || 0).toFixed(2)}</td>
                        <td>
                          {typeof row.walletBalanceCents === 'number'
                            ? `$${(row.walletBalanceCents / 100).toFixed(2)}`
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.cardTopRow}>
            <h2 className={classes.cardTitle}>Drilldown</h2>
            {(selectedCampaign || selectedAgent) ? (
              <div className={classes.filterRow}>
                <select
                  className={`${classes.select} ${classes.drilldownSortSelect}`}
                  style={{ width: 'auto', minWidth: '140px' }}
                  value={drilldownSortField}
                  onChange={(e) => setDrilldownSortField(e.target.value)}
                  aria-label="Sort drilldown logs by field"
                >
                  <option value="date">Sort: Date</option>
                  <option value="duration">Sort: Duration</option>
                </select>
                <select
                  className={`${classes.select} ${classes.drilldownSortSelect}`}
                  style={{ width: 'auto', minWidth: '130px' }}
                  value={drilldownSortOrder}
                  onChange={(e) => setDrilldownSortOrder(e.target.value)}
                  aria-label="Sort drilldown logs order"
                >
                  <option value="desc">{drilldownSortField === 'duration' ? 'Longest first' : 'Newest first'}</option>
                  <option value="asc">{drilldownSortField === 'duration' ? 'Shortest first' : 'Oldest first'}</option>
                </select>
                <input
                  type="date"
                  className={classes.input}
                  style={{ width: 'auto', minWidth: '160px' }}
                  value={drilldownDay}
                  onChange={(e) => setDrilldownDay(e.target.value)}
                  aria-label="Filter drilldown logs by specific day"
                />
                {drilldownDay ? (
                  <button type="button" className={classes.filterBtn} onClick={() => setDrilldownDay('')}>
                    Clear day
                  </button>
                ) : null}
                <span className={classes.statusPill}>
                  {selectedCampaign
                    ? `Campaign: ${campaignStats?.find((c) => c.campaign === selectedCampaign)?.campaignLabel || selectedCampaign}`
                    : `Agent: ${overview?.agents?.find((a) => a.id === selectedAgent)?.displayName || agentStats?.find((a) => a.agentId === selectedAgent)?.agentName || selectedAgent}`}
                </span>
                <button
                  type="button"
                  className={classes.filterBtn}
                  onClick={() => {
                    setSelectedCampaign('');
                    setSelectedAgent('');
                  }}
                >
                  Reset selection
                </button>
              </div>
            ) : null}
          </div>
          {(!selectedCampaign && !selectedAgent) ? (
            <div className={classes.emptyPanel}>
              <TrendingUp size={32} className={classes.emptyPanelIcon} />
              <h4>Select a campaign or agent</h4>
              <p>Click a campaign or agent row to open detailed trend and outcomes.</p>
            </div>
          ) : drilldownLoading ? (
            <div className={classes.skeletonList}>
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
            </div>
          ) : !drilldown ? (
            <p className={classes.muted}>No drilldown data available.</p>
          ) : (
            <>
              <div className={`${classes.statsRow} ${classes.statsRowThree}`}>
                <AdminStatCard label="Calls" value={drilldown.summary?.calls ?? 0} icon={Phone} variants={presets.child} />
                <AdminStatCard label="Answer rate" value={`${Math.round((drilldown.summary?.answerRate || 0) * 100)}%`} icon={Activity} variants={presets.child} />
                <AdminStatCard label="Billable rate" value={`${Math.round((drilldown.summary?.billableRate || 0) * 100)}%`} icon={Radio} variants={presets.child} />
              </div>
              <div className={classes.metaRow}>
                <span className={classes.muted}>Source: {drilldown.meta?.source || 'n/a'}</span>
                <span className={classes.muted}>Rows: {drilldown.meta?.rowCount ?? 0}</span>
                <span className={classes.muted}>
                  Updated: {drilldown.meta?.generatedAt ? new Date(drilldown.meta.generatedAt).toLocaleTimeString() : '—'}
                </span>
              </div>
              <AdminDrilldownTrendChart
                data={drilldown.trend}
                loading={false}
                reduceMotion={reduceMotion}
              />
              {drilldown.recentLogs && drilldown.recentLogs.length > 0 && (
                <div className={`${classes.tableWrap} ${classes.drilldownTableWrap}`}>
                  <h3 className={classes.subTitle}>Recent Calls</h3>
                  <table className={`${classes.table} ${classes.drilldownTable}`}>
                    <colgroup>
                      <col className={classes.colAgent} />
                      <col className={classes.colCampaign} />
                      <col className={classes.colDuration} />
                      <col className={classes.colStatus} />
                      <col className={classes.colDisposition} />
                      <col className={classes.colCost} />
                      <col className={classes.colContest} />
                      <col className={classes.colRecording} />
                      <col className={classes.colDate} />
                      <col className={classes.colActions} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Campaign</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Disposition</th>
                        <th>Cost</th>
                        <th>Contest</th>
                        <th>Recording</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSortedDrilldownLogs.map((log) => {
                        const created = log.createdAt ? new Date(log.createdAt) : null;
                        return (
                          <tr key={log.id}>
                            <td className={classes.agentCell}>
                              <details className={classes.agentDetails}>
                                <summary title="Tap to view phone number">
                                  <strong>{getAgentName(log)}</strong>
                                  {getAgentName(log) !== getAgentId(log) ? (
                                    <span className={classes.agentSubId} title={getAgentId(log)}>{getAgentId(log)}</span>
                                  ) : null}
                                </summary>
                                <div className={classes.agentPhoneReveal}>
                                  {log.phone ? (
                                    <a href={`tel:${log.phone}`} className={classes.agentPhone}>
                                      {log.phone}
                                    </a>
                                  ) : (
                                    <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                                  )}
                                </div>
                              </details>
                            </td>
                            <td className={classes.campaignCell} title={log.campaign}>{log.campaign}</td>
                            <td className={classes.compactCell}>{log.duration}s</td>
                            <td className={classes.pillCell}>
                              {log.isBillable ? (
                                <span className={`${classes.drillPill} ${classes.dispSold}`}>Billable</span>
                              ) : log.status === 'completed' ? (
                                <span className={`${classes.drillPill} ${classes.dispAnswered}`}>Answered</span>
                              ) : (
                                <span className={`${classes.drillPill} ${classes.dispMissed}`}>Missed</span>
                              )}
                            </td>
                            <td className={`${classes.pillCell} ${classes.pillCellWrap}`}>
                              <CallLogDispositionBadge 
                                log={log} 
                                editable={true} 
                                loading={updatingDispositionId === log.id}
                                onUpdate={handleDispositionUpdate}
                              />
                            </td>
                            <td className={classes.compactCell}>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                            <td className={classes.pillCell}>
                              {log.refunded ? (
                                <span className={`${classes.drillPill} ${classes.dispSold}`}>Credited</span>
                              ) : log.contestStatus === 'pending' ? (
                                <span className={`${classes.drillPill} ${classes.dispAnswered}`}>Pending</span>
                              ) : log.contestStatus === 'denied' ? (
                                <span className={`${classes.drillPill} ${classes.dispMissed}`}>Denied</span>
                              ) : (
                                <span className={classes.muted}>—</span>
                              )}
                            </td>
                            <td>
                              {(log.recordingSid || log.recordingUrl) ? (
                                <button type="button" className={classes.playBtn} onClick={() => setActiveRecording(log)}>
                                  <Play size={12} /> Play
                                </button>
                              ) : (
                                <span className={classes.muted}>—</span>
                              )}
                            </td>
                            <td className={classes.dateCell}>
                              {created ? (
                                <>
                                  <span className={classes.datePrimary}>{created.toLocaleDateString()}</span>
                                  <span className={classes.dateSub}>
                                    {created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={classes.actionsCell}>
                              {log.isBillable && log.cost > 0 && !log.refunded && log.contestStatus !== 'pending' ? (
                                <button
                                  type="button"
                                  className={`${classes.refreshBtn} ${classes.refundBtn}`}
                                  disabled={refundingLogId === log.id}
                                  onClick={() => openRefundCallModal(log)}
                                >
                                  {refundingLogId === log.id ? '…' : 'Refund'}
                                </button>
                              ) : (
                                <span className={classes.muted}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredSortedDrilldownLogs.length === 0 ? (
                        <tr>
                          <td colSpan={10} className={classes.muted}>No calls found for selected day.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </motion.section>
      </AdminPageShell>

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
    </>
  );
}
