import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import {
  getAdminAiAgentPlans,
  getAdminAiCoachingOverview,
} from '../services/adminService';
import classes from './AdminAITrainingPage.module.css';

const AdminAITrainingPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, plansRes] = await Promise.all([
        getAdminAiCoachingOverview(),
        getAdminAiAgentPlans({ status: statusFilter, risk: riskFilter, search }),
      ]);
      setOverview(overviewRes || null);
      setRows(Array.isArray(plansRes?.rows) ? plansRes.rows : []);
    } catch (err) {
      setError(err?.message || 'Failed to load admin coaching visibility');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, riskFilter]);

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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                <tr key={row.uid}>
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
    </section>
  );
};

export default AdminAITrainingPage;
