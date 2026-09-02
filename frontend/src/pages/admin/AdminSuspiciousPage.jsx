import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  RefreshCw,
  ShieldOff,
  DollarSign,
  Play,
  Flag,
  WalletCards,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  listSuspiciousAgents,
  dismissSuspiciousAgent,
  forceChargeSuspiciousAgent,
  flagAdminAgent,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import PageLoader from '../../components/ui/PageLoader';
import { RecordingModal } from '../CallLogsPage';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminSuspiciousPage.module.css';

const PAGE_SIZE = 8;

/* eslint-disable react/prop-types */
function formatDuration(s) {
  const sec = Number(s || 0);
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatDate(value) {
  if (!value) return 'Today';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AgentCard({
  agent,
  expanded,
  onToggle,
  onDismiss,
  onForceCharge,
  onPlayRecording,
  loading,
  reduceMotion,
}) {
  const dropCount = Number(agent.suspiciousDropCount || 0);
  const flagged = Array.isArray(agent.flaggedLogs) ? agent.flaggedLogs : [];

  return (
    <motion.article
      className={`glass ${shared.qaCard} ${classes.card} ${expanded ? `${shared.qaCardExpanded} ${classes.cardOpen}` : ''}`}
      layout={reduceMotion ? false : true}
    >
      <button
        type="button"
        className={classes.cardHead}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className={classes.identity}>
          <h3 className={classes.name}>{agent.agentName}</h3>
          {agent.email ? <span className={classes.email}>{agent.email}</span> : null}
        </div>
        <div className={classes.chips}>
          <span className={`${shared.qaChip} ${shared.qaChipConfirmed}`}>
            {dropCount} drop{dropCount === 1 ? '' : 's'}
          </span>
          <span className={`${shared.qaChip} ${shared.qaChipPending}`}>
            {agent.todayCallTotal || 0} calls
          </span>
        </div>
      </button>

      <div className={classes.meta}>
        <span className={classes.metaHot}>
          {dropCount} near-buffer drop{dropCount === 1 ? '' : 's'}
        </span>
        <span>{agent.todayCallTotal || 0} total calls today</span>
        <span>{formatDate(agent.suspiciousDropDate)}</span>
        <span>{flagged.length} flagged recording{flagged.length === 1 ? '' : 's'}</span>
      </div>

      <div className={classes.foot}>
        <button
          type="button"
          className={classes.dismissBtn}
          onClick={() => onDismiss(agent.agentId)}
          disabled={loading}
        >
          <ShieldOff size={14} />
          Dismiss
        </button>
        <button
          type="button"
          className={`${shared.dangerBtn} ${classes.chargeBtn}`}
          onClick={() => onForceCharge(agent)}
          disabled={loading}
        >
          <DollarSign size={14} />
          Force charge
        </button>
        <span className={classes.footSpacer} />
        <button
          type="button"
          className={`${shared.qaGhostBtn} ${classes.reviewBtn}`}
          onClick={onToggle}
          aria-label={expanded ? 'Hide flagged calls' : 'Show flagged calls'}
        >
          {expanded ? 'Hide calls' : 'Review calls'}
          <ChevronDown size={14} className={classes.chevron} aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            className={classes.detail}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_SMOOTH }}
          >
            <div className={classes.detailInner}>
              <p className={classes.detailLabel}>Flagged calls</p>
              {flagged.length ? (
                <div className={shared.tableWrap}>
                  <div className={shared.tableScroll}>
                    <table className={shared.table}>
                      <thead>
                        <tr>
                          <th>Call SID</th>
                          <th>Caller</th>
                          <th>Duration</th>
                          <th>Campaign</th>
                          <th>Time</th>
                          <th className={classes.recordingCell}>Recording</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flagged.map((log) => (
                          <tr key={log.id || log.callSid}>
                            <td className={`${shared.mono} ${classes.sid}`}>{log.callSid || '—'}</td>
                            <td>{log.from || 'Hidden'}</td>
                            <td className={classes.duration}>{formatDuration(log.duration)}</td>
                            <td>{log.campaignLabel || log.campaign || '—'}</td>
                            <td>
                              {log.timestamp
                                ? new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                                : '—'}
                            </td>
                            <td className={classes.recordingCell}>
                              {log.recordingUrl || log.recordingSid ? (
                                <button
                                  type="button"
                                  className={`${shared.qaGhostBtn} ${classes.playBtn}`}
                                  onClick={() => onPlayRecording(log)}
                                >
                                  <Play size={12} />
                                  Play
                                </button>
                              ) : (
                                <span className={shared.muted}>None</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className={shared.muted}>No flagged call logs were found for this agent.</p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export default function AdminSuspiciousPage() {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  const [forceChargeModal, setForceChargeModal] = useState(null);
  const [flagModal, setFlagModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSuspiciousAgents();
      setAgents(res.agents || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load suspicious agents');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageAgents = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return agents.slice(start, start + PAGE_SIZE);
  }, [agents, safePage]);

  const dropTotal = agents.reduce((sum, agent) => sum + Number(agent.suspiciousDropCount || 0), 0);
  const recordingTotal = agents.reduce(
    (sum, agent) => sum + (Array.isArray(agent.flaggedLogs)
      ? agent.flaggedLogs.filter((log) => log.recordingUrl || log.recordingSid).length
      : 0),
    0,
  );
  const rangeStart = agents.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, agents.length);

  const handleDismiss = async (agentId) => {
    setActionLoading(true);
    try {
      await dismissSuspiciousAgent(agentId);
      toast.success('Warning dismissed — agent notified.');
      setAgents((prev) => prev.filter((a) => a.agentId !== agentId));
      if (expandedId === agentId) setExpandedId(null);
    } catch (e) {
      toast.error(e.message || 'Failed to dismiss');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceCharge = async () => {
    if (!forceChargeModal) return;
    const { agent } = forceChargeModal;
    const campaignId = agent.flaggedLogs?.[0]?.campaign || null;
    setActionLoading(true);
    try {
      const res = await forceChargeSuspiciousAgent(agent.agentId, campaignId);
      if (res.insufficientBalance) {
        setForceChargeModal(null);
        setFlagModal({ agent, shortfallCents: res.shortfallCents || 0 });
        return;
      }
      const amount = res.amountCents ? `$${(res.amountCents / 100).toFixed(2)}` : 'the penalty';
      toast.success(`Force charged ${agent.agentName} ${amount}.`);
      setAgents((prev) => prev.filter((a) => a.agentId !== agent.agentId));
      setForceChargeModal(null);
      if (expandedId === agent.agentId) setExpandedId(null);
    } catch (e) {
      toast.error(e.message || 'Failed to force charge');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlagAgent = async () => {
    if (!flagModal) return;
    const { agent } = flagModal;
    setActionLoading(true);
    try {
      await flagAdminAgent(agent.agentId, 'Insufficient wallet balance — suspicious drop penalty could not be charged.');
      await dismissSuspiciousAgent(agent.agentId);
      toast.success(`${agent.agentName} has been flagged and removed from the pool.`);
      setAgents((prev) => prev.filter((a) => a.agentId !== agent.agentId));
      setFlagModal(null);
      if (expandedId === agent.agentId) setExpandedId(null);
    } catch (e) {
      toast.error(e.message || 'Failed to flag agent');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !agents.length) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        icon={AlertTriangle}
        title="Suspicious Drop Patterns"
        description="Agents who dropped 3+ calls within 5 seconds of the billing buffer today. Review recordings, then dismiss or charge."
        category={ADMIN_CATEGORIES.agents}
        actions={(
          <button type="button" className={shared.refreshBtn} onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? shared.spin : ''} />
            Refresh
          </button>
        )}
      >
        <motion.section className={classes.page} variants={presets.child}>
          <div className={`glass ${shared.qaStrip} ${shared.qaRulesStrip}`}>
            <div className={`${shared.qaStripCell} ${agents.length ? shared.qaStripCellHot : ''}`}>
              <span className={shared.qaStripLabel}>Pending</span>
              <span className={shared.qaStripValue}>{agents.length}</span>
              <span className={shared.qaStripSub}>Agents waiting for review</span>
            </div>
            <div className={shared.qaStripCell}>
              <span className={shared.qaStripLabel}>Near-buffer drops</span>
              <span className={shared.qaStripValue}>{dropTotal}</span>
              <span className={shared.qaStripSub}>Across agents on this list</span>
            </div>
            <div className={shared.qaStripCell}>
              <span className={shared.qaStripLabel}>Recordings</span>
              <span className={shared.qaStripValue}>{recordingTotal}</span>
              <span className={shared.qaStripSub}>Ready to play from flagged calls</span>
            </div>
          </div>

          {!agents.length ? (
            <div className={shared.qaEmpty}>
              <AlertTriangle size={26} className={shared.qaEmptyIcon} />
              <h4>No suspicious patterns today</h4>
              <p>Agents only appear here after 3 near-buffer drops in a day. Refresh after the next eligible call.</p>
            </div>
          ) : (
            <>
              <motion.div className={classes.list} variants={presets.grid}>
                {pageAgents.map((agent) => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    expanded={expandedId === agent.agentId}
                    onToggle={() => setExpandedId(expandedId === agent.agentId ? null : agent.agentId)}
                    onDismiss={handleDismiss}
                    onForceCharge={(a) => setForceChargeModal({ agent: a })}
                    onPlayRecording={(log) => setActiveRecording({
                      ...log,
                      revealCaller: true,
                      campaignLabel: log.campaignLabel || log.campaign,
                    })}
                    loading={actionLoading}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </motion.div>

              <div className={shared.pagination}>
                <span className={shared.pageMeta}>
                  {rangeStart}–{rangeEnd} of {agents.length} agent{agents.length === 1 ? '' : 's'}
                </span>
                <div className={shared.pageBtns}>
                  <button
                    type="button"
                    className={shared.pageBtn}
                    onClick={() => {
                      setPage((p) => Math.max(1, p - 1));
                      setExpandedId(null);
                    }}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className={shared.pageIndicator}>
                    {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className={shared.pageBtn}
                    onClick={() => {
                      setPage((p) => Math.min(totalPages, p + 1));
                      setExpandedId(null);
                    }}
                    disabled={safePage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.section>
      </AdminPageShell>

      {activeRecording ? (
        <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />
      ) : null}

      {forceChargeModal
        ? createPortal(
          <div className={shared.modalOverlay} onClick={() => !actionLoading && setForceChargeModal(null)}>
            <div className={`glass ${shared.modalBox}`} onClick={(e) => e.stopPropagation()}>
              <div className={shared.modalHeader}>
                <h3 className={`${classes.warnTitle} ${classes.warnTitleCharge}`}>
                  <AlertTriangle size={18} />
                  Confirm force charge
                </h3>
                <button
                  type="button"
                  className={shared.modalCloseBtn}
                  onClick={() => setForceChargeModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className={shared.modalSub}>
                Deduct one call charge from {forceChargeModal.agent.agentName} for{' '}
                {forceChargeModal.agent.flaggedLogs?.[0]?.campaignLabel || 'their flagged campaign'}.
                They will be notified and their warning will clear.
              </p>
              <div className={shared.modalActions}>
                <button
                  type="button"
                  className={shared.modalCancelBtn}
                  onClick={() => setForceChargeModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={shared.dangerBtn}
                  onClick={handleForceCharge}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Charging…' : 'Confirm charge'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      {flagModal
        ? createPortal(
          <div className={shared.modalOverlay} onClick={() => !actionLoading && setFlagModal(null)}>
            <div className={`glass ${shared.modalBox}`} onClick={(e) => e.stopPropagation()}>
              <div className={shared.modalHeader}>
                <h3 className={`${classes.warnTitle} ${classes.warnTitleFlag}`}>
                  <WalletCards size={18} />
                  Insufficient balance
                </h3>
                <button
                  type="button"
                  className={shared.modalCloseBtn}
                  onClick={() => setFlagModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className={shared.modalSub}>
                {flagModal.agent.agentName} cannot cover the penalty
                {flagModal.shortfallCents > 0
                  ? ` — short by $${(flagModal.shortfallCents / 100).toFixed(2)}`
                  : ''}
                . Flag them to pull them from the pool until an admin reviews.
              </p>
              <div className={shared.modalActions}>
                <button
                  type="button"
                  className={shared.modalCancelBtn}
                  onClick={() => setFlagModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${shared.primaryBtn} ${classes.flagBtn}`}
                  onClick={handleFlagAgent}
                  disabled={actionLoading}
                >
                  <Flag size={14} />
                  {actionLoading ? 'Flagging…' : 'Flag agent'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
