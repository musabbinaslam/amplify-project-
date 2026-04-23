import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, Users, Phone, Radio, RefreshCw, Trash2, Plus, CalendarDays, CircleDollarSign, Activity,
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
  getAdminOverviewLite,
  getAdminAnalyticsBundle,
  getAdminAnalyticsDrilldown,
  getAdminLiveCalls,
  listAdminDids,
  createAdminDid,
  patchAdminDid,
  deleteAdminDid,
} from '../services/adminService';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import classes from './AdminDashboardPage.module.css';

const AdminDashboardPage = () => {
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const [rangePreset, setRangePreset] = useState('7d');
  const [loading, setLoading] = useState(true); // initial shell
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [callStats, setCallStats] = useState(null);
  const [campaignStats, setCampaignStats] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
  const [dids, setDids] = useState([]);
  const [analyticsMeta, setAnalyticsMeta] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [agentSearch, setAgentSearch] = useState('');
  const [didForm, setDidForm] = useState({
    phoneE164: '',
    campaignId: '',
    label: '',
    active: true,
  });

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
      const ov = await getAdminOverviewLite();
      setOverview(ov);
      setLiveCalls(Array.isArray(ov?.liveCalls) ? ov.liveCalls : []);
    } catch (e) {
      // Recovery path only: if overview-lite fails, try standalone live endpoint.
      try {
        const live = await getAdminLiveCalls();
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
      const bundle = await getAdminAnalyticsBundle(range);
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
      const out = await getAdminAnalyticsDrilldown({ type, id, ...range });
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

  const refreshDids = useCallback(async () => {
    const didList = await listAdminDids();
    setDids(didList.dids || []);
  }, []);

  useEffect(() => {
    // One-time shell + DIDs load (range-independent).
    Promise.all([
      loadShell(),
      refreshDids(),
    ]);
  }, [loadShell, refreshDids]);

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
  }, [loadShell, loadAnalytics, refreshDids]);

  const campaigns = overview?.campaigns || [];
  const statsSummary = callStats?.summary || {
    totalCalls: 0,
    answerRate: 0,
    billableRate: 0,
    totalCost: 0,
  };

  const handleCreateDid = async (e) => {
    e.preventDefault();
    if (!didForm.phoneE164.trim() || !didForm.campaignId) {
      toast.error('Phone and campaign are required');
      return;
    }
    try {
      await createAdminDid({
        phoneE164: didForm.phoneE164.trim(),
        campaignId: didForm.campaignId,
        label: didForm.label.trim(),
        active: didForm.active,
      });
      toast.success('Route created');
      setDidForm({ phoneE164: '', campaignId: '', label: '', active: true });
      await refreshDids();
    } catch (err) {
      toast.error(err.message || 'Failed to create');
    }
  };

  const toggleDidActive = async (row) => {
    try {
      await patchAdminDid(row.id, { active: !row.active });
      toast.success('Updated');
      await refreshDids();
    } catch (err) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const removeDid = async (row) => {
    if (!window.confirm(`Remove route for ${row.phoneE164}?`)) return;
    try {
      await deleteAdminDid(row.id);
      toast.success('Removed');
      await refreshDids();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
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

  if (loading && !overview) {
    return <PageLoader />;
  }

  const pool = overview?.pool || { available: [], ringing: [], busy: [] };
  const byCampaign = overview?.byCampaign || {};

  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <div className={classes.iconBox}>
          <Shield size={24} />
        </div>
        <div>
          <h1 className={classes.title}>Admin</h1>
          <p className={classes.subtitle}>Owner analytics, live operations, and routing control center</p>
        </div>
      </div>

      <section className={classes.card}>
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
      </section>

      <div className={classes.grid}>
        <div className={classes.statCard}>
          <Users size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Live agents</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (overview?.totalAgents ?? 0)}</span>
        </div>
        <div className={classes.statCard}>
          <Radio size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Available</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.available?.length ?? 0)}</span>
        </div>
        <div className={classes.statCard}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Ringing</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.ringing?.length ?? 0)}</span>
        </div>
        <div className={classes.statCard}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Busy</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.busy?.length ?? 0)}</span>
        </div>
      </div>

      <section className={classes.card}>
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
      </section>

      <section className={classes.card}>
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
      </section>

      <section className={classes.card}>
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <tr><td colSpan={5} className={classes.muted}>Loading…</td></tr>
                  <tr><td colSpan={5}><div className={classes.skeletonRow} /></td></tr>
                  <tr><td colSpan={5}><div className={classes.skeletonRow} /></td></tr>
                </>
              ) : (overview?.agents || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className={classes.muted}>
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
                    <td>{a.licensedStates?.length || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={classes.card}>
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
      </section>

      <section className={classes.card}>
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
              </tr>
            </thead>
            <tbody>
              {analyticsLoading ? (
                <tr><td colSpan={6} className={classes.muted}>Loading analytics…</td></tr>
              ) : filteredAgentStats.length === 0 ? (
                <tr><td colSpan={6} className={classes.muted}>No agent stats match this filter</td></tr>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={classes.card}>
        <div className={classes.cardTopRow}>
          <h2 className={classes.cardTitle}>Drilldown</h2>
          {(selectedCampaign || selectedAgent) ? (
            <div className={classes.filterRow}>
              <span className={classes.statusPill}>
                {selectedCampaign ? `Campaign: ${selectedCampaign}` : `Agent: ${selectedAgent}`}
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
          </>
        )}
      </section>

      <section className={classes.card}>
        <h2 className={classes.cardTitle}>Phone numbers → campaign</h2>
        <p className={classes.hint}>
          Incoming Twilio calls use the called number to resolve the campaign when no query/body campaign is set.
        </p>

        <form className={classes.didForm} onSubmit={handleCreateDid}>
          <div className={classes.formField}>
            <label>Phone (E.164)</label>
            <input
              className={classes.input}
              placeholder="+15551234567"
              value={didForm.phoneE164}
              onChange={(e) => setDidForm((f) => ({ ...f, phoneE164: e.target.value }))}
            />
          </div>
          <div className={classes.formField}>
            <label>Campaign</label>
            <select
              className={classes.select}
              value={didForm.campaignId}
              onChange={(e) => setDidForm((f) => ({ ...f, campaignId: e.target.value }))}
            >
              <option value="">Select campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.id})
                </option>
              ))}
            </select>
          </div>
          <div className={classes.formField}>
            <label>Label</label>
            <input
              className={classes.input}
              placeholder="Optional"
              value={didForm.label}
              onChange={(e) => setDidForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div className={classes.formFieldInline}>
            <label className={classes.check}>
              <input
                type="checkbox"
                checked={didForm.active}
                onChange={(e) => setDidForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>
            <button type="submit" className={classes.primaryBtn}>
              <Plus size={16} />
              Add route
            </button>
          </div>
        </form>

        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Campaign</th>
                <th>Label</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dids.length === 0 ? (
                <tr>
                  <td colSpan={5} className={classes.muted}>
                    No routes yet
                  </td>
                </tr>
              ) : (
                dids.map((d) => (
                  <tr key={d.id}>
                    <td className={classes.mono}>{d.phoneE164}</td>
                    <td>{d.campaignId}</td>
                    <td>{d.label || '—'}</td>
                    <td>{d.active !== false ? 'Yes' : 'No'}</td>
                    <td className={classes.actions}>
                      <button type="button" className={classes.linkBtn} onClick={() => toggleDidActive(d)}>
                        Toggle active
                      </button>
                      <button type="button" className={classes.dangerBtn} onClick={() => removeDid(d)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboardPage;
