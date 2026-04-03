import React from 'react';
import { CheckCircle2, TrendingUp, AlertTriangle, PhoneCall } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import classes from './QAFeedbackPage.module.css';

const TREND_DATA = [
  { call: 1, score: 68 },
  { call: 2, score: 74 },
  { call: 3, score: 71 },
  { call: 4, score: 80 },
  { call: 5, score: 85 },
  { call: 6, score: 78 },
  { call: 7, score: 90 },
  { call: 8, score: 88 },
  { call: 9, score: 92 },
  { call: 10, score: 76 },
  { call: 11, score: 84 },
  { call: 12, score: 87 },
];

const SCORECARDS = [
  { id: 1, date: 'Apr 1, 2026', caller: 'John M.', duration: '4:32', score: 92, status: 'good' },
  { id: 2, date: 'Apr 1, 2026', caller: 'Sarah K.', duration: '6:15', score: 87, status: 'good' },
  { id: 3, date: 'Mar 31, 2026', caller: 'David R.', duration: '3:48', score: 64, status: 'needs-improvement' },
  { id: 4, date: 'Mar 31, 2026', caller: 'Emily T.', duration: '5:02', score: 90, status: 'good' },
  { id: 5, date: 'Mar 30, 2026', caller: 'Michael B.', duration: '7:21', score: 58, status: 'needs-improvement' },
  { id: 6, date: 'Mar 30, 2026', caller: 'Lisa P.', duration: '4:10', score: 84, status: 'good' },
  { id: 7, date: 'Mar 29, 2026', caller: 'James W.', duration: '5:44', score: 76, status: 'good' },
  { id: 8, date: 'Mar 29, 2026', caller: 'Anna C.', duration: '3:15', score: 55, status: 'needs-improvement' },
];

const avgScore = Math.round(SCORECARDS.reduce((s, c) => s + c.score, 0) / SCORECARDS.length);
const reviewedCount = SCORECARDS.length;
const needsImprovement = SCORECARDS.filter((c) => c.status === 'needs-improvement').length;

const QAFeedbackPage = () => {
  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <div className={classes.iconBox}><CheckCircle2 size={24} /></div>
        <div>
          <h2>QA Feedback</h2>
          <p>AI scorecards and coaching feedback from your completed calls</p>
        </div>
      </div>

      <div className={classes.statsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><TrendingUp size={18} /></div>
          <span className={classes.statLabel}>Average Score</span>
          <span className={classes.statValue}>{avgScore}<span className={classes.statMax}>/100</span></span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><PhoneCall size={18} /></div>
          <span className={classes.statLabel}>Reviewed Calls</span>
          <span className={classes.statValue}>{reviewedCount}</span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><AlertTriangle size={18} /></div>
          <span className={classes.statLabel}>Needs Improvement</span>
          <span className={classes.statValue}>{needsImprovement}</span>
        </div>
      </div>

      <div className={classes.card}>
        <h3>Score Trend (Most Recent 12)</h3>
        <div className={classes.chartWrap}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={TREND_DATA} margin={{ top: 8, right: 24, left: -8, bottom: 12 }}>
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
        <h3>Call Scorecards</h3>
        <div className={classes.tableWrap}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Caller</th>
                <th>Duration</th>
                <th>Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SCORECARDS.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.caller}</td>
                  <td>{row.duration}</td>
                  <td className={classes.scoreCell}>{row.score}</td>
                  <td>
                    <span className={`${classes.badge} ${row.status === 'good' ? classes.badgeGood : classes.badgeWarn}`}>
                      {row.status === 'good' ? 'Good' : 'Needs Improvement'}
                    </span>
                  </td>
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
