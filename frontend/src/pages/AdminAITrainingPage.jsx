import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line,
} from 'recharts';
import {
  getAdminAiAgentPlans,
  getAdminAiCoachingOverview,
} from '../services/adminService';
import PageLoader from '../components/ui/PageLoader';
import classes from './AdminAITrainingPage.module.css';

const AdminAITrainingPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedUid, setSelectedUid] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, plansRes] = await Promise.all([
        getAdminAiCoachingOverview(),
        getAdminAiAgentPlans({ status: statusFilter, risk: riskFilter, search }),
      ]);
      setOverview(overviewRes || null);
      const nextRows = Array.isArray(plansRes?.rows) ? plansRes.rows : [];
      setRows(nextRows);
      setSelectedUid((prev) => (prev && nextRows.some((r) => r.uid === prev) ? prev : (nextRows[0]?.uid || '')));
    } catch (err) {
      setError(err?.message || 'Failed to load admin coaching visibility');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, riskFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const statusRows = useMemo(() => {
    const dist = overview?.statusDistribution || {};
    return Object.entries(dist);
  }, [overview]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.uid === selectedUid) || rows[0] || null,
    [rows, selectedUid],
  );

  if (loading && !overview) return <PageLoader />;

  return (
    <section className={classes.page}>
      <header className={classes.header}>
        <div className={classes.icon}><ShieldCheck size={22} /></div>
        <div>
          <h2>Admin AI Coaching Visibility</h2>
          <p>Track coaching adherence, risk, and outcome movement across agents.</p>
        </div>
      </header>

      <div className={classes.controls}>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name or email"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
        </select>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="all">All risks</option>
          <option value="high">High risk</option>
          <option value="medium">Medium risk</option>
          <option value="low">Low risk</option>
        </select>
        <button type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? classes.spin : ''} />
          Refresh
        </button>
      </div>

      {error && <div className={classes.error}>{error}</div>}

      <div className={classes.stats}>
        <article>
          <span>Total Agents</span>
          <strong>{overview?.summary?.totalAgents ?? '—'}</strong>
        </article>
        <article>
          <span>High Risk</span>
          <strong>{overview?.summary?.highRiskAgents ?? '—'}</strong>
        </article>
        <article>
          <span>Avg Completion</span>
          <strong>{Math.round((overview?.summary?.avgCompletionRate || 0) * 100)}%</strong>
        </article>
      </div>

      <div className={classes.gridTwo}>
        <div className={classes.tableWrap}>
          <h3>Status Distribution</h3>
          {!statusRows.length ? <p>No plan statuses yet.</p> : (
            <div className={classes.chipWrap}>
              {statusRows.map(([label, count]) => (
                <span key={label} className={classes.statusChip}>{label}: {count}</span>
              ))}
            </div>
          )}
        </div>

        <div className={classes.tableWrap}>
          <h3>Completion by Competency</h3>
          {!overview?.completionByCompetency?.length ? <p>No competency completion data yet.</p> : (
            <div className={classes.compList}>
              {overview.completionByCompetency.map((row) => (
                <div key={row.competency} className={classes.compRow}>
                  <span>{row.competency}</span>
                  <b>{Math.round((row.completionRate || 0) * 100)}%</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={classes.tableWrap}>
        {loading ? <p>Loading coaching plans...</p> : null}
        {!loading && rows.length === 0 ? <p>No matching agent plans.</p> : null}
        {!!rows.length && (
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Risk</th>
                <th>Completion</th>
                <th>Recent Score</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.uid}
                  className={`${classes.clickableRow} ${selectedRow?.uid === row.uid ? classes.rowActive : ''}`}
                  onClick={() => setSelectedUid(row.uid)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedUid(row.uid);
                  }}
                >
                  <td>
                    <strong>{row.name}</strong>
                    <span>{row.email}</span>
                  </td>
                  <td><span className={`${classes.pill} ${classes[`risk${row.risk}`]}`}>{row.risk}</span></td>
                  <td>{Math.round((row.completionRate || 0) * 100)}%</td>
                  <td>{row.recentScoreAvg}</td>
                  <td>{row.scoreDelta >= 0 ? `+${row.scoreDelta}` : row.scoreDelta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={classes.tableWrap}>
        <h3>Agent Drilldown</h3>
        {!selectedRow ? (
          <p>Select an agent row to view trend and risk breakdown.</p>
        ) : (
          <div className={classes.drilldownGrid}>
            <div className={classes.innerCard}>
              <h4>{selectedRow.name} - Progress Timeline</h4>
              {!selectedRow.trendPoints?.length ? (
                <p>No timeline points yet.</p>
              ) : (
                <div className={classes.chartBox}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={selectedRow.trendPoints}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface-container-high)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                        formatter={(value, key) => [key === 'score' ? `${value}/100` : value, key === 'score' ? 'Score' : 'Calls']}
                      />
                      <Line type="monotone" dataKey="score" stroke="var(--brand-text)" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className={classes.innerCard}>
              <h4>Why risk is {selectedRow.risk}</h4>
              <ul className={classes.reasonList}>
                {(selectedRow.riskReasons || []).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className={classes.kpiBlock}>
                <span>Completed Tasks: {selectedRow.completedTasks}/{selectedRow.totalTasks}</span>
                <span>Recent Score: {selectedRow.recentScoreAvg}</span>
                <span>Delta: {selectedRow.scoreDelta >= 0 ? `+${selectedRow.scoreDelta}` : selectedRow.scoreDelta}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={classes.tableWrap}>
        <h3>High-Risk Agents</h3>
        {!overview?.highRiskAgents?.length ? <p>No high-risk agents currently.</p> : (
          <div className={classes.highRiskList}>
            {overview.highRiskAgents.slice(0, 6).map((row) => (
              <div key={row.uid} className={classes.highRiskRow}>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.email || row.uid}</span>
                </div>
                <div>
                  <span>Completion: {Math.round((row.completionRate || 0) * 100)}%</span>
                  <span>Score: {row.recentScoreAvg}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminAITrainingPage;
