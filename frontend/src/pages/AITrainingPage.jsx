import { useEffect, useMemo, useState } from 'react';
import {
  Brain, TrendingUp, ClipboardCheck, Clock3, Target, Filter, RefreshCw,
  LineChart as LineChartIcon, Inbox, ListChecks,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line,
} from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import { AI_RANGE_PRESETS } from '../constants/aiTrainingMockData';
import {
  getAiTrainingBundle,
  updateAiTrainingDrillStatus,
  updateAiCoachingTask,
} from '../services/aiTrainingService';
import { useUIStore } from '../store/uiStore';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './AITrainingPage.module.css';

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDuration(sec) {
  const n = Number(sec || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function statusClass(status) {
  return classes[`status${String(status || 'new').replace('-', '')}`] || classes.statusnew;
}

/* eslint-disable react/prop-types -- local stat card helper */
function StatCard({ icon: Icon, label, value, suffix, variants }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
    >
      <div className={classes.statIconBox}><Icon size={20} /></div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>
        {value ?? '—'}
        {suffix ? <span className={classes.statMax}>{suffix}</span> : null}
      </div>
    </motion.div>
  );
}

const AITrainingPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const isSidebarCollapsed = useUIStore((s) => s.isSidebarCollapsed);
  const [range, setRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [drills, setDrills] = useState([]);
  const [coachingPlan, setCoachingPlan] = useState(null);
  const [coachingTasks, setCoachingTasks] = useState([]);
  const [coachingImpact, setCoachingImpact] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [taskDraftById, setTaskDraftById] = useState({});

  const [campaignFilter, setCampaignFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [minScoreFilter, setMinScoreFilter] = useState('all');
  const [chartRenderKey, setChartRenderKey] = useState(0);

  useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
      setChartRenderKey((k) => k + 1);
    };
    const t = setTimeout(triggerResize, 340);
    triggerResize();
    return () => clearTimeout(t);
  }, [isSidebarCollapsed]);

  const getRangeParams = () => {
    const to = new Date();
    const from = new Date(to);
    if (range === '7d') from.setDate(to.getDate() - 6);
    else if (range === '30d') from.setDate(to.getDate() - 29);
    else from.setDate(to.getDate() - 89);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  };

  const load = async (options = {}) => {
    const forceRefreshPlan = Boolean(options.refreshPlan);
    setLoading(true);
    setError('');
    try {
      const bundle = await getAiTrainingBundle({
        ...getRangeParams(),
        campaign: campaignFilter,
        outcome: outcomeFilter,
        minScore: minScoreFilter,
        limit: 150,
        ...(forceRefreshPlan ? { refresh: true } : {}),
      });
      setSummary(bundle.summary);
      setTrend(bundle.trend || []);
      setScorecards(bundle.scorecards || []);
      setDrills(bundle.drills || []);
      setCoachingPlan(bundle.coachingPlan || null);
      setCoachingTasks(bundle.coachingTasks || []);
      setCoachingImpact(bundle.coachingImpact || null);
      if (bundle.scorecards?.length) {
        setSelectedId((prev) => {
          if (prev && bundle.scorecards.some((s) => s.id === prev)) return prev;
          return bundle.scorecards[0].id;
        });
      }
    } catch (err) {
      setError(err?.message || 'Failed to load AI training data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, campaignFilter, outcomeFilter, minScoreFilter]);

  const campaignOptions = useMemo(() => {
    const set = new Set(scorecards.map((s) => s.campaign));
    return ['all', ...Array.from(set)];
  }, [scorecards]);

  const filteredScorecards = useMemo(() => scorecards, [scorecards]);

  const selectedScorecard = useMemo(() => {
    if (!filteredScorecards.length) return null;
    return filteredScorecards.find((row) => row.id === selectedId) || filteredScorecards[0];
  }, [filteredScorecards, selectedId]);

  const derivedDrills = useMemo(() => {
    if (!selectedScorecard) return drills;
    const weakKeys = selectedScorecard.rubric
      .filter((r) => r.score < 70)
      .map((r) => r.label.toLowerCase());
    const matched = drills.filter((d) => weakKeys.some((k) => d.focus.toLowerCase().includes(k)));
    return matched.length ? matched : drills;
  }, [selectedScorecard, drills]);

  const handleDrillState = async (id, status) => {
    setDrills((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
    try {
      await updateAiTrainingDrillStatus(id, status);
    } catch {
      setError('Failed to persist drill status');
    }
  };

  const handleCoachingTaskUpdate = async (taskId, status) => {
    const evidenceNote = String(taskDraftById[taskId] ?? '').trim();
    if (status === 'completed' && evidenceNote.length < 10) {
      setError('Add at least 10 characters of evidence before completing the task.');
      return;
    }
    const prev = coachingTasks;
    setCoachingTasks((rows) => rows.map((row) => (
      row.id === taskId ? { ...row, status, evidenceNote: evidenceNote || row.evidenceNote || '' } : row
    )));
    try {
      await updateAiCoachingTask(taskId, {
        status,
        ...(evidenceNote ? { evidenceNote } : {}),
      });
      setError('');
    } catch {
      setError('Failed to update coaching task');
      setCoachingTasks(prev);
    }
  };

  if (loading && !summary) return <PageLoader />;

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={presets.child}>
        <div className={classes.pageHeader}>
          <div className={classes.iconBox}><Brain size={22} /></div>
          <div>
            <h2>AI Training</h2>
            <p>Post-call scorecards, targeted drills, and coaching progress</p>
          </div>
        </div>
      </motion.div>

      <motion.div className={`glass ${classes.toolbar}`} variants={presets.child}>
        <div className={`glass ${classes.rangePills}`}>
          {AI_RANGE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${classes.pillBtn} ${range === p ? classes.pillBtnActive : ''}`}
              onClick={() => setRange(p)}
            >
              {p === '7d' ? 'Last 7d' : p === '30d' ? 'Last 30d' : 'Last 90d'}
            </button>
          ))}
        </div>
        <div className={classes.topActions}>
          <button type="button" className={classes.refreshBtn} onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? classes.spin : ''} />
            Refresh
          </button>
          <button
            type="button"
            className={classes.regenerateBtn}
            onClick={() => load({ refreshPlan: true })}
            disabled={loading}
          >
            Regenerate Plan
          </button>
        </div>
      </motion.div>

      {error ? (
        <motion.div className={classes.errorBanner} variants={presets.child}>
          <span>{error}</span>
          <button type="button" className={classes.retryBtn} onClick={load}>Retry</button>
        </motion.div>
      ) : null}

      <motion.div className={classes.statsGrid} variants={presets.statsStrip}>
        <StatCard
          icon={Target}
          label="Average Score"
          value={summary?.avgScore ?? null}
          suffix="/100"
          variants={presets.child}
        />
        <StatCard
          icon={ClipboardCheck}
          label="Reviewed Calls"
          value={summary?.reviewedCalls ?? null}
          variants={presets.child}
        />
        <StatCard
          icon={TrendingUp}
          label="Improvement"
          value={summary?.improvementPct != null ? `${summary.improvementPct}%` : null}
          variants={presets.child}
        />
        <StatCard
          icon={Clock3}
          label="Pending Drills"
          value={summary?.pendingDrills ?? null}
          variants={presets.child}
        />
      </motion.div>

      <motion.div className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardHead}>
          <h3>Training Progress Trend</h3>
        </div>
        <div className={classes.chartWrap}>
          {loading ? (
            <div className={classes.chartEmpty}>
              <p>Loading trend…</p>
            </div>
          ) : trend.length > 0 ? (
            <ResponsiveContainer key={chartRenderKey} width="100%" height={230}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'color-mix(in srgb, var(--surface-container-highest) 92%, transparent)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-lg)',
                    backdropFilter: 'blur(12px)',
                  }}
                  formatter={(v) => [`${v}/100`, 'Score']}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--brand-text)"
                  strokeWidth={2}
                  isAnimationActive={!reduceMotion}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={classes.chartEmpty}>
              <LineChartIcon size={32} className={classes.chartEmptyIcon} />
              <h4>No trend data yet</h4>
              <p>Try a wider date range or refresh after more calls are reviewed.</p>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div className={classes.twoCol} variants={presets.child}>
        <div className={`glass ${classes.scorecardsPane}`}>
          <div className={classes.cardHead}>
            <h3><Filter size={16} /> Scorecards</h3>
            <div className={classes.filters}>
              <select
                className={classes.filterSelect}
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
              >
                {campaignOptions.map((o) => (
                  <option key={o} value={o}>{o === 'all' ? 'All campaigns' : o}</option>
                ))}
              </select>
              <select
                className={classes.filterSelect}
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
              >
                <option value="all">All outcomes</option>
                <option value="sale">Sale</option>
                <option value="no-sale">No sale</option>
                <option value="callback">Callback</option>
                <option value="hangup">Hangup</option>
              </select>
              <select
                className={classes.filterSelect}
                value={minScoreFilter}
                onChange={(e) => setMinScoreFilter(e.target.value)}
              >
                <option value="all">Any score</option>
                <option value="70">70+</option>
                <option value="80">80+</option>
                <option value="90">90+</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className={classes.skeletonList}>
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
            </div>
          ) : filteredScorecards.length === 0 ? (
            <div className={classes.emptyPanel}>
              <Inbox size={28} className={classes.emptyPanelIcon} />
              <h4>No scorecards match</h4>
              <p>Adjust your filters or try a wider date range.</p>
            </div>
          ) : (
            <div className={classes.list}>
              {filteredScorecards.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`${classes.listItem} ${selectedScorecard?.id === row.id ? classes.listItemActive : ''}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <div>
                    <strong>{row.campaign} · {row.state}</strong>
                    <span>{fmtDate(row.date)} · {fmtDuration(row.durationSec)} · {row.outcome}</span>
                  </div>
                  <span className={classes.scorePill}>{row.score}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`glass ${classes.detailPane}`}>
          <div className={classes.cardHead}><h3>Scorecard Details</h3></div>
          {!selectedScorecard ? (
            <div className={classes.emptyPanel}>
              <ClipboardCheck size={28} className={classes.emptyPanelIcon} />
              <h4>Select a scorecard</h4>
              <p>Choose a call from the list to view rubric scores and coaching feedback.</p>
            </div>
          ) : (
            <div className={classes.detail}>
              <div className={classes.detailMeta}>
                <span className={classes.metaChip}>{selectedScorecard.callId}</span>
                <span className={classes.metaChip}>
                  Confidence {Math.round(selectedScorecard.confidence * 100)}%
                </span>
                <span className={classes.metaChip}>{selectedScorecard.outcome}</span>
              </div>

              <div className={classes.rubric}>
                {selectedScorecard.rubric.map((r) => (
                  <div key={r.key} className={classes.rubricRow}>
                    <div className={classes.rubricHead}>
                      <span>{r.label}</span>
                      <b>{r.score}</b>
                    </div>
                    <div className={classes.rubricTrack}>
                      <div className={classes.rubricFill} style={{ width: `${r.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className={classes.feedbackBlocks}>
                <div className={classes.feedbackPanel}>
                  <h4>What went well</h4>
                  <ul>{selectedScorecard.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div className={classes.feedbackPanel}>
                  <h4>What to improve</h4>
                  <ul>{selectedScorecard.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardHead}>
          <h3>Recommended Drills</h3>
        </div>
        {!derivedDrills.length ? (
          <div className={classes.emptyPanel}>
            <Target size={28} className={classes.emptyPanelIcon} />
            <h4>No drills right now</h4>
            <p>Drills appear when scorecards highlight areas to practice.</p>
          </div>
        ) : (
          <div className={classes.drillGrid}>
            {derivedDrills.map((d) => (
              <div key={d.id} className={classes.drillCard}>
                <div className={classes.drillTop}>
                  <h4>{d.title}</h4>
                  <span className={`${classes.statusBadge} ${statusClass(d.status)}`}>{d.status}</span>
                </div>
                <p className={classes.drillReason}>{d.reason}</p>
                <p className={classes.drillScript}>{d.recommendedScript}</p>
                <div className={classes.drillActions}>
                  <button type="button" className={classes.startBtn} onClick={() => handleDrillState(d.id, 'in-progress')}>
                    Start
                  </button>
                  {d.status === 'in-progress' ? (
                    <button type="button" className={classes.completeBtn} onClick={() => handleDrillState(d.id, 'completed')}>
                      Mark Complete
                    </button>
                  ) : null}
                  <button type="button" className={classes.snoozeBtn} onClick={() => handleDrillState(d.id, 'snoozed')}>
                    Snooze
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div className={classes.twoCol} variants={presets.child}>
        <div className={`glass ${classes.sectionCard}`}>
          <div className={classes.cardHead}><h3>Guided Improvement Plan</h3></div>
          {!coachingPlan?.focusAreas?.length ? (
            <div className={classes.emptyPanel}>
              <Brain size={28} className={classes.emptyPanelIcon} />
              <h4>No guided plan yet</h4>
              <p>Use Regenerate Plan to build a plan from recent calls.</p>
            </div>
          ) : (
            <div className={classes.guidedList}>
              {coachingPlan.focusAreas.map((area) => (
                <div key={area.competencyKey} className={classes.guidedCard}>
                  <div className={classes.guidedHead}>
                    <h4>{area.competency}</h4>
                    <span className={classes.scorePill}>Baseline {area.baselineScore}</span>
                  </div>
                  <p>{area.rootCauseSummary}</p>
                  <ul>
                    {(area.steps || []).map((step) => <li key={step}>{step}</li>)}
                  </ul>
                  <p className={classes.scriptQuote}>{area.scriptExample}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`glass ${classes.sectionCard}`}>
          <div className={classes.cardHead}><h3>Impact Tracker</h3></div>
          {!coachingImpact?.competencies?.length ? (
            <div className={classes.emptyPanel}>
              <TrendingUp size={28} className={classes.emptyPanelIcon} />
              <h4>No impact data yet</h4>
              <p>Impact metrics appear after coaching tasks are completed.</p>
            </div>
          ) : (
            <div className={classes.impactGrid}>
              {coachingImpact.competencies.map((row) => {
                const pct = Math.min(100, Math.max(0, row.currentScore));
                return (
                  <div key={row.key} className={classes.impactRow}>
                    <strong>{row.competency}</strong>
                    <span>{row.baselineScore} → {row.currentScore}</span>
                    <span className={`${classes.deltaPill} ${row.delta >= 0 ? classes.deltaUp : classes.deltaDown}`}>
                      {row.delta >= 0 ? `+${row.delta}` : row.delta}
                    </span>
                    <div className={classes.impactBarWrap}>
                      <div className={classes.impactBar} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      <motion.div className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardHead}><h3>Task Checklist</h3></div>
        {!coachingTasks.length ? (
          <div className={classes.emptyPanel}>
            <ListChecks size={28} className={classes.emptyPanelIcon} />
            <h4>No coaching tasks yet</h4>
            <p>Tasks are generated with your guided improvement plan.</p>
          </div>
        ) : (
          <div className={classes.taskList}>
            {coachingTasks.map((task) => {
              const draft = taskDraftById[task.id] ?? task.evidenceNote ?? '';
              const showEvidence = task.status === 'in-progress' || task.status === 'blocked';
              const canComplete = String(draft).trim().length >= 10;

              return (
                <div key={task.id} className={classes.taskCard}>
                  <div className={classes.taskHeader}>
                    <div>
                      <strong>{task.title || `${task.competency} task`}</strong>
                    </div>
                    <span className={classes.competencyChip}>{task.competency}</span>
                  </div>

                  <span className={`${classes.statusBadge} ${statusClass(task.status)}`}>
                    {task.status || 'new'}
                  </span>

                  {showEvidence ? (
                    <>
                      <textarea
                        className={classes.taskEvidence}
                        placeholder="Add evidence note (min. 10 characters to complete)"
                        value={draft}
                        onChange={(e) => setTaskDraftById((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      />
                      {!canComplete ? (
                        <p className={classes.taskEvidenceHint}>
                          {10 - String(draft).trim().length} more characters needed to complete
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  <div className={classes.taskActions}>
                    <button
                      type="button"
                      className={classes.taskStartBtn}
                      onClick={() => handleCoachingTaskUpdate(task.id, 'in-progress')}
                    >
                      Start
                    </button>
                    <button
                      type="button"
                      className={classes.taskBlockBtn}
                      onClick={() => handleCoachingTaskUpdate(task.id, 'blocked')}
                    >
                      Block
                    </button>
                    <button
                      type="button"
                      className={classes.taskCompleteBtn}
                      disabled={!canComplete}
                      onClick={() => handleCoachingTaskUpdate(task.id, 'completed')}
                    >
                      Complete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default AITrainingPage;
