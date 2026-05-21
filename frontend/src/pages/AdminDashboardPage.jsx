import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, Users, Phone, Radio, RefreshCw, Trash2, Plus, CalendarDays, CircleDollarSign, Activity, Play, X, ChevronDown, FileText
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
  postAdminBroadcastNotification,
  getAdminMaintenanceState,
  patchAdminMaintenanceState,
  forceRemoveAgent,
  listAdminCallContests,
  approveAdminCallContest,
  denyAdminCallContest,
  refundAdminCall,
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

const toLocalDateTimeInput = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const nowLocalInput = () => toLocalDateTimeInput(new Date());

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
    <article className={`${classes.contestCard} ${expanded ? classes.contestCardExpanded : ''}`}>
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
        className={classes.modalBox}
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
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    body: '',
    priority: 'normal',
    expiresAt: '',
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    active: false,
    title: '',
    message: '',
    startsAt: '',
    endsAt: '',
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

  const refreshMaintenance = useCallback(async () => {
    try {
      const out = await getAdminMaintenanceState();
      const m = out?.maintenance || {};
      setMaintenanceForm({
        active: Boolean(m.active),
        title: m.title || '',
        message: m.message || '',
        startsAt: toLocalDateTimeInput(m.startsAt),
        endsAt: toLocalDateTimeInput(m.endsAt),
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load maintenance state');
    }
  }, []);

  useEffect(() => {
    // One-time shell + DIDs load (range-independent).
    Promise.all([
      loadShell(),
      refreshDids(),
      refreshMaintenance(),
      loadCallContests('pending'),
    ]);
  }, [loadShell, refreshDids, refreshMaintenance, loadCallContests]);

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

  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.body.trim()) {
      toast.error('Broadcast title and message are required');
      return;
    }
    try {
      const now = Date.now();
      if (broadcastForm.expiresAt) {
        const expiresMs = new Date(broadcastForm.expiresAt).getTime();
        if (!Number.isFinite(expiresMs) || expiresMs < now) {
          toast.error('Broadcast expiry must be in the future');
          return;
        }
      }
      const payload = {
        title: broadcastForm.title.trim(),
        body: broadcastForm.body.trim(),
        priority: broadcastForm.priority,
        ...(broadcastForm.expiresAt ? { expiresAt: new Date(broadcastForm.expiresAt).toISOString() } : {}),
      };
      const out = await postAdminBroadcastNotification(payload);
      toast.success(`Broadcast sent to ${out.recipientCount || 0} users`);
      setBroadcastForm((prev) => ({ ...prev, title: '', body: '' }));
    } catch (err) {
      toast.error(err.message || 'Failed to send broadcast');
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


  const handleSaveMaintenance = async (e) => {
    e.preventDefault();
    try {
      const isActive = Boolean(maintenanceForm.active);
      const now = Date.now();
      const startsMs = maintenanceForm.startsAt ? new Date(maintenanceForm.startsAt).getTime() : null;
      const endsMs = maintenanceForm.endsAt ? new Date(maintenanceForm.endsAt).getTime() : null;

      if (isActive && maintenanceForm.startsAt && (!Number.isFinite(startsMs) || startsMs < now)) {
        toast.error('Maintenance start time must be in the future');
        return;
      }
      if (isActive && maintenanceForm.endsAt && (!Number.isFinite(endsMs) || endsMs < now)) {
        toast.error('Maintenance end time must be in the future');
        return;
      }
      if (isActive && startsMs && endsMs && startsMs > endsMs) {
        toast.error('Maintenance end time must be after start time');
        return;
      }

      const payload = {
        active: isActive,
        title: isActive ? maintenanceForm.title.trim() : '',
        message: isActive ? maintenanceForm.message.trim() : '',
        startsAt: isActive && maintenanceForm.startsAt ? new Date(maintenanceForm.startsAt).toISOString() : null,
        endsAt: isActive && maintenanceForm.endsAt ? new Date(maintenanceForm.endsAt).toISOString() : null,
      };
      await patchAdminMaintenanceState(payload);
      toast.success(maintenanceForm.active ? 'Maintenance update published' : 'Maintenance mode turned off');
      await refreshMaintenance();
    } catch (err) {
      toast.error(err.message || 'Failed to save maintenance state');
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

  const agentNameById = useMemo(() => {
    const out = new Map();
    (agentStats || []).forEach((row) => {
      const id = getAgentId(row);
      const name = getAgentName(row);
      if (id && name) out.set(id, name);
    });
    (overview?.agents || []).forEach((row) => {
      const id = getAgentId(row);
      const name = getAgentName(row);
      if (id && name && !out.has(id)) out.set(id, name);
    });
    (liveCalls || []).forEach((row) => {
      const id = getAgentId(row);
      const name = getAgentName(row);
      if (id && name && !out.has(id)) out.set(id, name);
    });
    return out;
  }, [agentStats, overview?.agents, liveCalls, getAgentId, getAgentName]);

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
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div className={classes.iconBox}>
          <Shield size={24} />
        </div>
        <div>
          <h1 className={classes.title}>Admin</h1>
          <p className={classes.subtitle}>Owner analytics, live operations, and routing control center</p>
        </div>
      </motion.div>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>

      <motion.div className={classes.grid} variants={presets.statsStrip}>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Users size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Live agents</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (overview?.totalAgents ?? 0)}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Radio size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Available</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.available?.length ?? 0)}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Ringing</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.ringing?.length ?? 0)}</span>
        </motion.div>
        <motion.div className={classes.statCard} variants={presets.child}>
          <Phone size={18} className={classes.statIcon} />
          <span className={classes.statLabel}>Busy</span>
          <span className={classes.statValue}>{loading ? <span className={classes.skeletonNum} /> : (pool.busy?.length ?? 0)}</span>
        </motion.div>
      </motion.div>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
                  <td colSpan={6} className={classes.muted}>
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
                      {a.phone ? (
                        <a href={`tel:${a.phone}`} className={classes.agentPhone}>
                          {a.phone}
                        </a>
                      ) : (
                        <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                      )}
                    </td>
                    <td>{a.campaignId}</td>
                    <td><span className={classes.statusPill}>{a.pool}</span></td>
                    <td><span className={classes.statusPill}>{a.status}</span></td>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
                        <div style={{ marginTop: '6px' }}>
                          {row.phone ? (
                            <a href={`tel:${row.phone}`} className={classes.agentPhone} onClick={(e) => e.stopPropagation()}>
                              {row.phone}
                            </a>
                          ) : (
                            <span className={classes.agentPhone} style={{ opacity: 0.5 }} onClick={(e) => e.stopPropagation()}>No phone</span>
                          )}
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
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
            {drilldown.recentLogs && drilldown.recentLogs.length > 0 && (
              <div className={classes.tableWrap} style={{marginTop: '24px'}}>
                <h3 className={classes.subTitle}>Recent Calls</h3>
                <table className={classes.table}>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Campaign</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Disposition</th>
                      <th>Cost</th>
                      <th>Contest</th>
                      <th>Recording (QA)</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDrilldownLogs.map((log) => (
                      <tr key={log.id}>
                        <td className={classes.agentCell}>
                          <details style={{ cursor: 'pointer' }}>
                            <summary style={{ listStyle: 'none' }} title="Tap to view phone number">
                              <strong>{getAgentName(log)}</strong>
                              {getAgentName(log) !== getAgentId(log) ? (
                                <span className={classes.agentSubId}>{getAgentId(log)}</span>
                              ) : null}
                            </summary>
                            <div style={{ marginTop: '6px' }}>
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
                        <td>{log.campaign}</td>
                        <td>{log.duration}s</td>
                        <td>
                          {log.isBillable ? (
                            <span className={`${classes.statusPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.status === 'completed' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`}>Answered</span>
                          ) : (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Missed</span>
                          )}
                        </td>
                        <td>
                          {log.disposition === 'sold' ? (
                            <span className={`${classes.statusPill} ${classes.dispSold}`}>Sold</span>
                          ) : log.disposition === 'callback' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`}>Call back</span>
                          ) : log.disposition === 'not_interested' ? (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Not Interested</span>
                          ) : log.disposition === 'busy' ? (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Busy</span>
                          ) : log.disposition === 'policy_closed' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`} style={{borderColor: 'var(--brand-text)'}}>Policy Closed</span>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                        <td>
                          {log.refunded ? (
                            <span className={`${classes.statusPill} ${classes.dispSold}`}>Credited</span>
                          ) : log.contestStatus === 'pending' ? (
                            <span className={`${classes.statusPill} ${classes.dispAnswered}`}>Pending</span>
                          ) : log.contestStatus === 'denied' ? (
                            <span className={`${classes.statusPill} ${classes.dispMissed}`}>Denied</span>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td>
                          {(log.recordingSid || log.recordingUrl) ? (
                            <button 
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--brand-accent)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                              onClick={() => setActiveRecording(log)}
                            >
                              <Play size={12} /> Play
                            </button>
                          ) : (
                            <span className={classes.muted}>—</span>
                          )}
                        </td>
                        <td className={classes.muted}>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          {log.isBillable && log.cost > 0 && !log.refunded && log.contestStatus !== 'pending' ? (
                            <button
                              type="button"
                              className={classes.refreshBtn}
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
                    ))}
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

      <motion.section className={classes.card} variants={presets.child}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2 className={classes.cardTitle} style={{ margin: 0 }}>Call charge contests</h2>
          <motion.div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} whileHover={{ scale: 1.01 }}>
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
              <RefreshCw size={14} className={contestsLoading ? classes.spinner : ''} /> Refresh
            </button>
          </motion.div>
        </div>
        <p className={classes.hint}>Agents contest billable calls with proof. Review and approve (credit wallet) or deny.</p>
        {contestsLoading && !callContests.length ? (
          <p className={classes.muted}>Loading contests...</p>
        ) : !callContests.length ? (
          <p className={classes.muted}>No {contestFilter === 'all' ? '' : contestFilter} contests.</p>
        ) : (
          <div className={classes.contestList}>
            {callContests.map((c) => (
              <ContestReviewCard
                key={c.id}
                contest={c}
                expanded={expandedContestId === c.id}
                onToggle={() => setExpandedContestId(expandedContestId === c.id ? null : c.id)}
                onOpenProof={openContestProofUrl}
                onPlayRecording={() => setActiveRecording({ recordingUrl: c.recordingUrl, campaign: c.campaignLabel })}
                onApprove={() => openApproveContestModal(c)}
                onDeny={() => openDenyContestModal(c)}
              />
            ))}
          </div>
        )}
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Agent Emergency Management</h2>
        <p className={classes.hint}>
          If an agent is "stuck" in a call or appears online when they aren't, enter their Agent ID here to manually evict them from all active pools and records.
        </p>
        <form className={classes.didForm} style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }} onSubmit={handleForceRemoveAgent}>
          <div className={classes.formField}>
            <label>Agent ID</label>
            <input
              className={classes.input}
              placeholder="e.g. h4L9bs2BgXMPT9KrX56mSJbbKnW2"
              value={forceRemoveAgentId}
              onChange={(e) => setForceRemoveAgentId(e.target.value)}
            />
          </div>
          <button type="submit" className={classes.dangerBtn} style={{ height: '42px', padding: '0 20px' }}>
            <Trash2 size={16} />
            Force remove from pool
          </button>
        </form>
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
        <h2 className={classes.cardTitle}>Notifications & maintenance</h2>
        <div className={classes.notificationGrid}>
          <form className={classes.notificationForm} onSubmit={handleSendBroadcast}>
            <h3 className={classes.subTitle}>Broadcast to all users</h3>
            <input
              className={classes.input}
              placeholder="Notification title"
              value={broadcastForm.title}
              onChange={(e) => setBroadcastForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <textarea
              className={classes.textarea}
              placeholder="Message"
              value={broadcastForm.body}
              onChange={(e) => setBroadcastForm((prev) => ({ ...prev, body: e.target.value }))}
            />
            <div className={classes.formRow}>
              <select
                className={classes.select}
                value={broadcastForm.priority}
                onChange={(e) => setBroadcastForm((prev) => ({ ...prev, priority: e.target.value }))}
              >
                <option value="low">Low priority</option>
                <option value="normal">Normal priority</option>
                <option value="high">High priority</option>
              </select>
              <input
                type="datetime-local"
                className={classes.input}
                value={broadcastForm.expiresAt}
                onChange={(e) => setBroadcastForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                min={nowLocalInput()}
              />
            </div>
            <button type="submit" className={classes.primaryBtn}>Send broadcast</button>
          </form>
          <form className={classes.notificationForm} onSubmit={handleSaveMaintenance}>
            <h3 className={classes.subTitle}>Maintenance banner</h3>
            <label className={classes.check}>
              <input
                type="checkbox"
                checked={maintenanceForm.active}
                onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, active: e.target.checked }))}
              />
              Maintenance active
            </label>
            <input
              className={classes.input}
              placeholder="Maintenance title"
              value={maintenanceForm.title}
              onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <textarea
              className={classes.textarea}
              placeholder="Maintenance message"
              value={maintenanceForm.message}
              onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, message: e.target.value }))}
            />
            <div className={classes.formRow}>
              <input
                type="datetime-local"
                className={classes.input}
                value={maintenanceForm.startsAt}
                onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                min={nowLocalInput()}
              />
              <input
                type="datetime-local"
                className={classes.input}
                value={maintenanceForm.endsAt}
                onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                min={maintenanceForm.startsAt || nowLocalInput()}
              />
            </div>
            <button type="submit" className={classes.primaryBtn}>
              {maintenanceForm.active ? 'Publish maintenance update' : 'Save maintenance off'}
            </button>
          </form>
        </div>
      </motion.section>

      <motion.section className={classes.card} variants={presets.child}>
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
      </motion.section>
      {activeRecording && <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />}
      <AdminActionModal
        modal={actionModal}
        note={actionNote}
        onNoteChange={setActionNote}
        submitting={actionSubmitting}
        onClose={closeActionModal}
        onSubmit={submitActionModal}
      />
    </motion.div>
  );
};

export default AdminDashboardPage;
