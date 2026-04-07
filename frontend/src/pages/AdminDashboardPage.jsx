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
  getAdminOverview,
  getAdminCallStats,
  getAdminCampaignCallStats,
  getAdminAgentCallStats,
  getAdminLiveCalls,
  listAdminDids,
  createAdminDid,
  patchAdminDid,
  deleteAdminDid,
} from '../services/adminService';
import useAuthStore from '../store/authStore';
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
    // Fast path: overview + dids + live calls
    setLoading(true);
    try {
      const [ov, didList, live] = await Promise.all([
        getAdminOverview(),
        listAdminDids(),
        getAdminLiveCalls(),
      ]);
      setOverview(ov);
      setDids(didList.dids || []);
      setLiveCalls(live.rows || []);
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
      const [stats, campaigns, agents] = await Promise.all([
        getAdminCallStats(range),
        getAdminCampaignCallStats(range),
        getAdminAgentCallStats(range),
      ]);
      setCallStats(stats);
      setCampaignStats(campaigns.rows || []);
      setAgentStats(agents.rows || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getRange]);

  useEffect(() => {
    refreshUserRole?.();
  }, [refreshUserRole]);

  useEffect(() => {
    // Initial load: shell then analytics
    loadShell().then(() => loadAnalytics());
    // Poll only lightweight live data every 15s
    const interval = setInterval(() => {
      loadShell();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadShell, loadAnalytics]);

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
      loadShell();
    } catch (err) {
      toast.error(err.message || 'Failed to create');
    }
  };

  const toggleDidActive = async (row) => {
    try {
      await patchAdminDid(row.id, { active: !row.active });
      toast.success('Updated');
      loadShell();
    } catch (err) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const removeDid = async (row) => {
    if (!window.confirm(`Remove route for ${row.phoneE164}?`)) return;
    try {
      await deleteAdminDid(row.id);
      toast.success('Removed');
      loadShell();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const filteredAgentStats = useMemo(() => {
    if (!agentSearch.trim()) return agentStats;
    return agentStats.filter((row) => row.agentId.toLowerCase().includes(agentSearch.toLowerCase()));
  }, [agentStats, agentSearch]);

  if (loading && !overview) {
    return (
      <div className={classes.page}>
        <p className={classes.muted}>Loading admin dashboard…</p>
      </div>
    );
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
                  <span className={classes.mono}>{row.agentId}</span>
                  <span>{row.campaignId}</span>
                  <span className={classes.statusPill}>{row.status}</span>
                </div>
              ))}
            </div>
          )}
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
                <th>Agent ID</th>
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
                    <td className={classes.mono}>{a.id}</td>
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
                  <tr key={row.campaign}>
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
            placeholder="Search by agent id"
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
                  <tr key={row.agentId}>
                    <td className={classes.mono}>{row.agentId}</td>
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
