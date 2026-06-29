import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Users, Phone, Radio, RefreshCw, Trash2, Plus, CalendarDays,
  CircleDollarSign, Activity, Play, X, ChevronDown, FileText, TrendingUp, Bell,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AreaChart,
  Area,
  Line,
  ComposedChart,
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
  forceRemoveAgent,
  listAdminCallContests,
  approveAdminCallContest,
  denyAdminCallContest,
  refundAdminCall,
  getAdminCampaignControls,
  patchAdminCampaignControl,
  flagAdminAgent,
  resumeAdminAgent,
} from '../services/adminService';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../motion/appMotion';
import useAuthStore from '../store/authStore';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { RecordingModal } from './CallLogsPage';
import { auth } from '../config/firebase';
import { getApiBaseUrl } from '../config/apiBase';
import classes from './AdminDashboardPage.module.css';

const CHART_TOOLTIP_STYLE = {
  background: 'color-mix(in srgb, var(--surface-container-highest) 92%, transparent)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-lg)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  fontSize: 13,
};

const formatChartDay = (day) => {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const hasChartData = (data, keys) => {
  if (!data?.length) return false;
  return data.some((row) => keys.some((k) => Number(row[k]) > 0));
};

/* eslint-disable react/prop-types -- local presentation helpers */
const StatCard = ({ label, value, icon: Icon, variants, loading, wide }) => {
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
      <div className={classes.statValue}>
        {loading ? <span className={wide ? classes.skeletonNumWide : classes.skeletonNum} /> : value}
      </div>
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

const AdminCallTrendChart = ({ data, loading, reduceMotion, totalCalls, answerRatePct }) => {
  if (loading) {
    return (
      <div className={classes.chartEmpty}>
        <p>Loading analytics…</p>
      </div>
    );
  }
  if (!hasChartData(data, ['totalCalls', 'answeredCalls'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={32} className={classes.chartEmptyIcon} />
        <h4>No call data in selected range</h4>
        <p>Try a wider date range or refresh after more activity.</p>
      </div>
    );
  }
  return (
    <>
      <div className={classes.chartHead}>
        <div>
          <h3 className={classes.cardTitle}>Call trends</h3>
          <div className={classes.chartMeta}>
            <span>{totalCalls} total calls</span>
            <span>{answerRatePct}% answer rate</span>
          </div>
        </div>
        <ChartLegend items={[
          { label: 'Total calls', color: 'var(--brand-text)' },
          { label: 'Answered', color: 'var(--accent-cyan)' },
        ]}
        />
      </div>
      <div className={classes.chartWrap}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="adminTotalCallsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-text)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--brand-text)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="adminAnsweredFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0} />
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
              allowDecimals={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={formatChartDay}
              formatter={(value, name) => [value, name === 'totalCalls' ? 'Total calls' : 'Answered']}
            />
            <Area
              type="monotone"
              dataKey="totalCalls"
              stroke="var(--brand-text)"
              fill="url(#adminTotalCallsFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Area
              type="monotone"
              dataKey="answeredCalls"
              stroke="var(--accent-cyan)"
              fill="url(#adminAnsweredFill)"
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

const AdminDrilldownTrendChart = ({ data, loading, reduceMotion }) => {
  const chartData = useMemo(
    () => (data || []).map((row) => ({
      ...row,
      answerRatePct: Math.round((row.answerRate || 0) * 100),
      billableRatePct: Math.round((row.billableRate || 0) * 100),
    })),
    [data],
  );

  if (loading) {
    return (
      <div className={classes.chartEmpty}>
        <p>Loading trend…</p>
      </div>
    );
  }
  if (!hasChartData(chartData, ['calls'])) {
    return (
      <div className={classes.chartEmpty}>
        <TrendingUp size={32} className={classes.chartEmptyIcon} />
        <h4>No trend data in selected range</h4>
        <p>Select another campaign or agent, or widen the date range.</p>
      </div>
    );
  }
  return (
    <>
      <ChartLegend items={[
        { label: 'Calls', color: 'var(--brand-text)' },
        { label: 'Answer rate', color: 'var(--accent-cyan)' },
        { label: 'Billable rate', color: 'var(--accent-green)' },
      ]}
      />
      <div className={classes.chartWrap}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="adminDrilldownCallsFill" x1="0" y1="0" x2="0" y2="1">
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
              yAxisId="left"
              allowDecimals={false}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={formatChartDay}
              formatter={(value, name) => {
                if (name === 'calls') return [value, 'Calls'];
                if (name === 'answerRatePct') return [`${value}%`, 'Answer rate'];
                if (name === 'billableRatePct') return [`${value}%`, 'Billable rate'];
                return [value, name];
              }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="calls"
              stroke="var(--brand-text)"
              fill="url(#adminDrilldownCallsFill)"
              strokeWidth={2}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="answerRatePct"
              stroke="var(--accent-cyan)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="billableRatePct"
              stroke="var(--accent-green)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

async function fetchContestProofBlob(url) {
  if (!url) throw new Error('No proof URL');
  if (!url.startsWith('/api/')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not load proof file');
    return res.blob();
  }
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${getApiBaseUrl()}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not load proof file');
  return res.blob();
}

async function openContestProofUrl(url) {
  if (!url) return;
  try {
    const blob = await fetchContestProofBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (e) {
    toast.error(e.message || 'Failed to open proof');
  }
}

function isImageProof(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(file?.name || '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/.test(name);
}

function ContestProofImage({ url, name, onOpen }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await fetchContestProofBlob(url);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div className={classes.contestProofPreviewPlaceholder} aria-busy="true">
        Loading preview…
      </div>
    );
  }

  if (error || !src) {
    return (
      <button type="button" className={classes.contestProofChip} onClick={() => onOpen(url)}>
        <FileText size={14} />
        <span>{name || 'Proof file'}</span>
      </button>
    );
  }

  return (
    <figure className={classes.contestProofFigure}>
      <button
        type="button"
        className={classes.contestProofImageBtn}
        onClick={() => onOpen(url)}
        title="Open full size"
      >
        <img src={src} alt={name || 'Contest proof'} className={classes.contestProofImage} />
      </button>
      {name ? <figcaption className={classes.contestProofCaption}>{name}</figcaption> : null}
    </figure>
  );
}

function formatContestCategory(category) {
  if (!category) return '—';
  return String(category).replace(/_/g, ' ');
}

const CONTEST_EXPAND_TRANSITION = { duration: 0.32, ease: EASE_SMOOTH };

function ContestReviewCard({
  contest: c,
  expanded,
  onToggle,
  onOpenProof,
  onPlayRecording,
  onApprove,
  onDeny,
}) {
  const reduceMotion = useReducedMotion();
  const expandTransition = reduceMotion ? { duration: 0 } : CONTEST_EXPAND_TRANSITION;
  const expandMotion = reduceMotion
    ? {}
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
      };

  const isPending = c.status === 'pending';
  const statusClass =
    c.status === 'pending' ? classes.dispAnswered : c.status === 'approved' ? classes.dispSold : classes.dispMissed;

  return (
    <article className={`glass ${classes.contestCard} ${expanded ? classes.contestCardExpanded : ''}`}>
      <button type="button" className={classes.contestCardSummary} onClick={onToggle}>
        <div className={classes.contestCardSummaryMain}>
          <div className={classes.contestCardIdentity}>
            <span className={classes.contestCardName}>{c.agentName || c.agentId}</span>
            <span className={classes.contestCardMeta}>
              {c.campaignLabel || c.campaign}
              <span className={classes.contestCardDot}>·</span>
              ${Number(c.cost || 0).toFixed(2)}
              <span className={classes.contestCardDot}>·</span>
              {formatContestCategory(c.category)}
            </span>
          </div>
          <div className={classes.contestCardSummaryAside}>
            <span className={classes.contestCardWhen}>
              {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}
            </span>
            <span className={`${classes.statusPill} ${statusClass}`}>{c.status}</span>
            <ChevronDown size={18} className={classes.contestCardChevron} />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="contest-detail"
            className={classes.contestCardExpandWrap}
            {...expandMotion}
            transition={expandTransition}
          >
            <div className={classes.contestCardBody}>
          <div className={classes.contestReviewGrid}>
            <section className={classes.contestReviewMain}>
              <h4 className={classes.contestReviewHeading}>Agent explanation</h4>
              <p className={classes.contestReviewReason}>{c.agentReason || '—'}</p>

              <h4 className={classes.contestReviewHeading}>Proof</h4>
              {c.proofFiles?.length > 0 ? (
                <div className={classes.contestProofSection}>
                  {c.proofFiles.some(isImageProof) ? (
                    <div className={classes.contestProofGallery}>
                      {c.proofFiles.filter(isImageProof).map((f) => (
                        <ContestProofImage
                          key={f.proofId || f.url || f.name}
                          url={f.url}
                          name={f.name}
                          onOpen={onOpenProof}
                        />
                      ))}
                    </div>
                  ) : null}
                  {c.proofFiles.filter((f) => !isImageProof(f)).length > 0 ? (
                    <div className={classes.contestProofList}>
                      {c.proofFiles.filter((f) => !isImageProof(f)).map((f) => (
                        <button
                          key={f.storagePath || f.url || f.proofId}
                          type="button"
                          className={classes.contestProofChip}
                          onClick={() => onOpenProof(f.url)}
                        >
                          <FileText size={14} />
                          <span>{f.name || 'Proof file'}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={classes.muted}>No proof files attached.</p>
              )}

              {c.adminNote && !isPending ? (
                <>
                  <h4 className={classes.contestReviewHeading}>Admin note</h4>
                  <p className={classes.contestReviewReason}>{c.adminNote}</p>
                </>
              ) : null}
            </section>

            <aside className={classes.contestReviewSide}>
              <h4 className={classes.contestReviewHeading}>Call details</h4>
              <dl className={classes.contestFacts}>
                <div>
                  <dt>Agent</dt>
                  <dd>{c.agentName || c.agentId}</dd>
                </div>
                <div>
                  <dt>Campaign</dt>
                  <dd>{c.campaignLabel || c.campaign}</dd>
                </div>
                <div>
                  <dt>Charge</dt>
                  <dd className={classes.contestFactAmount}>${Number(c.cost || 0).toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{c.duration}s</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{formatContestCategory(c.category)}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}</dd>
                </div>
                <div>
                  <dt>Call log</dt>
                  <dd className={classes.contestFactMono}>{c.callLogId?.slice(0, 12)}…</dd>
                </div>
              </dl>

              <div className={classes.contestRecordingBlock}>
                <h4 className={classes.contestReviewHeading}>Recording</h4>
                {c.recordingUrl ? (
                  <button type="button" className={classes.contestRecordingBtn} onClick={onPlayRecording}>
                    <Play size={14} /> Play recording
                  </button>
                ) : (
                  <p className={classes.muted}>No recording available</p>
                )}
              </div>

              {isPending ? (
                <div className={classes.contestActionStack}>
                  <button type="button" className={classes.primaryBtn} onClick={onApprove}>
                    Approve & credit ${Number(c.cost || 0).toFixed(2)}
                  </button>
                  <button type="button" className={classes.dangerBtn} onClick={onDeny}>
                    Deny contest
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

const ACTION_MODAL_CONFIG = {
  approve_contest: {
    title: 'Approve & credit',
    confirmLabel: 'Approve & credit',
    confirmClass: 'primaryBtn',
    label: 'Approval note',
    placeholder: 'Why is this call being credited? (visible on billing history)',
  },
  deny_contest: {
    title: 'Deny contest',
    confirmLabel: 'Deny contest',
    confirmClass: 'dangerBtn',
    label: 'Denial reason',
    placeholder: 'Explain to the agent why this contest was denied',
  },
  refund_call: {
    title: 'Refund call charge',
    confirmLabel: 'Confirm refund',
    confirmClass: 'primaryBtn',
    label: 'Refund reason',
    placeholder: 'Why is this call being credited? (visible on billing history)',
  },
};

function AdminActionModal({ modal, note, onNoteChange, submitting, onClose, onSubmit }) {
  if (!modal) return null;
  const cfg = ACTION_MODAL_CONFIG[modal.type];
  const { agentName, amount } = modal.context || {};

  let subtitle = '';
  if (modal.type === 'approve_contest') {
    subtitle = `Credit $${amount} to ${agentName}. Minimum 10 characters.`;
  } else if (modal.type === 'deny_contest') {
    subtitle = `The agent (${agentName}) will see this on their call log.`;
  } else if (modal.type === 'refund_call') {
    subtitle = `Credit $${amount} to ${agentName}. Minimum 10 characters.`;
  }

  return (
    <motion.div
      className={classes.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className={`glass ${classes.modalBox}`}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={classes.modalHeader}>
          <h3>{cfg.title}</h3>
          <button type="button" className={classes.modalCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={classes.modalSub}>{subtitle}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className={classes.modalLabel}>
            {cfg.label}
            <textarea
              className={classes.modalTextarea}
              rows={4}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={cfg.placeholder}
              autoFocus
              required
            />
          </label>
          <div className={classes.modalActions}>
            <button type="button" className={classes.modalCancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={classes[cfg.confirmClass]} disabled={submitting}>
              {submitting ? 'Saving…' : cfg.confirmLabel}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

const AdminDashboardPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
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
  const [campaignControls, setCampaignControls] = useState({});
  const [pauseReasonDraft, setPauseReasonDraft] = useState({});
  const [analyticsMeta, setAnalyticsMeta] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownSortOrder, setDrilldownSortOrder] = useState('desc');
  const [drilldownSortField, setDrilldownSortField] = useState('date');
  const [drilldownDay, setDrilldownDay] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [activeRecording, setActiveRecording] = useState(null);
  const [didForm, setDidForm] = useState({
    phoneE164: '',
    campaignId: '',
    label: '',
    active: true,
  });
  const [forceRemoveAgentId, setForceRemoveAgentId] = useState('');
  const [callContests, setCallContests] = useState([]);
  const [contestFilter, setContestFilter] = useState('pending');
  const [contestsLoading, setContestsLoading] = useState(false);
  const [expandedContestId, setExpandedContestId] = useState(null);
  const [refundingLogId, setRefundingLogId] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [flagModal, setFlagModal] = useState(null);
  const [flagReason, setFlagReason] = useState('Low billable rate — below 30% threshold');

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

  const refreshCampaignControls = useCallback(async () => {
    const out = await getAdminCampaignControls();
    setCampaignControls(out?.campaigns || {});
  }, []);

  const loadCallContests = useCallback(async (status = contestFilter) => {
    setContestsLoading(true);
    try {
      const out = await listAdminCallContests(status, 50);
      setCallContests(out.contests || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load call contests');
    } finally {
      setContestsLoading(false);
    }
  }, [contestFilter]);

  useEffect(() => {
    // One-time shell + DIDs load (range-independent).
    Promise.all([
      loadShell(),
      refreshDids(),
      refreshCampaignControls(),
      loadCallContests('pending'),
    ]);
  }, [loadShell, refreshDids, refreshCampaignControls, loadCallContests]);

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

  const toggleCampaignPause = async (campaignId, nextPaused) => {
    try {
      const reason = String(pauseReasonDraft[campaignId] || '').trim();
      const out = await patchAdminCampaignControl(campaignId, { paused: nextPaused, reason });
      setCampaignControls(out?.campaigns || {});
      toast.success(nextPaused ? 'Campaign paused' : 'Campaign resumed');
      await loadShell();
    } catch (err) {
      toast.error(err.message || 'Failed to update campaign state');
    }
  };

  const openApproveContestModal = (contest) => {
    setActionNote('');
    setActionModal({
      type: 'approve_contest',
      context: {
        contest,
        agentName: contest.agentName || contest.agentId,
        amount: Number(contest.cost || 0).toFixed(2),
      },
    });
  };

  const openDenyContestModal = (contest) => {
    setActionNote('');
    setActionModal({
      type: 'deny_contest',
      context: {
        contest,
        agentName: contest.agentName || contest.agentId,
      },
    });
  };

  const openRefundCallModal = (log) => {
    if (log.contestStatus === 'pending') {
      toast.error('Resolve the pending contest first');
      return;
    }
    setActionNote('');
    setActionModal({
      type: 'refund_call',
      context: {
        log,
        agentName: log.agentName || log.agentId,
        amount: Number(log.cost || 0).toFixed(2),
      },
    });
  };

  const submitActionModal = async () => {
    const trimmed = actionNote.trim();
    if (trimmed.length < 10) {
      toast.error('Note must be at least 10 characters');
      return;
    }
    if (!actionModal) return;

    setActionSubmitting(true);
    try {
      if (actionModal.type === 'approve_contest') {
        const { contest } = actionModal.context;
        await approveAdminCallContest(contest.id, trimmed);
        toast.success('Contest approved — wallet credited');
        setExpandedContestId(null);
        setActionModal(null);
        setActionNote('');
        setCallContests((prev) => (
          contestFilter === 'pending'
            ? prev.filter((c) => c.id !== contest.id)
            : prev.map((c) => (c.id === contest.id ? { ...c, status: 'approved' } : c))
        ));
        void loadCallContests(contestFilter);
        if (selectedCampaign || selectedAgent) {
          void loadDrilldown(selectedCampaign ? 'campaign' : 'agent', selectedCampaign || selectedAgent);
        }
      } else if (actionModal.type === 'deny_contest') {
        const { contest } = actionModal.context;
        await denyAdminCallContest(contest.id, trimmed);
        toast.success('Contest denied');
        setExpandedContestId(null);
        setActionModal(null);
        setActionNote('');
        setCallContests((prev) => (
          contestFilter === 'pending'
            ? prev.filter((c) => c.id !== contest.id)
            : prev.map((c) => (c.id === contest.id ? { ...c, status: 'denied', contestDenyNote: trimmed } : c))
        ));
        void loadCallContests(contestFilter);
      } else if (actionModal.type === 'refund_call') {
        const { log } = actionModal.context;
        setRefundingLogId(log.id);
        await refundAdminCall({
          agentId: log.agentId,
          callLogId: log.id,
          reason: trimmed,
        });
        toast.success('Call refunded');
        setDrilldown((prev) => {
          if (!prev?.recentLogs) return prev;
          return {
            ...prev,
            recentLogs: prev.recentLogs.map((r) =>
              r.id === log.id ? { ...r, refunded: true, contestStatus: r.contestStatus } : r,
            ),
          };
        });
        void loadCallContests(contestFilter);
        setRefundingLogId(null);
      }
      if (actionModal.type !== 'approve_contest' && actionModal.type !== 'deny_contest') {
        setActionModal(null);
        setActionNote('');
      }
    } catch (err) {
      toast.error(err.message || 'Action failed');
      if (actionModal.type === 'refund_call') setRefundingLogId(null);
    } finally {
      setActionSubmitting(false);
    }
  };

  const closeActionModal = () => {
    if (actionSubmitting) return;
    setActionModal(null);
    setActionNote('');
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

  const handleFlagSubmit = async (e) => {
    e.preventDefault();
    if (!flagModal?.agentId) return;
    setActionSubmitting(true);
    try {
      const out = await flagAdminAgent(flagModal.agentId, flagReason);
      if (out.success) {
        toast.success(`Agent ${flagModal.agentName} has been flagged.`);
        setFlagModal(null);
        await loadShell();
        // Also refresh analytics to update the table immediately
        if (getRange().from) await loadAnalytics();
      } else {
        toast.error('Failed to flag agent');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to flag agent');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleResumeAgent = async (agentId, agentName) => {
    if (!window.confirm(`Are you sure you want to resume ${agentName}? They will be able to take calls immediately.`)) {
      return;
    }
    try {
      const out = await resumeAdminAgent(agentId);
      if (out.success) {
        toast.success(`Agent ${agentName} has been resumed.`);
        await loadShell();
        if (getRange().from) await loadAnalytics();
      } else {
        toast.error('Failed to resume agent');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to resume agent');
    }
  };

  const handleForceRemoveAgent = async (e) => {
    e.preventDefault();
    const agentId = forceRemoveAgentId.trim();
    if (!agentId) {
      toast.error('Agent ID is required');
      return;
    }
    if (!window.confirm(`Are you sure you want to FORCE remove agent ${agentId} from the pool? This will clear all their active sessions and call states.`)) {
      return;
    }
    try {
      const out = await forceRemoveAgent(agentId);
      if (out.success) {
        toast.success(`Agent ${agentId} has been removed from the pool.`);
        setForceRemoveAgentId('');
        await loadShell(); // Refresh to show they are gone
      } else {
        toast.error('Failed to remove agent');
      }
    } catch (err) {
      toast.error(err.message || 'Error removing agent');
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

  const filteredSortedDrilldownLogs = useMemo(() => {
    const all = Array.isArray(drilldown?.recentLogs) ? [...drilldown.recentLogs] : [];
    const dayFiltered = drilldownDay
      ? all.filter((log) => {
          const dt = new Date(log?.createdAt || 0);
          if (Number.isNaN(dt.getTime())) return false;
          const localY = dt.getFullYear();
          const localM = String(dt.getMonth() + 1).padStart(2, '0');
          const localD = String(dt.getDate()).padStart(2, '0');
          return `${localY}-${localM}-${localD}` === drilldownDay;
        })
      : all;

    dayFiltered.sort((a, b) => {
      if (drilldownSortField === 'duration') {
        const aDur = Number(a?.duration || 0);
        const bDur = Number(b?.duration || 0);
        return drilldownSortOrder === 'asc' ? aDur - bDur : bDur - aDur;
      }
      // default: sort by date
      const aTs = new Date(a?.createdAt || 0).getTime();
      const bTs = new Date(b?.createdAt || 0).getTime();
      const aSafe = Number.isFinite(aTs) ? aTs : 0;
      const bSafe = Number.isFinite(bTs) ? bTs : 0;
      return drilldownSortOrder === 'asc' ? aSafe - bSafe : bSafe - aSafe;
    });
    return dayFiltered;
  }, [drilldown?.recentLogs, drilldownDay, drilldownSortOrder, drilldownSortField]);

  if (loading && !overview) {
    return <PageLoader />;
  }

  const pool = overview?.pool || { available: [], ringing: [], busy: [] };
  const byCampaign = overview?.byCampaign || {};

  return (
    <>
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.iconBox} aria-hidden="true">
          <Shield size={22} />
        </div>
        <div>
          <h2>Admin</h2>
          <p>Owner analytics, live operations, and routing control center</p>
        </div>
      </motion.div>

      <motion.section className={`glass ${classes.sectionCard} ${classes.summarySection}`} variants={presets.child}>
        <div className={classes.cardTopRow}>
          <h2 className={classes.cardTitle}>Summary ({rangePreset === 'today' ? 'Today' : rangePreset === '30d' ? 'Last 30 days' : 'Last 7 days'})</h2>
          <div className={`glass ${classes.toolbar}`}>
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
        </div>
        <div className={classes.statsRow}>
          <StatCard label="Total calls" value={statsSummary.totalCalls} icon={Phone} variants={presets.child} loading={analyticsLoading} />
          <StatCard label="Answer rate" value={`${Math.round((statsSummary.answerRate || 0) * 100)}%`} icon={Activity} variants={presets.child} loading={analyticsLoading} />
          <StatCard label="Billable rate" value={`${Math.round((statsSummary.billableRate || 0) * 100)}%`} icon={Radio} variants={presets.child} loading={analyticsLoading} />
          <StatCard label="Total cost" value={`$${(statsSummary.totalCost || 0).toFixed(2)}`} icon={CircleDollarSign} variants={presets.child} loading={analyticsLoading} wide />
        </div>
        <div className={classes.metaRow}>
          <span className={classes.muted}>
            Source: {analyticsMeta?.source || 'n/a'}
          </span>
          <span className={classes.muted}>
            Updated: {analyticsMeta?.generatedAt ? new Date(analyticsMeta.generatedAt).toLocaleTimeString() : '—'}
          </span>
        </div>
      </motion.section>

      <motion.div className={classes.statsRow} variants={presets.statsStrip}>
        <StatCard label="Live agents" value={overview?.totalAgents ?? 0} icon={Users} variants={presets.child} loading={loading} />
        <StatCard label="Available" value={pool.available?.length ?? 0} icon={Radio} variants={presets.child} loading={loading} />
        <StatCard label="Ringing" value={pool.ringing?.length ?? 0} icon={Phone} variants={presets.child} loading={loading} />
        <StatCard label="Busy" value={pool.busy?.length ?? 0} icon={Phone} variants={presets.child} loading={loading} />
      </motion.div>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
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
            <div className={classes.emptyPanel}>
              <Phone size={28} className={classes.emptyPanelIcon} />
              <h4>No active calls right now</h4>
              <p>Live calls will appear here when agents are on the phone.</p>
            </div>
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
            <div className={classes.emptyPanel}>
              <Users size={28} className={classes.emptyPanelIcon} />
              <h4>No agents in pool</h4>
              <p>Agents will appear here when they go online.</p>
            </div>
          ) : (
            Object.entries(byCampaign).map(([id, n]) => (
              <span key={id} className={classes.chip}>
                {id}: <strong>{n}</strong>
              </span>
            ))
          )}
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <AdminCallTrendChart
          data={callStats?.byDay}
          loading={analyticsLoading}
          reduceMotion={reduceMotion}
          totalCalls={statsSummary.totalCalls}
          answerRatePct={Math.round((statsSummary.answerRate || 0) * 100)}
        />
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Active agents</h2>
        <div className={classes.tableWrap}>
          <div className={classes.tableScroll}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Campaign</th>
                <th>Pool</th>
                <th>Status</th>
                <th>Licensed States</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <tr><td colSpan={6} className={classes.muted}>Loading…</td></tr>
                  <tr><td colSpan={6}><div className={classes.skeletonRow} /></td></tr>
                  <tr><td colSpan={6}><div className={classes.skeletonRow} /></td></tr>
                </>
              ) : (overview?.agents || []).length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className={classes.emptyPanel}>
                      <Users size={28} className={classes.emptyPanelIcon} />
                      <h4>No agents online</h4>
                      <p>Online agents will appear in this table.</p>
                    </div>
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
                      {a.phone ? (
                        <a href={`tel:${a.phone}`} className={classes.agentPhone}>
                          {a.phone}
                        </a>
                      ) : (
                        <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                      )}
                    </td>
                    <td>{a.campaignId}</td>
                    <td><span className={classes.statusPill}>{{ available: 'Available', busy: 'In Call', ringing: 'Ringing', wrap_up: 'Wrap Up', unknown: 'Unknown' }[a.pool] || a.pool}</span></td>
                    <td><span className={classes.statusPill}>{{ AVAILABLE: 'Available', IN_CALL: 'In Call', RINGING: 'Ringing', WRAP_UP: 'Wrap Up', UNKNOWN: 'Unknown' }[a.status] || a.status}</span></td>
                    <td>{Array.isArray(a.licensedStates) && a.licensedStates.length > 0 ? a.licensedStates.join(', ') : 'None'}</td>
                    <td className={classes.actions}>
                      <button
                        type="button"
                        className={classes.dangerBtn}
                        style={{ padding: '4px 8px' }}
                        title="Force remove agent from pool"
                        onClick={async () => {
                          const agentId = a.id;
                          if (!window.confirm(`FORCE remove ${getAgentName(a)} (${agentId})?`)) return;
                          try {
                            const out = await forceRemoveAgent(agentId);
                            if (out.success) {
                              toast.success('Agent removed');
                              await loadShell();
                            }
                          } catch (err) {
                            toast.error(err.message || 'Error');
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Campaign performance</h2>
        <div className={classes.tableWrap}>
          <div className={classes.tableScroll}>
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
                <tr><td colSpan={6}>
                  <div className={classes.emptyPanel}>
                    <TrendingUp size={28} className={classes.emptyPanelIcon} />
                    <h4>No campaign stats</h4>
                    <p>No campaign data in the selected range.</p>
                  </div>
                </td></tr>
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
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
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
          <div className={classes.tableScroll}>
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Calls</th>
                <th>Answer %</th>
                <th>Billable %</th>
                <th>Avg Handle (s)</th>
                <th>Total Cost</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {analyticsLoading ? (
                <tr><td colSpan={7} className={classes.muted}>Loading analytics…</td></tr>
              ) : filteredAgentStats.length === 0 ? (
                <tr><td colSpan={7} className={classes.muted}>No agent stats match this filter</td></tr>
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
                      <details 
                        style={{ cursor: 'pointer' }}
                      >
                        <summary style={{ listStyle: 'none' }} title="Tap to view phone number">
                          <strong>{getAgentName(row)}</strong>
                          {getAgentName(row) !== getAgentId(row) ? (
                            <span className={classes.agentSubId}>{getAgentId(row)}</span>
                          ) : null}
                        </summary>
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                          {row.phone ? (
                            <a href={`tel:${row.phone}`} className={classes.agentPhone}>
                              {row.phone}
                            </a>
                          ) : (
                            <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                          )}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                            {row.flagged ? (
                              <>
                                <span style={{ color: 'hsl(0 80% 55%)', fontWeight: 'bold', fontSize: '11px' }}>
                                  🚩 FLAGGED
                                </span>
                                <button
                                  className={classes.primaryBtn}
                                  style={{ padding: '4px 8px', fontSize: '11px', minHeight: 'auto' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResumeAgent(row.agentId, getAgentName(row));
                                  }}
                                >
                                  ✅ Resume Agent
                                </button>
                              </>
                            ) : (
                              <button
                                className={classes.dangerBtn}
                                style={{ padding: '4px 8px', fontSize: '11px', minHeight: 'auto' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFlagModal({ agentId: row.agentId, agentName: getAgentName(row) });
                                }}
                              >
                                🚩 Flag Agent
                              </button>
                            )}
                          </div>
                        </div>
                      </details>
                    </td>
                    <td>{row.calls}</td>
                    <td>{Math.round((row.answerRate || 0) * 100)}%</td>
                    <td>{Math.round((row.billableRate || 0) * 100)}%</td>
                    <td>{row.avgHandleTime}</td>
                    <td>${(row.totalCost || 0).toFixed(2)}</td>
                    <td>
                      {typeof row.walletBalanceCents === 'number'
                        ? `$${(row.walletBalanceCents / 100).toFixed(2)}`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardTopRow}>
          <h2 className={classes.cardTitle}>Drilldown</h2>
          {(selectedCampaign || selectedAgent) ? (
            <div className={classes.filterRow}>
              <select
                className={`${classes.select} ${classes.drilldownSortSelect}`}
                style={{ width: 'auto', minWidth: '140px' }}
                value={drilldownSortField}
                onChange={(e) => setDrilldownSortField(e.target.value)}
                aria-label="Sort drilldown logs by field"
              >
                <option value="date">Sort: Date</option>
                <option value="duration">Sort: Duration</option>
              </select>
              <select
                className={`${classes.select} ${classes.drilldownSortSelect}`}
                style={{ width: 'auto', minWidth: '130px' }}
                value={drilldownSortOrder}
                onChange={(e) => setDrilldownSortOrder(e.target.value)}
                aria-label="Sort drilldown logs order"
              >
                <option value="desc">{drilldownSortField === 'duration' ? 'Longest first' : 'Newest first'}</option>
                <option value="asc">{drilldownSortField === 'duration' ? 'Shortest first' : 'Oldest first'}</option>
              </select>
              <input
                type="date"
                className={classes.input}
                style={{ width: 'auto', minWidth: '160px' }}
                value={drilldownDay}
                onChange={(e) => setDrilldownDay(e.target.value)}
                aria-label="Filter drilldown logs by specific day"
              />
              {drilldownDay ? (
                <button
                  type="button"
                  className={classes.filterBtn}
                  onClick={() => setDrilldownDay('')}
                >
                  Clear day
                </button>
              ) : null}
              <span className={classes.statusPill}>
                {selectedCampaign 
                  ? `Campaign: ${selectedCampaign}` 
                  : `Agent: ${overview?.agents?.find(a => a.id === selectedAgent)?.displayName || agentStats?.find(a => a.agentId === selectedAgent)?.agentName || selectedAgent}`}
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
          <div className={classes.emptyPanel}>
            <TrendingUp size={32} className={classes.emptyPanelIcon} />
            <h4>Select a campaign or agent</h4>
            <p>Click a campaign or agent row to open detailed trend and outcomes.</p>
          </div>
        ) : drilldownLoading ? (
          <div className={classes.skeletonList}>
            <div className={classes.skeletonRow} />
            <div className={classes.skeletonRow} />
          </div>
        ) : !drilldown ? (
          <p className={classes.muted}>No drilldown data available.</p>
        ) : (
          <>
            <div className={`${classes.statsRow} ${classes.statsRowThree}`}>
              <StatCard label="Calls" value={drilldown.summary?.calls ?? 0} icon={Phone} variants={presets.child} />
              <StatCard label="Answer rate" value={`${Math.round((drilldown.summary?.answerRate || 0) * 100)}%`} icon={Activity} variants={presets.child} />
              <StatCard label="Billable rate" value={`${Math.round((drilldown.summary?.billableRate || 0) * 100)}%`} icon={Radio} variants={presets.child} />
            </div>
            <div className={classes.metaRow}>
              <span className={classes.muted}>Source: {drilldown.meta?.source || 'n/a'}</span>
              <span className={classes.muted}>Rows: {drilldown.meta?.rowCount ?? 0}</span>
              <span className={classes.muted}>
                Updated: {drilldown.meta?.generatedAt ? new Date(drilldown.meta.generatedAt).toLocaleTimeString() : '—'}
              </span>
            </div>
            <AdminDrilldownTrendChart
              data={drilldown.trend}
              loading={false}
              reduceMotion={reduceMotion}
            />
            {drilldown.recentLogs && drilldown.recentLogs.length > 0 && (
              <div className={`${classes.tableWrap} ${classes.drilldownTableWrap}`}>
                <h3 className={classes.subTitle}>Recent Calls</h3>
                <table className={`${classes.table} ${classes.drilldownTable}`}>
                  <colgroup>
                    <col className={classes.colAgent} />
                    <col className={classes.colCampaign} />
                    <col className={classes.colDuration} />
                    <col className={classes.colStatus} />
                    <col className={classes.colDisposition} />
                    <col className={classes.colCost} />
                    <col className={classes.colContest} />
                    <col className={classes.colRecording} />
                    <col className={classes.colDate} />
                    <col className={classes.colActions} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Campaign</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Disposition</th>
                      <th>Cost</th>
                      <th>Contest</th>
                      <th>Recording</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDrilldownLogs.map((log) => {
                      const created = log.createdAt ? new Date(log.createdAt) : null;
                      return (
                      <tr key={log.id}>
                        <td className={classes.agentCell}>
                          <details className={classes.agentDetails}>
                            <summary title="Tap to view phone number">
                              <strong>{getAgentName(log)}</strong>
                              {getAgentName(log) !== getAgentId(log) ? (
                                <span className={classes.agentSubId} title={getAgentId(log)}>{getAgentId(log)}</span>
                              ) : null}
                            </summary>
                            <div className={classes.agentPhoneReveal}>
                              {log.phone ? (
                                <a href={`tel:${log.phone}`} className={classes.agentPhone}>
                                  {log.phone}
                                </a>
                              ) : (
                                <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                              )}
                            </div>
                          </details>
                        </td>
                        <td className={classes.campaignCell} title={log.campaign}>{log.campaign}</td>
                        <td className={classes.compactCell}>{log.duration}s</td>
                        <td className={classes.pillCell}>
                          {log.isBillable ? (
                            <span className={`${classes.drillPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.status === 'completed' ? (
                            <span className={`${classes.drillPill} ${classes.dispAnswered}`}>Answered</span>
                          ) : (
                            <span className={`${classes.drillPill} ${classes.dispMissed}`}>Missed</span>
                          )}
                        </td>
                        <td className={`${classes.pillCell} ${classes.pillCellWrap}`}>
                          {log.disposition === 'sold' ? (
                            <span className={`${classes.drillPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.disposition === 'callback' ? (
                            <span className={`${classes.drillPill} ${classes.dispAnswered}`}>Call back</span>
                          ) : log.disposition === 'not_interested' ? (
                            <span className={`${classes.drillPill} ${classes.dispMissed}`}>Not Interested</span>
                          ) : log.disposition === 'busy' ? (
                            <span className={`${classes.drillPill} ${classes.dispMissed}`}>Busy</span>
                          ) : log.disposition === 'dead_air' ? (
                            <span className={`${classes.drillPill} ${classes.dispMissed}`}>Dead Air</span>
                          ) : log.disposition === 'policy_closed' ? (
                            <span className={`${classes.drillPill} ${classes.dispAnswered}`} style={{borderColor: 'var(--brand-text)'}}>Policy Closed</span>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td className={classes.compactCell}>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                        <td className={classes.pillCell}>
                          {log.refunded ? (
                            <span className={`${classes.drillPill} ${classes.dispSold}`}>Credited</span>
                          ) : log.contestStatus === 'pending' ? (
                            <span className={`${classes.drillPill} ${classes.dispAnswered}`}>Pending</span>
                          ) : log.contestStatus === 'denied' ? (
                            <span className={`${classes.drillPill} ${classes.dispMissed}`}>Denied</span>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td>
                          {(log.recordingSid || log.recordingUrl) ? (
                            <button
                              type="button"
                              className={classes.playBtn}
                              onClick={() => setActiveRecording(log)}
                            >
                              <Play size={12} /> Play
                            </button>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td className={classes.dateCell}>
                          {created ? (
                            <>
                              <span className={classes.datePrimary}>{created.toLocaleDateString()}</span>
                              <span className={classes.dateSub}>
                                {created.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={classes.actionsCell}>
                          {log.isBillable && log.cost > 0 && !log.refunded && log.contestStatus !== 'pending' ? (
                            <button
                              type="button"
                              className={`${classes.refreshBtn} ${classes.refundBtn}`}
                              disabled={refundingLogId === log.id}
                              onClick={() => openRefundCallModal(log)}
                            >
                              {refundingLogId === log.id ? '…' : 'Refund'}
                            </button>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                      </tr>
                    );})}
                    {filteredSortedDrilldownLogs.length === 0 ? (
                      <tr>
                        <td colSpan={10} className={classes.muted}>No calls found for selected day.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard} ${classes.contestSection}`} variants={presets.child}>
        <div className={classes.cardTopRow}>
          <h2 className={classes.cardTitle}>Call charge contests</h2>
          <div className={classes.filterRow}>
            <select
              className={classes.select}
              value={contestFilter}
              onChange={(e) => {
                setContestFilter(e.target.value);
                loadCallContests(e.target.value);
              }}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="all">All</option>
            </select>
            <button type="button" className={classes.refreshBtn} onClick={() => loadCallContests(contestFilter)}>
              <RefreshCw size={14} className={contestsLoading ? classes.spin : ''} /> Refresh
            </button>
          </div>
        </div>
        <p className={classes.hint}>Agents contest billable calls with proof. Review and approve (credit wallet) or deny.</p>
        {contestsLoading && !callContests.length ? (
          <p className={classes.muted}>Loading contests...</p>
        ) : !callContests.length ? (
          <div className={classes.emptyPanel}>
            <FileText size={28} className={classes.emptyPanelIcon} />
            <h4>No {contestFilter === 'all' ? '' : contestFilter} contests</h4>
            <p>Pending contest reviews will appear here.</p>
          </div>
        ) : (
          <div className={classes.contestList}>
            {callContests.map((c) => (
              <ContestReviewCard
                key={c.id}
                contest={c}
                expanded={expandedContestId === c.id}
                onToggle={() => setExpandedContestId(expandedContestId === c.id ? null : c.id)}
                onOpenProof={openContestProofUrl}
                onPlayRecording={() => setActiveRecording({
                  recordingUrl: c.recordingUrl,
                  recordingSid: c.recordingSid || null,
                  campaign: c.campaignLabel || c.campaign,
                  campaignLabel: c.campaignLabel || c.campaign,
                  duration: c.duration,
                  createdAt: c.submittedAt || c.createdAt,
                  isBillable: c.isBillable,
                })}
                onApprove={() => openApproveContestModal(c)}
                onDeny={() => openDenyContestModal(c)}
              />
            ))}
          </div>
        )}
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Agent Emergency Management</h2>
        <p className={classes.hint}>
          If an agent is stuck in a call or appears online when they are not, enter their Agent ID here to manually evict them from all active pools and records.
        </p>
        <form className={classes.emergencyForm} onSubmit={handleForceRemoveAgent}>
          <div className={classes.formField}>
            <label htmlFor="forceRemoveAgentId">Agent ID</label>
            <div className={classes.emergencyInputRow}>
              <input
                id="forceRemoveAgentId"
                className={classes.input}
                placeholder="e.g. h4L9bs2BgXMPT9KrX56mSJbbKnW2"
                value={forceRemoveAgentId}
                onChange={(e) => setForceRemoveAgentId(e.target.value)}
              />
              <button type="submit" className={`${classes.dangerBtn} ${classes.emergencySubmitBtn}`}>
                <Trash2 size={16} />
                Force remove from pool
              </button>
            </div>
          </div>
        </form>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Notifications</h2>
        <p className={classes.hint}>
          Send broadcasts, manage maintenance alerts, and edit or revoke past pushes.
        </p>
        <Link to="/app/admin/notifications" className={classes.primaryBtn}>
          <Bell size={16} />
          Open notification settings
        </Link>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Campaign pause controls</h2>
        <p className={classes.hint}>
          Pause a campaign to block new go-live joins and inbound routing immediately. Existing online agents stay online until they go offline or switch campaigns.
        </p>
        <div className={classes.tableWrap}>
          <div className={classes.tableScroll}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Reason (optional)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={classes.muted}>No campaigns available</td>
                  </tr>
                ) : (
                  campaigns.map((c) => {
                    const control = campaignControls[c.id] || {};
                    const paused = Boolean(control.paused || c.paused);
                    const reasonValue = pauseReasonDraft[c.id] ?? (control.reason || c.pauseReason || '');
                    return (
                      <tr key={c.id}>
                        <td>{c.label} <span className={classes.muted}>({c.id})</span></td>
                        <td>
                          <span className={`${classes.statusPill} ${paused ? classes.dispMissed : classes.dispAnswered}`}>
                            {paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <input
                            className={classes.input}
                            placeholder="Reason shown to admins/operators"
                            value={reasonValue}
                            onChange={(e) => setPauseReasonDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          />
                        </td>
                        <td className={classes.actions}>
                          <button
                            type="button"
                            className={paused ? classes.primaryBtn : classes.dangerBtn}
                            onClick={() => toggleCampaignPause(c.id, !paused)}
                          >
                            {paused ? 'Resume' : 'Pause'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard} ${classes.didSection}`} variants={presets.child}>
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
          <div className={classes.tableScroll}>
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
        </div>
      </motion.section>
    </motion.div>
    {activeRecording && (
      <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />
    )}
    <AdminActionModal
      modal={actionModal}
      note={actionNote}
      onNoteChange={setActionNote}
      submitting={actionSubmitting}
      onClose={closeActionModal}
      onSubmit={submitActionModal}
    />

    {/* ── Flag Agent Modal ────────────────────────────────────────── */}
    {flagModal && (
      <div className={classes.modalOverlay} onClick={() => setFlagModal(null)}>
        <motion.div 
          className={`glass ${classes.modalBox}`}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className={classes.modalHeader}>
            <h3>Flag Agent</h3>
            <button className={classes.modalCloseBtn} onClick={() => setFlagModal(null)}>
              <X size={18} />
            </button>
          </div>
          <p className={classes.modalSub}>
            You are about to flag <strong>{flagModal.agentName}</strong>. This will instantly kick them offline and prevent them from taking calls until you manually resume them.
          </p>
          <form onSubmit={handleFlagSubmit}>
            <label className={classes.modalLabel}>
              Reason shown to agent
              <input
                className={classes.input}
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
              />
            </label>
            <div className={classes.modalActions}>
              <button type="button" className={classes.modalCancelBtn} onClick={() => setFlagModal(null)} disabled={actionSubmitting}>
                Cancel
              </button>
              <button type="submit" className={classes.dangerBtn} disabled={actionSubmitting}>
                {actionSubmitting ? 'Flagging...' : 'Confirm Flag'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    )}
    </>
  );
};

export default AdminDashboardPage;
