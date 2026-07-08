import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {
  getAgencyAgents,
  getAgencyAnalytics,
  getAgencyCallLogs,
  getAgencyAnalyticsDrilldown,
  getAgencyMe,
} from '../services/agencyService';
import {
  getManagerAgents,
  getManagerAnalytics,
  getManagerCallLogs,
  getManagerAnalyticsDrilldown,
} from '../services/managerService';
import { PERF_PAGE_SIZE, LOG_PAGE_SIZE } from '../components/ops/opsUtils';

export function useOpsDashboard(mode) {
  const useAgencyApi = mode === 'agency';
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);

  const [rangePreset, setRangePreset] = useState('7d');
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agents, setAgents] = useState([]);
  const [teamName, setTeamName] = useState(null);
  const [liveCalls, setLiveCalls] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [agentStats, setAgentStats] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [agencyInfo, setAgencyInfo] = useState(null);
  const [perfSearch, setPerfSearch] = useState('');
  const [perfSort, setPerfSort] = useState('calls');
  const [perfSortDir, setPerfSortDir] = useState('desc');
  const [perfPage, setPerfPage] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownSortField, setDrilldownSortField] = useState('date');
  const [drilldownSortOrder, setDrilldownSortOrder] = useState('desc');
  const [drilldownDay, setDrilldownDay] = useState('');
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
      const data = useAgencyApi ? await getAgencyAgents() : await getManagerAgents();
      setAgents(Array.isArray(data?.agents) ? data.agents : []);
      setTeamName(useAgencyApi ? null : (data?.teamName || null));
      setLiveCalls(Array.isArray(data?.liveCalls) ? data.liveCalls : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load team status');
    } finally {
      setLoadingAgents(false);
    }
  }, [useAgencyApi]);

  const loadAgencyInfo = useCallback(async () => {
    if (!useAgencyApi) return;
    try {
      const out = await getAgencyMe();
      setAgencyInfo(out?.agency || null);
    } catch {
      setAgencyInfo(null);
    }
  }, [useAgencyApi]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const fetchAnalytics = useAgencyApi ? getAgencyAnalytics : getManagerAnalytics;
      const bundle = await fetchAnalytics(getRange());
      setSummary(bundle?.summary || null);
      setAgentStats(Array.isArray(bundle?.agents) ? bundle.agents : []);
      setByDay(Array.isArray(bundle?.byDay) ? bundle.byDay : []);
      setCampaigns(Array.isArray(bundle?.campaigns) ? bundle.campaigns : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getRange, useAgencyApi]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const fetchLogs = useAgencyApi ? getAgencyCallLogs : getManagerCallLogs;
      const data = await fetchLogs({ ...getRange(), agentId: logAgentFilter || undefined });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load call logs');
    } finally {
      setLogsLoading(false);
    }
  }, [getRange, logAgentFilter, useAgencyApi]);

  const loadDrilldown = useCallback(async (agentId) => {
    if (!agentId) {
      setDrilldown(null);
      return;
    }
    setDrilldownLoading(true);
    try {
      const fetchDrilldown = useAgencyApi ? getAgencyAnalyticsDrilldown : getManagerAnalyticsDrilldown;
      const out = await fetchDrilldown({ ...getRange(), agentId });
      setDrilldown(out);
    } catch (e) {
      toast.error(e.message || 'Failed to load agent drilldown');
      setDrilldown(null);
    } finally {
      setDrilldownLoading(false);
    }
  }, [getRange, useAgencyApi]);

  const selectAgent = useCallback((agentId) => {
    setSelectedAgent(agentId);
    setLogAgentFilter(agentId);
    setDrilldownDay('');
    setLogPage(1);
  }, []);

  const clearAgentSelection = useCallback(() => {
    setSelectedAgent('');
    setDrilldown(null);
    setDrilldownDay('');
    setLogAgentFilter('');
    setLogPage(1);
  }, []);

  const loadAll = useCallback(() => {
    loadAgents();
    loadAnalytics();
    loadLogs();
    if (useAgencyApi) loadAgencyInfo();
  }, [loadAgents, loadAnalytics, loadLogs, loadAgencyInfo, useAgencyApi]);

  useEffect(() => { refreshUserRole?.(); }, [refreshUserRole]);
  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { if (useAgencyApi) loadAgencyInfo(); }, [loadAgencyInfo, useAgencyApi]);
  useEffect(() => { loadDrilldown(selectedAgent); }, [selectedAgent, rangePreset, loadDrilldown]);
  useEffect(() => { setDrilldownDay(''); }, [rangePreset]);

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

  useEffect(() => { setPerfPage(1); }, [perfSearch, perfSort, perfSortDir, rangePreset]);

  const filteredSortedDrilldownLogs = useMemo(() => {
    const all = Array.isArray(drilldown?.recentLogs) ? [...drilldown.recentLogs] : [];
    const dayFiltered = drilldownDay
      ? all.filter((log) => {
        if (!log.createdAt) return false;
        const d = new Date(log.createdAt);
        if (Number.isNaN(d.getTime())) return false;
        const localY = d.getFullYear();
        const localM = String(d.getMonth() + 1).padStart(2, '0');
        const localD = String(d.getDate()).padStart(2, '0');
        return `${localY}-${localM}-${localD}` === drilldownDay;
      })
      : all;
    return dayFiltered.sort((a, b) => {
      if (drilldownSortField === 'duration') {
        const aDur = Number(a.duration || 0);
        const bDur = Number(b.duration || 0);
        return drilldownSortOrder === 'asc' ? aDur - bDur : bDur - aDur;
      }
      const aSafe = new Date(a.createdAt || 0).getTime() || 0;
      const bSafe = new Date(b.createdAt || 0).getTime() || 0;
      return drilldownSortOrder === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
  }, [drilldown?.recentLogs, drilldownDay, drilldownSortOrder, drilldownSortField]);

  const selectedAgentName = useMemo(() => {
    if (!selectedAgent) return '';
    return drilldown?.agentName
      || agentStats.find((a) => a.agentId === selectedAgent)?.agentName
      || agents.find((a) => a.id === selectedAgent)?.agentName
      || selectedAgent;
  }, [selectedAgent, drilldown?.agentName, agentStats, agents]);

  const onlineCount = useMemo(() => agents.filter((a) => a.online).length, [agents]);
  const summarySafe = summary || { totalCalls: 0, billableCalls: 0, billableRate: 0, answerRate: 0, totalCost: 0 };
  const initialLoading = loadingAgents && agents.length === 0 && analyticsLoading;

  return {
    rangePreset,
    setRangePreset,
    loadingAgents,
    agents,
    liveCallByAgent,
    analyticsLoading,
    summary: summarySafe,
    agentStats,
    byDay,
    campaigns,
    agencyInfo,
    teamName,
    perfSearch,
    setPerfSearch,
    perfSort,
    setPerfSort,
    perfSortDir,
    setPerfSortDir,
    perfPage,
    setPerfPage,
    sortedAgentStats,
    pagedAgentStats,
    perfPageSafe,
    perfTotalPages,
    selectedAgent,
    selectAgent,
    clearAgentSelection,
    selectedAgentName,
    drilldownLoading,
    drilldown,
    drilldownSortField,
    setDrilldownSortField,
    drilldownSortOrder,
    setDrilldownSortOrder,
    drilldownDay,
    setDrilldownDay,
    filteredSortedDrilldownLogs,
    logsLoading,
    logAgentFilter,
    setLogAgentFilter,
    logSearch,
    setLogSearch,
    logPage,
    setLogPage,
    filteredLogs,
    pagedLogs,
    logPageSafe,
    logTotalPages,
    activeRecording,
    setActiveRecording,
    onlineCount,
    initialLoading,
    loadAll,
  };
}
