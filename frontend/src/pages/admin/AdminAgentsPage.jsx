import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Trash2, X, Flag, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminAnalyticsBundle,
  forceRemoveAgent,
  flagAdminAgent,
  resumeAdminAgent,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminAgentsPage() {
  const presets = useSubtlePageMotion();
  const [rangePreset] = useState('7d');
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [agentStats, setAgentStats] = useState([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [forceRemoveAgentId, setForceRemoveAgentId] = useState('');
  const [flagModal, setFlagModal] = useState(null);
  const [flagReason, setFlagReason] = useState('Low billable rate — below 30% threshold');
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

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const range = getRange();
      const bundle = await getAdminAnalyticsBundle(range);
      setAgentStats(bundle.agents || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load agent stats');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [getRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const filteredAgentStats = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) return agentStats;
    return agentStats.filter((row) => {
      const name = getAgentName(row).toLowerCase();
      const id = getAgentId(row).toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [agentStats, agentSearch]);

  const handleFlagSubmit = async (e) => {
    e.preventDefault();
    if (!flagModal?.agentId) return;
    setActionSubmitting(true);
    try {
      const out = await flagAdminAgent(flagModal.agentId, flagReason);
      if (out.success) {
        toast.success(`Agent ${flagModal.agentName} has been flagged.`);
        setFlagModal(null);
        await loadAnalytics();
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
        await loadAnalytics();
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
      } else {
        toast.error('Failed to remove agent');
      }
    } catch (err) {
      toast.error(err.message || 'Error removing agent');
    }
  };

  if (analyticsLoading && !agentStats.length) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Agent Management"
        description="Agent performance, flag or resume agents, and emergency pool removal."
        icon={Users}
        category={ADMIN_CATEGORIES.agents}
      >
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    <tr><td colSpan={8} className={classes.muted}>Loading analytics…</td></tr>
                  ) : filteredAgentStats.length === 0 ? (
                    <tr><td colSpan={8} className={classes.muted}>No agent stats match this filter</td></tr>
                  ) : (
                    filteredAgentStats.map((row) => (
                      <tr key={row.agentId}>
                        <td className={classes.agentCell}>
                          <details className={classes.agentDetails}>
                            <summary title="Tap to view phone number">
                              <span className={classes.agentSummaryLine}>
                                <strong>{getAgentName(row)}</strong>
                                {row.flagged ? (
                                  <span className={classes.agentFlagBadge}>
                                    <Flag size={10} aria-hidden="true" />
                                    Flagged
                                  </span>
                                ) : null}
                              </span>
                              {getAgentName(row) !== getAgentId(row) ? (
                                <span className={classes.agentSubId} title={getAgentId(row)}>
                                  {getAgentId(row)}
                                </span>
                              ) : null}
                            </summary>
                            <div className={classes.agentPhoneReveal}>
                              {row.phone ? (
                                <a href={`tel:${row.phone}`} className={classes.agentPhone}>
                                  {row.phone}
                                </a>
                              ) : (
                                <span className={classes.agentPhoneMuted}>No phone on file</span>
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
                        <td className={classes.agentActionsCell}>
                          {row.flagged ? (
                            <button
                              type="button"
                              className={`${classes.rowBtnPrimary} ${classes.agentActionBtn}`}
                              onClick={() => handleResumeAgent(row.agentId, getAgentName(row))}
                            >
                              <ShieldCheck size={14} aria-hidden="true" />
                              Resume
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`${classes.rowBtnDanger} ${classes.agentActionBtn}`}
                              onClick={() => setFlagModal({ agentId: row.agentId, agentName: getAgentName(row) })}
                            >
                              <Flag size={14} aria-hidden="true" />
                              Flag
                            </button>
                          )}
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
      </AdminPageShell>

      {flagModal && (
        <div className={classes.modalOverlay} onClick={() => setFlagModal(null)}>
          <motion.div
            className={`glass ${classes.modalBox}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className={classes.modalHeader}>
              <div className={classes.modalTitleRow}>
                <span className={classes.modalIconDanger} aria-hidden="true">
                  <Flag size={18} />
                </span>
                <h3>Flag agent</h3>
              </div>
              <button type="button" className={classes.modalCloseBtn} onClick={() => setFlagModal(null)}>
                <X size={18} />
              </button>
            </div>
            <p className={classes.modalSub}>
              You are about to flag <strong>{flagModal.agentName}</strong>. This instantly removes them from the pool and blocks go-live until you resume them.
            </p>
            <form onSubmit={handleFlagSubmit}>
              <label className={classes.modalLabelStack}>
                Reason shown to agent
                <textarea
                  className={classes.modalTextarea}
                  rows={3}
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="e.g. Low billable rate — below 30% threshold"
                />
              </label>
              <div className={classes.modalActions}>
                <button type="button" className={classes.modalCancelBtn} onClick={() => setFlagModal(null)} disabled={actionSubmitting}>
                  Cancel
                </button>
                <button type="submit" className={`${classes.dangerBtn} ${classes.agentActionBtn}`} disabled={actionSubmitting}>
                  <Flag size={14} aria-hidden="true" />
                  {actionSubmitting ? 'Flagging…' : 'Confirm flag'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}
