import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, TrendingUp, AlertTriangle, PhoneCall } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import classes from './QAFeedbackPage.module.css';
import { getQaPatterns, getQaScorecards, getQaSummary, getQaTrend } from '../services/qaService';

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(seconds) {
  const n = Number(seconds || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const QAFeedbackPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ avgScore: 0, reviewedCalls: 0, needsImprovement: 0 });
  const [trend, setTrend] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [patterns, setPatterns] = useState({
    summary: '',
    anomalies: [],
    campaignPatterns: [],
    statePatterns: [],
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, t, c, p] = await Promise.all([
        getQaSummary(),
        getQaTrend({ limit: 12 }),
        getQaScorecards({ limit: 50 }),
        getQaPatterns(),
      ]);
      setSummary(s?.summary || { avgScore: 0, reviewedCalls: 0, needsImprovement: 0 });
      setTrend(Array.isArray(t?.points) ? t.points : []);
      setScorecards(Array.isArray(c?.rows) ? c.rows : []);
      setPatterns({
        summary: String(p?.summary || ''),
        anomalies: Array.isArray(p?.anomalies) ? p.anomalies : [],
        campaignPatterns: Array.isArray(p?.campaignPatterns) ? p.campaignPatterns : [],
        statePatterns: Array.isArray(p?.statePatterns) ? p.statePatterns : [],
      });
    } catch (err) {
      setError(err?.message || 'Failed to load QA insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const hasData = useMemo(() => scorecards.length > 0 || trend.length > 0, [scorecards, trend]);

  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <div className={classes.iconBox}><CheckCircle2 size={24} /></div>
        <div>
          <h2>QA Feedback</h2>
          <p>AI scorecards and operational insights from your completed calls</p>
        </div>
      </div>

      <div className={classes.statsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><TrendingUp size={18} /></div>
          <span className={classes.statLabel}>Average Score</span>
          <span className={classes.statValue}>{summary.avgScore}<span className={classes.statMax}>/100</span></span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><PhoneCall size={18} /></div>
          <span className={classes.statLabel}>Reviewed Calls</span>
          <span className={classes.statValue}>{summary.reviewedCalls}</span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><AlertTriangle size={18} /></div>
          <span className={classes.statLabel}>Needs Improvement</span>
          <span className={classes.statValue}>{summary.needsImprovement}</span>
        </div>
      </div>

      {error && (
        <div className={classes.errorBar}>
          <span>{error}</span>
          <button type="button" onClick={load} className={classes.retryBtn}>Retry</button>
        </div>
      )}

      <div className={classes.card}>
        <h3>Score Trend (Most Recent 12)</h3>
        <div className={classes.chartWrap}>
          {!loading && trend.length === 0 && (
            <div className={classes.empty}>No reviewed calls yet.</div>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 24, left: -8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="call"
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                label={{ value: 'Call #', position: 'insideBottomRight', offset: -10, fill: 'var(--text-secondary)', fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-container-high)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
                labelFormatter={(v) => `Call #${v}`}
                formatter={(v) => [`${v}/100`, 'Score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--accent-green)"
                strokeWidth={2}
                dot={{ r: 4, fill: 'var(--accent-green)', stroke: 'var(--surface)', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={classes.card}>
        <h3>Operational Insights</h3>
        <p className={classes.insightSummary}>
          {loading ? 'Generating insights…' : (patterns.summary || 'No insights yet.')}
        </p>
        <div className={classes.insightGrid}>
          <div>
            <h4 className={classes.insightHeading}>Trend Anomalies</h4>
            {patterns.anomalies.length === 0 ? (
              <p className={classes.empty}>No major anomalies in this range.</p>
            ) : (
              patterns.anomalies.map((a) => (
                <div key={a.day} className={classes.insightRow}>
                  <span>{a.day}</span>
                  <span>{a.avgScore}/100 ({a.deltaFromBaseline > 0 ? '+' : ''}{a.deltaFromBaseline})</span>
                </div>
              ))
            )}
          </div>
          <div>
            <h4 className={classes.insightHeading}>Campaign Patterns</h4>
            {patterns.campaignPatterns.length === 0 ? (
              <p className={classes.empty}>No campaign patterns yet.</p>
            ) : (
              patterns.campaignPatterns.slice(0, 5).map((r) => (
                <div key={r.key} className={classes.insightRow}>
                  <span>{r.key}</span>
                  <span>{r.avgScore}/100 · {r.volume} calls</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={classes.card}>
        <h3>Call Scorecards</h3>
        {!loading && !hasData && (
          <div className={classes.empty}>No reviewed calls yet.</div>
        )}
        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Caller</th>
                <th>Duration</th>
                <th>Score</th>
                <th>Status</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((row) => (
                <tr key={row.id}>
                  <td>{fmtDate(row.date)}</td>
                  <td>{row.caller}</td>
                  <td>{fmtDuration(row.duration)}</td>
                  <td className={classes.scoreCell}>{row.score}</td>
                  <td>
                    <span className={`${classes.badge} ${row.status === 'good' ? classes.badgeGood : classes.badgeWarn}`}>
                      {row.status === 'good' ? 'Good' : 'Needs Improvement'}
                    </span>
                  </td>
                  <td>{row.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QAFeedbackPage;
