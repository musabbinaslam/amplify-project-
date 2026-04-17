import { useEffect, useMemo, useState } from 'react';
import {
  Brain, TrendingUp, ClipboardCheck, Clock3, Target, Filter, RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line,
} from 'recharts';
import { AI_RANGE_PRESETS } from '../constants/aiTrainingMockData';
import {
  getAiTrainingBundle,
  updateAiTrainingDrillStatus,
  updateAiCoachingTask,
} from '../services/aiTrainingService';
import { useUIStore } from '../store/uiStore';
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

const AITrainingPage = () => {
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
    const evidenceNote = String(taskDraftById[taskId] || '').trim();
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
    } catch {
      setError('Failed to update coaching task');
      setCoachingTasks(prev);
    }
  };

  return (
    <div className={classes.page}>
      <div className={classes.header}>
        <div className={classes.iconBox}><Brain size={24} /></div>
        <div>
          <h2>AI Training</h2>
          <p>Post-call scorecards, targeted drills, and coaching progress</p>
        </div>
      </div>

      <div className={classes.topBar}>
        <div className={classes.rangePills}>
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
            className={classes.refreshBtn}
            onClick={() => load({ refreshPlan: true })}
            disabled={loading}
          >
            Regenerate Plan
          </button>
        </div>
      </div>

      {error && (
        <div className={classes.errorBar}>
          <span>{error}</span>
          <button type="button" className={classes.retryBtn} onClick={load}>Retry</button>
        </div>
      )}

      <div className={classes.statsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><Target size={18} /></div>
          <span className={classes.statLabel}>Average Score</span>
          <span className={classes.statValue}>{summary?.avgScore ?? '—'}<span className={classes.statMax}>/100</span></span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><ClipboardCheck size={18} /></div>
          <span className={classes.statLabel}>Reviewed Calls</span>
          <span className={classes.statValue}>{summary?.reviewedCalls ?? '—'}</span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><TrendingUp size={18} /></div>
          <span className={classes.statLabel}>Improvement</span>
          <span className={classes.statValue}>{summary?.improvementPct ?? '—'}%</span>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIcon}><Clock3 size={18} /></div>
          <span className={classes.statLabel}>Pending Drills</span>
          <span className={classes.statValue}>{summary?.pendingDrills ?? '—'}</span>
        </div>
      </div>

      <div className={classes.card}>
        <div className={classes.cardHead}>
          <h3>Training Progress Trend</h3>
        </div>
        <div className={classes.chartWrap}>
          {loading ? <p className={classes.empty}>Loading trend...</p> : null}
          {!loading && !trend.length ? <p className={classes.empty}>No trend data for selected range.</p> : null}
          <ResponsiveContainer key={chartRenderKey} width="100%" height={230}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-container-high)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
                formatter={(v) => [`${v}/100`, 'Score']}
              />
              <Line type="monotone" dataKey="score" stroke="var(--accent-green)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={classes.twoCol}>
        <div className={classes.card}>
          <div className={classes.cardHead}>
            <h3><Filter size={16} /> Scorecards</h3>
            <div className={classes.filters}>
              <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                {campaignOptions.map((o) => (
                  <option key={o} value={o}>{o === 'all' ? 'All campaigns' : o}</option>
                ))}
              </select>
              <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
                <option value="all">All outcomes</option>
                <option value="sale">Sale</option>
                <option value="no-sale">No sale</option>
                <option value="callback">Callback</option>
                <option value="hangup">Hangup</option>
              </select>
              <select value={minScoreFilter} onChange={(e) => setMinScoreFilter(e.target.value)}>
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
            <p className={classes.empty}>No scorecards match your filters.</p>
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

        <div className={classes.card}>
          <div className={classes.cardHead}><h3>Scorecard Details</h3></div>
          {!selectedScorecard ? (
            <p className={classes.empty}>Select a scorecard to view training insights.</p>
          ) : (
            <div className={classes.detail}>
              <div className={classes.detailMeta}>
                <span>{selectedScorecard.callId}</span>
                <span>Confidence: {Math.round(selectedScorecard.confidence * 100)}%</span>
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
                <div>
                  <h4>What went well</h4>
                  <ul>{selectedScorecard.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div>
                  <h4>What to improve</h4>
                  <ul>{selectedScorecard.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={classes.card}>
        <div className={classes.cardHead}>
          <h3>Recommended Drills</h3>
        </div>
        {!derivedDrills.length ? (
          <p className={classes.empty}>No drills right now.</p>
        ) : (
          <div className={classes.drillGrid}>
            {derivedDrills.map((d) => (
              <div key={d.id} className={classes.drillCard}>
                <div className={classes.drillTop}>
                  <h4>{d.title}</h4>
                  <span className={`${classes.drillStatus} ${classes[`status${d.status.replace('-', '')}`]}`}>{d.status}</span>
                </div>
                <p className={classes.drillReason}>{d.reason}</p>
                <p className={classes.drillScript}>{d.recommendedScript}</p>
                <div className={classes.drillActions}>
                  <button type="button" onClick={() => handleDrillState(d.id, 'in-progress')}>Start</button>
                  <button type="button" onClick={() => handleDrillState(d.id, 'completed')}>Mark Complete</button>
                  <button type="button" onClick={() => handleDrillState(d.id, 'snoozed')}>Snooze</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={classes.twoCol}>
        <div className={classes.card}>
          <div className={classes.cardHead}><h3>Guided Improvement Plan</h3></div>
          {!coachingPlan?.focusAreas?.length ? (
            <p className={classes.empty}>No guided plan generated yet. Refresh to regenerate from recent calls.</p>
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
                  <p className={classes.scriptLine}>{area.scriptExample}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={classes.card}>
          <div className={classes.cardHead}><h3>Impact Tracker</h3></div>
          {!coachingImpact?.competencies?.length ? (
            <p className={classes.empty}>No impact data yet for this window.</p>
          ) : (
            <div className={classes.impactGrid}>
              {coachingImpact.competencies.map((row) => (
                <div key={row.key} className={classes.impactRow}>
                  <strong>{row.competency}</strong>
                  <span>{row.baselineScore} {'->'} {row.currentScore}</span>
                  <b className={row.delta >= 0 ? classes.deltaUp : classes.deltaDown}>
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={classes.card}>
        <div className={classes.cardHead}><h3>Task Checklist</h3></div>
        {!coachingTasks.length ? (
          <p className={classes.empty}>No coaching tasks yet.</p>
        ) : (
          <div className={classes.taskList}>
            {coachingTasks.map((task) => (
              <div key={task.id} className={classes.taskRow}>
                <div className={classes.taskMeta}>
                  <strong>{task.title || `${task.competency} task`}</strong>
                  <span>{task.competency}</span>
                </div>
                <textarea
                  className={classes.taskNote}
                  placeholder="Add evidence note (required for complete)"
                  value={taskDraftById[task.id] ?? task.evidenceNote ?? ''}
                  onChange={(e) => setTaskDraftById((prev) => ({ ...prev, [task.id]: e.target.value }))}
                />
                <div className={classes.taskActions}>
                  <button type="button" onClick={() => handleCoachingTaskUpdate(task.id, 'in-progress')}>Start</button>
                  <button type="button" onClick={() => handleCoachingTaskUpdate(task.id, 'blocked')}>Block</button>
                  <button type="button" onClick={() => handleCoachingTaskUpdate(task.id, 'completed')}>Complete</button>
                </div>
                <span className={`${classes.drillStatus} ${classes[`status${String(task.status || 'new').replace('-', '')}`]}`}>
                  {task.status || 'new'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AITrainingPage;
