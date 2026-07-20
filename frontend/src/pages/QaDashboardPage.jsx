import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, Users, Phone, Radio, RefreshCw, Trash2, CalendarDays, CircleDollarSign, Activity, Play
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  getQaOverviewLite,
  getQaAnalyticsBundle,
  getQaAnalyticsDrilldown,
  getQaLiveCalls,
  qaForceRemoveAgent,
} from '../services/qaService';
import { motion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { RecordingModal } from './CallLogsPage';
import classes from './QaDashboardPage.module.css';



const QaDashboardPage = () => {
  const presets = useSubtlePageMotion();
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const [rangePreset, setRangePreset] = useState('7d');
  const [loading, setLoading] = useState(true); // initial shell
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [callStats, setCallStats] = useState(null);
  const [campaignStats, setCampaignStats] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
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
        const [qaForceRemoveAgentId, setForceRemoveAgentId] = useState('');

  const getRange = useCallback(() => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const days = rangePreset === 'today' ? 0 : rangePreset === '30d' ? 29 : 6;
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - days);
    const from = fromDate.toISOString().slice(0, 10);
    return { from, to: end };
  }, [rangePreset]);

  const loadShell = useCallback(async () => {
    // Canonical fast path: overview-lite includes live calls payload.
    setLoading(true);
    try {
      const ov = await getQaOverviewLite();
      setOverview(ov);
      setLiveCalls(Array.isArray(ov?.liveCalls) ? ov.liveCalls : []);
    } catch (e) {
      // Recovery path only: if overview-lite fails, try standalone live endpoint.
      try {
        const live = await getQaLiveCalls();
        setLiveCalls(Array.isArray(live?.rows) ? live.rows : []);
      } catch {
        // no-op: preserve shell failure message below
      }
      toast.error(e.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const range = getRange();
      const bundle = await getQaAnalyticsBundle(range);
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
  }, [getRange]);

  const loadDrilldown = useCallback(async (type, id) => {
    if (!type || !id) {
      setDrilldown(null);
      return;
    }
    setDrilldownLoading(true);
    try {
      const range = getRange();
      const out = await getQaAnalyticsDrilldown({ type, id, ...range });
      setDrilldown(out);
    } catch (e) {
      toast.error(e.message || 'Failed to load drilldown');
    } finally {
      setDrilldownLoading(false);
    }
  }, [getRange]);

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
  }, [refreshUserRole]);

  
  
  useEffect(() => {
    // One-time shell + DIDs load (range-independent).
    Promise.all([
      loadShell(),
      ]);
  }, [loadShell]);

  useEffect(() => {
    // Re-fetch analytics whenever the selected range changes. loadAnalytics'
    // identity already depends on rangePreset via getRange, so this fires on
    // every range-pill click (and on first mount).
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    // Smarter live refresh:
    // - Fast when tab is visible
    // - Slow when tab is hidden
    // - Immediate on focus/visibility regain
    let timerId = null;
    const VISIBLE_MS = 30000;
    const HIDDEN_MS = 120000;

    const schedule = () => {
      if (timerId) window.clearTimeout(timerId);
      const ms = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS;
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
  }, [loadShell, loadAnalytics]);

    const statsSummary = callStats?.summary || {
    totalCalls: 0,
    answerRate: 0,
    billableRate: 0,
    totalCost: 0,
  };

  
  
  
  
  const handleForceRemoveAgent = async (e) => {
    e.preventDefault();
    const agentId = qaForceRemoveAgentId.trim();
    if (!agentId) {
      toast.error('Agent ID is required');
      return;
    }
    if (!window.confirm(`Are you sure you want to FORCE remove agent ${agentId} from the pool? This will clear all their active sessions and call states.`)) {
      return;
    }
    try {
      const out = await qaForceRemoveAgent(agentId);
      if (out.success) {
        toast.success(`Agent ${agentId} has been removed from the pool.`);
        setForceRemoveAgentId('');
        await loadShell(); // Refresh to show they are gone
      } else {
        toast.error('Failed to remove agent');
      }
    } catch (err) {
      toast.error(err.message || 'Error removing agent');
    }
  };


  
  const getAgentName = useCallback((row) => (
    row?.agentName || row?.displayName || row?.name || row?.agentId || row?.id || 'Unknown'
  ), []);

  const getAgentId = useCallback((row) => (
    row?.agentId || row?.id || ''
  ), []);

  const filteredAgentStats = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return agentStats;
    return agentStats.filter((row) => {
      const name = getAgentName(row).toLowerCase();
      const id = getAgentId(row).toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [agentStats, agentSearch, getAgentId, getAgentName]);

  
  const filteredSortedDrilldownLogs = useMemo(() => {
    const all = Array.isArray(drilldown?.recentLogs) ? [...drilldown.recentLogs] : [];
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
      // default: sort by date
      const aTs = new Date(a?.createdAt || 0).getTime();
      const bTs = new Date(b?.createdAt || 0).getTime();
      const aSafe = Number.isFinite(aTs) ? aTs : 0;
      const bSafe = Number.isFinite(bTs) ? bTs : 0;
      return drilldownSortOrder === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
    return dayFiltered;
  }, [drilldown?.recentLogs, drilldownDay, drilldownSortOrder, drilldownSortField]);

  if (loading && !overview) {
    return <PageLoader />;
  }

  const pool = overview?.pool || { available: [], ringing: [], busy: [] };
  const byCampaign = overview?.byCampaign || {};

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div className={classes.iconBox}>
          <Shield size={24} />
        </div>
        <div>
          <h1 className={classes.title}>QA Dashboard</h1>
          <p className={classes.subtitle}>Quality Assurance analytics and live operations</p>
        </div>
      </motion.div>

      <motion.section className={classes.card} variants={presets.child}>
        <div className={classes.cardTopRow}>
          <h2 className={classes.cardTitle}>Summary ({rangePreset === 'today' ? 'Today' : rangePreset === '30d' ? 'Last 30 days' : 'Last 7 days'})</h2>
          <div className={classes.filterRow}>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === 'today' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('today')}>Today</button>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === '7d' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('7d')}>Last 7 days</button>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === '30d' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('30d')}>Last 30 days</button>
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
        <div className={classes.grid}>
          <div className={classes.statCard}>
            <Phone size={18} className={classes.statIcon} />
            <span className={classes.statLabel}>Total calls</span>
            <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNum} /> : statsSummary.totalCalls}</span>
          </div>
          <div className={classes.statCard}>
            <Activity size={18} className={classes.statIcon} />
            <span className={classes.statLabel}>Answer rate</span>
            <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNum} /> : `${Math.round((statsSummary.answerRate || 0) * 100)}%`}</span>
          </div>
          <div className={classes.statCard}>
            <Radio size={18} className={classes.statIcon} />
            <span className={classes.statLabel}>Billable rate</span>
            <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNum} /> : `${Math.round((statsSummary.billableRate || 0) * 100)}%`}</span>
          </div>
          <div className={classes.statCard}>
            <CircleDollarSign size={18} className={classes.statIcon} />
            <span className={classes.statLabel}>Total cost</span>
            <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNumWide} /> : `$${(statsSummary.totalCost || 0).toFixed(2)}`}</span>
          </div>
        </div>
        <div className={classes.metaRow}>
          <span className={classes.muted}>
            Source: {analyticsMeta?.source || 'n/a'}
          </span>
          <span className={classes.muted}>
            Updated: {analyticsMeta?.generatedAt ? new Date(analyticsMeta.generatedAt).toLocaleTimeString() : '—'}
          </span>
        </div>
      </motion.section>

      <motion.div className={classes.grid} variants={presets.statsStrip}>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Users size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Live agents</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (overview?.totalAgents ?? 0)}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Radio size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Available</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (overview?.agents || []).filter(a => a.status === 'AVAILABLE' || a.status === 'RESERVED').length}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Ringing</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (overview?.agents || []).filter(a => a.status === 'RINGING').length}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Busy</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.busy?.length ?? 0)}</span>
        </motion.div>
      </motion.div>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Live operations</h2>
        <div className={classes.liveCallsWrap}>
          <h3 className={classes.subTitle}><CalendarDays size={14} /> Live calls</h3>
          {loading ? (
            <div className={classes.skeletonList}>
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
            </div>
          ) : liveCalls.length === 0 ? (
            <p className={classes.muted}>No active calls right now</p>
          ) : (
            <div className={classes.liveCallList}>
              {liveCalls.map((row, idx) => (
                <div key={`${row.agentId}-${idx}`} className={classes.liveCallRow}>
                  <span className={classes.agentCell}>
                    <strong>{getAgentName(row)}</strong>
                    {getAgentName(row) !== getAgentId(row) ? (
                      <span className={classes.agentSubId}>{getAgentId(row)}</span>
                    ) : null}
                  </span>
                  <span className={classes.mono}>{row.callSid || '—'}</span>
                  <span>{row.campaignId}</span>
                  <span>{row.durationSec || 0}s</span>
                  <span className={classes.statusPill}>{row.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className={classes.metaRow}>
            <span className={classes.muted}>Source: {overview?.live?.source || 'n/a'}</span>
            <span className={classes.muted}>Rows: {overview?.live?.rowCount ?? liveCalls.length}</span>
            <span className={classes.muted}>
              Updated: {overview?.live?.generatedAt ? new Date(overview.live.generatedAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>
        <h3 className={classes.subTitle}>Agents by campaign</h3>
        <div className={classes.chipRow}>
          {Object.keys(byCampaign).length === 0 ? (
            <span className={classes.muted}>No agents in pool</span>
          ) : (
            Object.entries(byCampaign).map(([id, n]) => (
              <span key={id} className={classes.chip}>
                {id}: <strong>{n}</strong>
              </span>
            ))
          )}
        </div>
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Call trends</h2>
        <div className={classes.chartWrap}>
          {analyticsLoading ? (
            <p className={classes.muted}>Loading analytics…</p>
          ) : !callStats?.byDay?.length ? (
            <p className={classes.muted}>No call data in selected range</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={callStats.byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="totalCalls" stroke="#34d399" fill="#34d39944" />
                <Area type="monotone" dataKey="answeredCalls" stroke="#60a5fa" fill="#60a5fa33" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Active agents</h2>
        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Campaign</th>
                <th>Pool</th>
                <th>Status</th>
                <th>Licensed States</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <tr><td colSpan={6} className={classes.muted}>Loading…</td></tr>
                  <tr><td colSpan={6}><div className={classes.skeletonRow} /></td></tr>
                  <tr><td colSpan={6}><div className={classes.skeletonRow} /></td></tr>
                </>
              ) : (overview?.agents || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className={classes.muted}>
                    No agents online
                  </td>
                </tr>
              ) : (
                overview.agents.map((a) => (
                  <tr key={a.id}>
                    <td className={classes.agentCell}>
                    <strong>{getAgentName(a)}</strong>
                    {getAgentName(a) !== getAgentId(a) ? (
                      <span className={classes.agentSubId}>{getAgentId(a)}</span>
                    ) : null}
                  </td>
                    <td>{a.campaignId}</td>
                    <td><span className={classes.statusPill}>{a.pool}</span></td>
                    <td><span className={classes.statusPill}>{a.status}</span></td>
                    <td>{Array.isArray(a.licensedStates) && a.licensedStates.length > 0 ? a.licensedStates.join(', ') : 'None'}</td>
                    <td className={classes.actions}>
                      <button
                        type="button"
                        className={classes.dangerBtn}
                        style={{ padding: '4px 8px' }}
                        title="Force remove agent from pool"
                        onClick={async () => {
                          const agentId = a.id;
                          if (!window.confirm(`FORCE remove ${getAgentName(a)} (${agentId})?`)) return;
                          try {
                            const out = await qaForceRemoveAgent(agentId);
                            if (out.success) {
                              toast.success('Agent removed');
                              await loadShell();
                            }
                          } catch (err) {
                            toast.error(err.message || 'Error');
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Campaign performance</h2>
        <div className={classes.tableWrap}>
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
                <tr><td colSpan={6} className={classes.muted}>No campaign stats in selected range</td></tr>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
                <button
                  type="button"
                  className={classes.filterBtn}
                  onClick={() => setDrilldownDay('')}
                >
                  Clear day
                </button>
              ) : null}
              <span className={classes.statusPill}>
                {selectedCampaign 
                  ? `Campaign: ${selectedCampaign}` 
                  : `Agent: ${overview?.agents?.find(a => a.id === selectedAgent)?.displayName || agentStats?.find(a => a.agentId === selectedAgent)?.agentName || selectedAgent}`}
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
          <p className={classes.muted}>Click a campaign or agent row to open detailed trend and outcomes.</p>
        ) : drilldownLoading ? (
          <div className={classes.skeletonList}>
            <div className={classes.skeletonRow} />
            <div className={classes.skeletonRow} />
          </div>
        ) : !drilldown ? (
          <p className={classes.muted}>No drilldown data available.</p>
        ) : (
          <>
            <div className={classes.grid}>
              <div className={classes.statCard}>
                <span className={classes.statLabel}>Calls</span>
                <span className={classes.statValue}>{drilldown.summary?.calls ?? 0}</span>
              </div>
              <div className={classes.statCard}>
                <span className={classes.statLabel}>Answer Rate</span>
                <span className={classes.statValue}>{Math.round((drilldown.summary?.answerRate || 0) * 100)}%</span>
              </div>
              <div className={classes.statCard}>
                <span className={classes.statLabel}>Billable Rate</span>
                <span className={classes.statValue}>{Math.round((drilldown.summary?.billableRate || 0) * 100)}%</span>
              </div>
            </div>
            <div className={classes.metaRow}>
              <span className={classes.muted}>Source: {drilldown.meta?.source || 'n/a'}</span>
              <span className={classes.muted}>Rows: {drilldown.meta?.rowCount ?? 0}</span>
              <span className={classes.muted}>
                Updated: {drilldown.meta?.generatedAt ? new Date(drilldown.meta.generatedAt).toLocaleTimeString() : '—'}
              </span>
            </div>
            <div className={classes.chartWrap}>
              {!drilldown.trend?.length ? (
                <p className={classes.muted}>No trend data in selected range.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={drilldown.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="calls" stroke="#34d399" fill="#34d39933" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            {drilldown.recentLogs && drilldown.recentLogs.length > 0 && (
              <div className={classes.tableWrap} style={{marginTop: '24px'}}>
                <h3 className={classes.subTitle}>Recent Calls</h3>
                <table className={classes.table}>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Campaign</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Disposition</th>
                      <th>Cost</th>
                      <th>Recording (QA)</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDrilldownLogs.map((log) => (
                      <tr key={log.id}>
                        <td className={classes.agentCell}>
                    <strong>{getAgentName(log)}</strong>
                    {getAgentName(log) !== getAgentId(log) ? (
                      <span className={classes.agentSubId}>{getAgentId(log)}</span>
                    ) : null}
                  </td>
                        <td>{log.campaign}</td>
                        <td>{log.duration}s</td>
                        <td>
                          {log.isBillable ? (
                            <span className={`${classes.statusPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.status === 'completed' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`}>Answered</span>
                          ) : (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Missed</span>
                          )}
                        </td>
                        <td>
                          {log.disposition === 'sold' ? (
                            <span className={`${classes.statusPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.disposition === 'callback' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`}>Call back</span>
                          ) : log.disposition === 'not_interested' ? (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Not Interested</span>
                          ) : log.disposition === 'busy' ? (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Busy</span>
                          ) : log.disposition === 'policy_closed' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`} style={{borderColor: 'var(--brand-text)'}}>Policy Closed</span>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                        <td>
                          {(log.recordingSid || log.recordingUrl) ? (
                            <button 
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--brand-accent)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                              onClick={() => setActiveRecording(log)}
                            >
                              <Play size={12} /> Play
                            </button>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td className={classes.muted}>{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {filteredSortedDrilldownLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={classes.muted}>No calls found for selected day.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Agent Emergency Management</h2>
        <p className={classes.hint}>
          If an agent is &quot;stuck&quot; in a call or appears online when they aren&apos;t, enter their Agent ID here to manually evict them from all active pools and records.
        </p>
        <form className={classes.didForm} style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }} onSubmit={handleForceRemoveAgent}>
          <div className={classes.formField}>
            <label>Agent ID</label>
            <input
              className={classes.input}
              placeholder="e.g. h4L9bs2BgXMPT9KrX56mSJbbKnW2"
              value={qaForceRemoveAgentId}
              onChange={(e) => setForceRemoveAgentId(e.target.value)}
            />
          </div>
          <button type="submit" className={classes.dangerBtn} style={{ height: '42px', padding: '0 20px' }}>
            <Trash2 size={16} />
            Force remove from pool
          </button>
        </form>
      </motion.section>

      

      
      {activeRecording && <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />}
    </motion.div>
  );
};

export default QaDashboardPage;
