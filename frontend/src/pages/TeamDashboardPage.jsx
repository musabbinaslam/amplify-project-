import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Phone, Radio, Activity, CircleDollarSign, RefreshCw, AlertTriangle, Play,
  Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { RecordingModal } from './CallLogsPage';
import {
  getManagerAgents,
  getManagerAnalytics,
  getManagerCallLogs,
} from '../services/managerService';
import classes from './TeamDashboardPage.module.css';

const RANGE_LABELS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
const LOW_BILLABLE_THRESHOLD = 0.3;
const PERF_PAGE_SIZE = 10;
const LOG_PAGE_SIZE = 15;

function statusMeta(status, online) {
  if (!online) return { label: 'Offline', cls: classes.statOffline };
  switch (status) {
    case 'AVAILABLE': return { label: 'Listening for Calls', cls: classes.statAvailable };
    case 'RINGING': return { label: 'Ringing', cls: classes.statRinging };
    case 'IN_CALL': return { label: 'On Call', cls: classes.statInCall };
    case 'WRAP_UP': return { label: 'Wrapping Up', cls: classes.statInCall };
    default: return { label: status || 'Online', cls: classes.statAvailable };
  }
}

const TeamDashboardPage = () => {
  const presets = useSubtlePageMotion();
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);

  const [rangePreset, setRangePreset] = useState('7d');
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agents, setAgents] = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [agentStats, setAgentStats] = useState([]);
  const [perfSearch, setPerfSearch] = useState('');
  const [perfSort, setPerfSort] = useState('calls'); // calls | billable | rate | earnings | name
  const [perfSortDir, setPerfSortDir] = useState('desc');
  const [perfPage, setPerfPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [logAgentFilter, setLogAgentFilter] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [activeRecording, setActiveRecording] = useState(null);

  const getRange = useCallback(() => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const days = rangePreset === 'today' ? 0 : rangePreset === '30d' ? 29 : 6;
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - days);
    return { from: fromDate.toISOString().slice(0, 10), to: end };
  }, [rangePreset]);

  const loadAgents = useCallback(async () => {
    try {
      const data = await getManagerAgents();
      setAgents(Array.isArray(data?.agents) ? data.agents : []);
      setLiveCalls(Array.isArray(data?.liveCalls) ? data.liveCalls : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load team status');
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const bundle = await getManagerAnalytics(getRange());
      setSummary(bundle?.summary || null);
      setAgentStats(Array.isArray(bundle?.agents) ? bundle.agents : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getRange]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await getManagerCallLogs({ ...getRange(), agentId: logAgentFilter || undefined });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load call logs');
    } finally {
      setLogsLoading(false);
    }
  }, [getRange, logAgentFilter]);

  useEffect(() => { refreshUserRole?.(); }, [refreshUserRole]);
  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Live status polling — faster when visible, slower when hidden, immediate on focus.
  useEffect(() => {
    let timerId = null;
    const schedule = () => {
      if (timerId) window.clearTimeout(timerId);
      const ms = document.visibilityState === 'visible' ? 30000 : 120000;
      timerId = window.setTimeout(async () => {
        await loadAgents();
        schedule();
      }, ms);
    };
    const handleWake = () => { loadAgents(); schedule(); };
    schedule();
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    return () => {
      if (timerId) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [loadAgents]);

  const liveCallByAgent = useMemo(() => {
    const map = new Map();
    liveCalls.forEach((c) => { if (c.agentId) map.set(c.agentId, c); });
    return map;
  }, [liveCalls]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => (
      (log.agentName || '').toLowerCase().includes(q) ||
      (log.campaignLabel || log.campaign || '').toLowerCase().includes(q) ||
      (log.disposition || '').toLowerCase().includes(q)
    ));
  }, [logs, logSearch]);

  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const logPageSafe = Math.min(logPage, logTotalPages);
  const pagedLogs = useMemo(() => {
    const start = (logPageSafe - 1) * LOG_PAGE_SIZE;
    return filteredLogs.slice(start, start + LOG_PAGE_SIZE);
  }, [filteredLogs, logPageSafe]);

  useEffect(() => { setLogPage(1); }, [logSearch, logAgentFilter, rangePreset]);

  const sortedAgentStats = useMemo(() => {
    const q = perfSearch.trim().toLowerCase();
    const filtered = agentStats.filter((row) => {
      if (!q) return true;
      return (row.agentName || row.agentId || '').toLowerCase().includes(q);
    });
    const dir = perfSortDir === 'asc' ? 1 : -1;
    const valueOf = (row) => {
      switch (perfSort) {
        case 'billable': return Number(row.billableCalls || 0);
        case 'rate': return Number(row.billableRate || 0);
        case 'earnings': return Number(row.totalCost || 0);
        case 'name': return (row.agentName || row.agentId || '').toLowerCase();
        case 'calls':
        default: return Number(row.calls || 0);
      }
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir * String(av).localeCompare(String(bv));
      }
      return dir * (av - bv);
    });
  }, [agentStats, perfSearch, perfSort, perfSortDir]);

  const perfTotalPages = Math.max(1, Math.ceil(sortedAgentStats.length / PERF_PAGE_SIZE));
  const perfPageSafe = Math.min(perfPage, perfTotalPages);
  const pagedAgentStats = useMemo(() => {
    const start = (perfPageSafe - 1) * PERF_PAGE_SIZE;
    return sortedAgentStats.slice(start, start + PERF_PAGE_SIZE);
  }, [sortedAgentStats, perfPageSafe]);

  // Reset to first page whenever the result set changes.
  useEffect(() => { setPerfPage(1); }, [perfSearch, perfSort, perfSortDir, rangePreset]);

  const onlineCount = useMemo(() => agents.filter((a) => a.online).length, [agents]);
  const s = summary || { totalCalls: 0, billableCalls: 0, billableRate: 0, totalCost: 0 };

  if (loadingAgents && agents.length === 0 && analyticsLoading) {
    return <PageLoader />;
  }

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div className={classes.iconBox}>
          <Users size={24} />
        </div>
        <div>
          <h1 className={classes.title}>Team Dashboard</h1>
          <p className={classes.subtitle}>Read-only performance view for your assigned agents</p>
        </div>
        <div className={classes.headerActions}>
          <button
            type="button"
            className={classes.refreshBtn}
            onClick={() => { loadAgents(); loadAnalytics(); loadLogs(); }}
          >
            <RefreshCw size={16} className={analyticsLoading ? classes.spin : ''} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* KPI strip */}
      <motion.div className={classes.kpiGrid} variants={presets.statsStrip}>
        <motion.div className={`glass ${classes.statCard}`} variants={presets.child}>
          <Users size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Team Size</span>
          <span className={classes.statValue}>{agents.length}</span>
        </motion.div>
        <motion.div className={`glass ${classes.statCard}`} variants={presets.child}>
          <Radio size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Online Now</span>
          <span className={classes.statValue}>{onlineCount}</span>
        </motion.div>
        <motion.div className={`glass ${classes.statCard}`} variants={presets.child}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Total Calls</span>
          <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNum} /> : s.totalCalls}</span>
        </motion.div>
        <motion.div className={`glass ${classes.statCard}`} variants={presets.child}>
          <CircleDollarSign size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Earnings</span>
          <span className={classes.statValue}>{analyticsLoading ? <span className={classes.skeletonNumWide} /> : `$${(s.totalCost || 0).toFixed(2)}`}</span>
        </motion.div>
      </motion.div>

      {/* Section 1 — Live status */}
      <motion.section className={`glass ${classes.card}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><Activity size={18} /> Live Status</h3>
          <span className={classes.muted}>{onlineCount} of {agents.length} online</span>
        </div>
        {loadingAgents && agents.length === 0 ? (
          <div className={classes.skeletonList}>
            <div className={classes.skeletonRow} />
            <div className={classes.skeletonRow} />
          </div>
        ) : agents.length === 0 ? (
          <p className={classes.empty}>No agents assigned to you yet.</p>
        ) : (
          <div className={classes.liveList}>
            {agents.map((a) => {
              const live = liveCallByAgent.get(a.id);
              const meta = statusMeta(a.status, a.online);
              return (
                <div key={a.id} className={classes.liveRow}>
                  <span className={classes.liveAgent}>
                    <span className={`${classes.statusDot} ${meta.cls}`} aria-hidden="true" />
                    <strong>{a.agentName || a.id}</strong>
                  </span>
                  <span className={`${classes.statusPill} ${meta.cls}`}>{meta.label}</span>
                  <span className={classes.muted}>
                    {live ? `${live.durationSec || 0}s` : (a.campaignId || '—')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* Section 2 — Performance table */}
      <motion.section className={`glass ${classes.card}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><Phone size={18} /> Performance ({RANGE_LABELS[rangePreset]})</h3>
          <div className={classes.filterRow}>
            {Object.keys(RANGE_LABELS).map((key) => (
              <button
                key={key}
                type="button"
                className={`${classes.filterBtn} ${rangePreset === key ? classes.filterBtnActive : ''}`}
                onClick={() => setRangePreset(key)}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className={classes.toolbar}>
          <div className={classes.searchWrap}>
            <Search size={15} className={classes.searchIcon} />
            <input
              className={classes.searchInput}
              placeholder="Search agent"
              value={perfSearch}
              onChange={(e) => setPerfSearch(e.target.value)}
            />
          </div>
          <div className={classes.filterRow}>
            <select
              className={classes.select}
              value={perfSort}
              onChange={(e) => setPerfSort(e.target.value)}
              aria-label="Sort performance by"
            >
              <option value="calls">Sort: Calls</option>
              <option value="billable">Sort: Billable</option>
              <option value="rate">Sort: Rate</option>
              <option value="earnings">Sort: Earnings</option>
              <option value="name">Sort: Agent name</option>
            </select>
            <select
              className={classes.select}
              value={perfSortDir}
              onChange={(e) => setPerfSortDir(e.target.value)}
              aria-label="Sort direction"
            >
              <option value="desc">{perfSort === 'name' ? 'Z → A' : 'High → Low'}</option>
              <option value="asc">{perfSort === 'name' ? 'A → Z' : 'Low → High'}</option>
            </select>
          </div>
        </div>

        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Calls</th>
                <th>Billable</th>
                <th>Rate</th>
                <th>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {analyticsLoading ? (
                <tr><td colSpan={5} className={classes.muted}>Loading analytics…</td></tr>
              ) : sortedAgentStats.length === 0 ? (
                <tr><td colSpan={5} className={classes.empty}>{perfSearch ? 'No agents match your search.' : 'No calls in this period yet.'}</td></tr>
              ) : (
                pagedAgentStats.map((row) => {
                  const low = (row.billableRate || 0) < LOW_BILLABLE_THRESHOLD;
                  return (
                    <tr key={row.agentId}>
                      <td className={classes.agentCell}><strong>{row.agentName || row.agentId}</strong></td>
                      <td>{row.calls}</td>
                      <td>{row.billableCalls}</td>
                      <td>
                        <span className={low ? classes.rateWarn : undefined}>
                          {Math.round((row.billableRate || 0) * 100)}%
                          {low ? <AlertTriangle size={13} className={classes.warnIcon} aria-label="Low billable rate" /> : null}
                        </span>
                      </td>
                      <td>${(row.totalCost || 0).toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!analyticsLoading && sortedAgentStats.length > 0 ? (
          <div className={classes.pagination}>
            <span className={classes.muted}>
              {((perfPageSafe - 1) * PERF_PAGE_SIZE) + 1}–{Math.min(perfPageSafe * PERF_PAGE_SIZE, sortedAgentStats.length)} of {sortedAgentStats.length}
            </span>
            <div className={classes.pageBtns}>
              <button
                type="button"
                className={classes.pageBtn}
                onClick={() => setPerfPage((p) => Math.max(1, p - 1))}
                disabled={perfPageSafe <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className={classes.pageIndicator}>Page {perfPageSafe} of {perfTotalPages}</span>
              <button
                type="button"
                className={classes.pageBtn}
                onClick={() => setPerfPage((p) => Math.min(perfTotalPages, p + 1))}
                disabled={perfPageSafe >= perfTotalPages}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </motion.section>

      {/* Section 3 — Call log (read-only) */}
      <motion.section className={`glass ${classes.card}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><Radio size={18} /> Call Log</h3>
          <div className={classes.filterRow}>
            <select
              className={classes.select}
              value={logAgentFilter}
              onChange={(e) => setLogAgentFilter(e.target.value)}
              aria-label="Filter call log by agent"
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.agentName || a.id}</option>
              ))}
            </select>
            <input
              className={classes.searchInput}
              placeholder="Search campaign / disposition"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>
        </div>
        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Campaign</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Disposition</th>
                <th>Cost</th>
                <th>Recording</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr><td colSpan={8} className={classes.muted}>Loading call logs…</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={8} className={classes.empty}>{logSearch ? 'No calls match your search.' : 'No calls in this period yet.'}</td></tr>
              ) : (
                pagedLogs.map((log) => (
                  <tr key={log.id}>
                    <td className={classes.agentCell}><strong>{log.agentName || log.agentId}</strong></td>
                    <td>{log.campaignLabel || log.campaign}</td>
                    <td>{log.duration}s</td>
                    <td>
                      {log.isBillable ? (
                        <span className={`${classes.statusPill} ${classes.statAvailable}`}>Sold</span>
                      ) : log.status === 'completed' ? (
                        <span className={`${classes.statusPill} ${classes.statInCall}`}>Answered</span>
                      ) : (
                        <span className={`${classes.statusPill} ${classes.statOffline}`}>Missed</span>
                      )}
                    </td>
                    <td>{log.disposition || <span className={classes.muted}>—</span>}</td>
                    <td>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                    <td>
                      {(log.recordingSid || log.recordingUrl) ? (
                        <button type="button" className={classes.playBtn} onClick={() => setActiveRecording(log)}>
                          <Play size={12} /> Play
                        </button>
                      ) : (
                        <span className={classes.muted}>—</span>
                      )}
                    </td>
                    <td className={classes.muted}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!logsLoading && filteredLogs.length > 0 ? (
          <div className={classes.pagination}>
            <span className={classes.muted}>
              {((logPageSafe - 1) * LOG_PAGE_SIZE) + 1}–{Math.min(logPageSafe * LOG_PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length}
            </span>
            <div className={classes.pageBtns}>
              <button
                type="button"
                className={classes.pageBtn}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                disabled={logPageSafe <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className={classes.pageIndicator}>Page {logPageSafe} of {logTotalPages}</span>
              <button
                type="button"
                className={classes.pageBtn}
                onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))}
                disabled={logPageSafe >= logTotalPages}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </motion.section>

      {activeRecording && <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />}
    </motion.div>
  );
};

export default TeamDashboardPage;
