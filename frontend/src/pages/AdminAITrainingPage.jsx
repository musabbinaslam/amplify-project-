import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, RefreshCw, Users, AlertTriangle, ClipboardCheck,
  TrendingUp, Inbox, Search,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../motion/appMotion';
import {
  getAdminAiAgentPlans,
  getAdminAiCoachingOverview,
} from '../services/adminService';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './AdminAITrainingPage.module.css';

const CHART_TOOLTIP_STYLE = {
  background: 'color-mix(in srgb, var(--surface-container-highest) 92%, transparent)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-lg)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  fontSize: 13,
};

const RISK_PILL_CLASS = {
  high: classes.riskHigh,
  medium: classes.riskMedium,
  low: classes.riskLow,
};

function formatChartDay(day) {
  if (!day) return '';
  const d = new Date(`2026-${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getAgentDisplay(row) {
  const uid = row?.uid || '';
  const email = row?.email || '';
  const name = row?.name || '';
  const nameIsUid = !email && (name === uid || !name);
  const primary = nameIsUid
    ? (uid.length > 22 ? `${uid.slice(0, 10)}…${uid.slice(-6)}` : uid)
    : (name || email || uid);
  const subline = email || (nameIsUid && uid ? uid : '');
  const title = nameIsUid ? uid : `${name} ${email}`.trim();
  return { primary, subline, title };
}

function capitalizeRisk(risk) {
  if (!risk) return '—';
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

/* eslint-disable react/prop-types -- local presentation helpers */
const StatCard = ({ label, value, icon: Icon, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.statIconBox}>
        <Icon size={18} />
      </div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>{value ?? '—'}</div>
    </motion.div>
  );
};

const ChartLegend = ({ items }) => (
  <div className={classes.chartLegend}>
    {items.map((item) => (
      <span key={item.label} className={classes.chartLegendItem}>
        <span className={classes.chartLegendDot} style={{ background: item.color }} />
        {item.label}
      </span>
    ))}
  </div>
);

const AdminProgressChart = ({ data, agentName, reduceMotion }) => {
  if (!data?.length) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={32} className={classes.chartEmptyIcon} />
        <h4>No timeline points yet</h4>
        <p>Score history will appear after coaching metrics are recorded.</p>
      </div>
    );
  }

  return (
    <>
      <div className={classes.chartHead}>
        <h4 className={classes.subTitle} style={{ margin: 0 }}>{agentName} — Progress Timeline</h4>
        <ChartLegend items={[{ label: 'Score', color: 'var(--brand-text)' }]} />
      </div>
      <div className={classes.chartWrap}>
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="adminAiScoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={formatChartDay}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={formatChartDay}
              formatter={(value, name) => {
                if (name === 'score') return [`${value}/100`, 'Score'];
                if (name === 'callCount') return [value, 'Calls'];
                return [value, name];
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--brand-text)"
              fill="url(#adminAiScoreFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

const AdminAITrainingPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
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
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.iconBox} aria-hidden="true">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2>Admin AI Coaching Visibility</h2>
          <p>Track coaching adherence, risk, and outcome movement across agents.</p>
        </div>
      </motion.div>

      <motion.div className={`glass ${classes.toolbar}`} variants={presets.child}>
        <div className={classes.filterRow}>
          <input
            className={classes.searchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search agents"
          />
          <select
            className={classes.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
          </select>
          <select
            className={classes.select}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            aria-label="Filter by risk"
          >
            <option value="all">All risks</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
        </div>
        <button type="button" className={classes.refreshBtn} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? classes.spin : ''} />
          Refresh
        </button>
      </motion.div>

      {error ? (
        <motion.div className={classes.errorBanner} variants={presets.child}>
          <span>{error}</span>
          <button type="button" className={classes.retryBtn} onClick={load}>Retry</button>
        </motion.div>
      ) : null}

      <motion.div className={classes.statsRow} variants={presets.statsStrip}>
        <StatCard
          label="Total Agents"
          value={overview?.summary?.totalAgents ?? null}
          icon={Users}
          variants={presets.child}
        />
        <StatCard
          label="High Risk"
          value={overview?.summary?.highRiskAgents ?? null}
          icon={AlertTriangle}
          variants={presets.child}
        />
        <StatCard
          label="Avg Completion"
          value={overview?.summary?.avgCompletionRate != null
            ? `${Math.round((overview.summary.avgCompletionRate || 0) * 100)}%`
            : null}
          icon={ClipboardCheck}
          variants={presets.child}
        />
      </motion.div>

      <motion.div className={classes.overviewGrid} variants={presets.child}>
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <h3 className={classes.cardTitle}>Status Distribution</h3>
          {!statusRows.length ? (
            <div className={classes.emptyPanel}>
              <Inbox size={28} className={classes.emptyPanelIcon} />
              <h4>No plan statuses yet</h4>
              <p>Status breakdown appears when agents have active coaching plans.</p>
            </div>
          ) : (
            <div className={classes.chipWrap}>
              {statusRows.map(([label, count]) => (
                <span key={label} className={classes.statusChip}>{label}: {count}</span>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <h3 className={classes.cardTitle}>Completion by Competency</h3>
          {!overview?.completionByCompetency?.length ? (
            <div className={classes.emptyPanel}>
              <Inbox size={28} className={classes.emptyPanelIcon} />
              <h4>No competency data yet</h4>
              <p>Completion rates by focus area will show here once plans include tasks.</p>
            </div>
          ) : (
            <div className={classes.compList}>
              {overview.completionByCompetency.map((row) => {
                const pct = Math.round((row.completionRate || 0) * 100);
                return (
                  <div key={row.competency} className={classes.compRow}>
                    <div className={classes.compHead}>
                      <span>{row.competency}</span>
                      <b>{pct}%</b>
                    </div>
                    <div className={classes.compTrack}>
                      <div className={classes.compFill} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>
      </motion.div>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h3 className={classes.cardTitle}>Agent Plans</h3>
        {loading ? (
          <div className={classes.emptyPanel}>
            <RefreshCw size={24} className={`${classes.emptyPanelIcon} ${classes.spin}`} />
            <p>Loading coaching plans…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className={classes.emptyPanel}>
            <Search size={28} className={classes.emptyPanelIcon} />
            <h4>No matching agent plans</h4>
            <p>Try adjusting filters or search terms.</p>
          </div>
        ) : (
          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
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
                  {rows.map((row) => {
                    const agent = getAgentDisplay(row);
                    return (
                      <tr
                        key={row.uid}
                        className={`${classes.clickableRow} ${selectedRow?.uid === row.uid ? classes.rowActive : ''}`}
                        onClick={() => setSelectedUid(row.uid)}
                        role="button"
                        tabIndex={0}
                        aria-selected={selectedRow?.uid === row.uid}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSelectedUid(row.uid);
                        }}
                      >
                        <td className={classes.agentCell}>
                          <strong title={agent.title}>{agent.primary}</strong>
                          {agent.subline ? <span title={agent.subline}>{agent.subline}</span> : null}
                        </td>
                        <td className={classes.pillCell}>
                          <span className={`${classes.drillPill} ${RISK_PILL_CLASS[row.risk] || ''}`}>
                            {capitalizeRisk(row.risk)}
                          </span>
                        </td>
                        <td>{Math.round((row.completionRate || 0) * 100)}%</td>
                        <td>{row.recentScoreAvg}</td>
                        <td>{row.scoreDelta >= 0 ? `+${row.scoreDelta}` : row.scoreDelta}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h3 className={classes.cardTitle}>Agent Drilldown</h3>
        {!selectedRow ? (
          <div className={classes.emptyPanel}>
            <Inbox size={28} className={classes.emptyPanelIcon} />
            <h4>Select an agent</h4>
            <p>Choose a row in the agent plans table to view trend and risk breakdown.</p>
          </div>
        ) : (
          <div className={classes.drilldownGrid}>
            <div className={classes.detailPane}>
              <AdminProgressChart
                data={selectedRow.trendPoints}
                agentName={getAgentDisplay(selectedRow).primary}
                reduceMotion={reduceMotion}
              />
            </div>
            <div className={classes.detailPane}>
              <h4>Why risk is {selectedRow.risk}</h4>
              <ul className={classes.reasonList}>
                {(selectedRow.riskReasons || []).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <div className={classes.metaChipRow}>
                <span className={classes.metaChip}>
                  Tasks: {selectedRow.completedTasks}/{selectedRow.totalTasks}
                </span>
                <span className={classes.metaChip}>
                  Score: {selectedRow.recentScoreAvg}
                </span>
                <span className={classes.metaChip}>
                  Delta: {selectedRow.scoreDelta >= 0 ? `+${selectedRow.scoreDelta}` : selectedRow.scoreDelta}
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h3 className={classes.cardTitle}>High-Risk Agents</h3>
        {!overview?.highRiskAgents?.length ? (
          <div className={classes.emptyPanel}>
            <Inbox size={28} className={classes.emptyPanelIcon} />
            <h4>No high-risk agents</h4>
            <p>Agents flagged as high risk will appear here for quick review.</p>
          </div>
        ) : (
          <div className={classes.highRiskList}>
            {overview.highRiskAgents.slice(0, 6).map((row) => {
              const agent = getAgentDisplay(row);
              return (
                <div key={row.uid} className={classes.highRiskRow}>
                  <div className={classes.highRiskMain}>
                    <strong title={agent.title}>{agent.primary}</strong>
                    {agent.subline ? <span title={agent.subline}>{agent.subline}</span> : null}
                  </div>
                  <div className={classes.highRiskMeta}>
                    <span>Completion: {Math.round((row.completionRate || 0) * 100)}%</span>
                    <span>Score: {row.recentScoreAvg}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>
    </motion.div>
  );
};

export default AdminAITrainingPage;
