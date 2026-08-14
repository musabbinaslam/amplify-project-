import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Trash2, X, Flag, ShieldCheck, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  listAdminAgentsDirectory,
  forceRemoveAgent,
  flagAdminAgent,
  resumeAdminAgent,
  patchAdminAgentPause,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: 'calls', label: 'Calls' },
  { value: 'totalCost', label: 'Total cost' },
  { value: 'walletBalanceCents', label: 'Balance' },
  { value: 'answerRate', label: 'Answer %' },
  { value: 'billableRate', label: 'Billable %' },
  { value: 'avgHandleTime', label: 'Avg handle' },
  { value: 'agentName', label: 'Name' },
  { value: 'createdAt', label: 'Signed up' },
];

function paginate(list, page, pageSize) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(safePage * pageSize, total),
  };
}

function compareAgents(a, b, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;
  const av = a?.[sortKey];
  const bv = b?.[sortKey];

  if (sortKey === 'agentName') {
    return dir * String(getAgentName(a)).localeCompare(String(getAgentName(b)));
  }
  if (sortKey === 'createdAt') {
    const at = av ? new Date(av).getTime() : 0;
    const bt = bv ? new Date(bv).getTime() : 0;
    return dir * (at - bt);
  }
  const an = typeof av === 'number' ? av : Number(av || 0);
  const bn = typeof bv === 'number' ? bv : Number(bv || 0);
  if (bn !== an) return dir * (an - bn);
  return String(getAgentName(a)).localeCompare(String(getAgentName(b)));
}

export default function AdminAgentsPage() {
  const presets = useSubtlePageMotion();
  const [rangePreset, setRangePreset] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | flagged
  const [roleFilter, setRoleFilter] = useState('all');
  const [agencyFilter, setAgencyFilter] = useState('all'); // all | platform | agency
  const [activityFilter, setActivityFilter] = useState('all'); // all | with_calls | no_calls
  const [sortKey, setSortKey] = useState('calls');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [forceRemoveAgentId, setForceRemoveAgentId] = useState('');
  const [flagModal, setFlagModal] = useState(null);
  const [flagReason, setFlagReason] = useState('Low billable rate — below 30% threshold');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const getRange = useCallback(() => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const days = rangePreset === 'today' ? 0 : rangePreset === '30d' ? 29 : rangePreset === '90d' ? 89 : 6;
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - days);
    const from = fromDate.toISOString().slice(0, 10);
    return { from, to: end };
  }, [rangePreset]);



  const handleTogglePause = async (agentId, agentName, isPaused) => {
    setActionSubmitting(true);
    try {
      await patchAdminAgentPause(agentId, !isPaused);
      toast.success(!isPaused ? `${agentName} paused` : `${agentName} resumed`);
      loadAgents();
    } catch (e) {
      toast.error(e.message || 'Failed to toggle pause');
    } finally {
      setActionSubmitting(false);
    }
  };

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const range = getRange();
      const out = await listAdminAgentsDirectory(range);
      setAgents(out.agents || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [getRange]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    setPage(1);
  }, [agentSearch, statusFilter, roleFilter, agencyFilter, activityFilter, sortKey, sortDir, rangePreset]);

  const roleOptions = useMemo(() => {
    const roles = new Set(agents.map((a) => String(a.role || 'agent').toLowerCase()).filter(Boolean));
    return ['all', ...[...roles].sort()];
  }, [agents]);

  const filteredSorted = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    const filtered = agents.filter((row) => {
      if (statusFilter === 'flagged' && !row.flagged) return false;
      if (statusFilter === 'active' && row.flagged) return false;

      const role = String(row.role || 'agent').toLowerCase();
      if (roleFilter !== 'all' && role !== roleFilter) return false;

      if (agencyFilter === 'platform' && row.agencyId) return false;
      if (agencyFilter === 'agency' && !row.agencyId) return false;

      const calls = Number(row.calls || 0);
      if (activityFilter === 'with_calls' && calls <= 0) return false;
      if (activityFilter === 'no_calls' && calls > 0) return false;

      if (!query) return true;
      const hay = [
        getAgentName(row),
        getAgentId(row),
        row.email,
        row.phone,
        row.role,
        row.agencyId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    });

    return [...filtered].sort((a, b) => compareAgents(a, b, sortKey, sortDir));
  }, [agents, agentSearch, statusFilter, roleFilter, agencyFilter, activityFilter, sortKey, sortDir]);

  const paged = useMemo(() => paginate(filteredSorted, page, PAGE_SIZE), [filteredSorted, page]);

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page);
  }, [page, paged.page]);

  const handleFlagSubmit = async (e) => {
    e.preventDefault();
    if (!flagModal?.agentId) return;
    setActionSubmitting(true);
    try {
      const out = await flagAdminAgent(flagModal.agentId, flagReason);
      if (out.success) {
        toast.success(`Agent ${flagModal.agentName} has been flagged.`);
        setFlagModal(null);
        await loadAgents();
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
        await loadAgents();
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

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'agentName' ? 'asc' : 'desc');
  };

  if (loading && !agents.length) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Agent Management"
        description="All signed-up agents with performance, search, filters, and pagination."
        icon={Users}
        category={ADMIN_CATEGORIES.agents}
      >
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.cardTopRow}>
            <div>
              <h2 className={classes.cardTitle}>All agents</h2>
              <p className={classes.hint}>
                {agents.length} signup{agents.length === 1 ? '' : 's'} · {filteredSorted.length} match
                {filteredSorted.length === 1 ? '' : 'es'} · stats for selected range
              </p>
            </div>
            <input
              className={classes.searchInput}
              placeholder="Search name, email, phone, or ID"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />
          </div>

          <div className={classes.filterRow}>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === 'today' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('today')}>Today</button>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === '7d' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('7d')}>Last 7 days</button>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === '30d' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('30d')}>Last 30 days</button>
            <button type="button" className={`${classes.filterBtn} ${rangePreset === '90d' ? classes.filterBtnActive : ''}`} onClick={() => setRangePreset('90d')}>Last 90 days</button>
          </div>

          <div className={classes.agentsFilterGrid}>
            <label className={classes.formField}>
              Status
              <select className={classes.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active (not flagged)</option>
                <option value="flagged">Flagged only</option>
              </select>
            </label>
            <label className={classes.formField}>
              Role
              <select className={classes.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role === 'all' ? 'All roles' : role}
                  </option>
                ))}
              </select>
            </label>
            <label className={classes.formField}>
              Agency
              <select className={classes.select} value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="platform">Platform only</option>
                <option value="agency">In an agency</option>
              </select>
            </label>
            <label className={classes.formField}>
              Activity
              <select className={classes.select} value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="with_calls">With calls in range</option>
                <option value="no_calls">No calls in range</option>
              </select>
            </label>
            <label className={classes.formField}>
              Sort by
              <select
                className={classes.select}
                value={sortKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setSortKey(next);
                  setSortDir(next === 'agentName' ? 'asc' : 'desc');
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className={classes.formField}>
              Order
              <select className={classes.select} value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                <option value="desc">High → low</option>
                <option value="asc">Low → high</option>
              </select>
            </label>
          </div>

          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('agentName')}>
                        Agent {sortKey === 'agentName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>Role</th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('calls')}>
                        Calls {sortKey === 'calls' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('answerRate')}>
                        Answer % {sortKey === 'answerRate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('billableRate')}>
                        Billable % {sortKey === 'billableRate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('avgHandleTime')}>
                        Avg Handle (s) {sortKey === 'avgHandleTime' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('totalCost')}>
                        Total Cost {sortKey === 'totalCost' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>
                      <button type="button" className={classes.sortThBtn} onClick={() => toggleSort('walletBalanceCents')}>
                        Balance {sortKey === 'walletBalanceCents' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </button>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className={classes.muted}>Loading agents…</td></tr>
                  ) : paged.items.length === 0 ? (
                    <tr><td colSpan={9} className={classes.muted}>No agents match these filters</td></tr>
                  ) : (
                    paged.items.map((row) => (
                      <tr key={row.agentId}>
                        <td className={classes.agentCell}>
                          <details className={classes.agentDetails}>
                            <summary title="Tap to view contact">
                              <span className={classes.agentSummaryLine}>
                                <strong>{getAgentName(row)}</strong>
                                {row.flagged ? (
                                  <span className={classes.agentFlagBadge}>
                                    <Flag size={10} aria-hidden="true" />
                                    Flagged
                                  </span>
                                ) : null}
                                {row.paused ? (
                                  <span className={classes.agentFlagBadge} style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                    <Pause size={10} aria-hidden="true" />
                                    Paused
                                  </span>
                                ) : null}
                              </span>
                              {row.email ? (
                                <span className={classes.agentSubId} title={row.email}>{row.email}</span>
                              ) : getAgentName(row) !== getAgentId(row) ? (
                                <span className={classes.agentSubId} title={getAgentId(row)}>
                                  {getAgentId(row)}
                                </span>
                              ) : null}
                            </summary>
                            <div className={classes.agentPhoneReveal}>
                              <div className={classes.agentSubId} title={getAgentId(row)}>{getAgentId(row)}</div>
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
                        <td>{row.role || 'agent'}</td>
                        <td>{row.calls || 0}</td>
                        <td>{Math.round((row.answerRate || 0) * 100)}%</td>
                        <td>{Math.round((row.billableRate || 0) * 100)}%</td>
                        <td>{row.avgHandleTime || 0}</td>
                        <td>${(row.totalCost || 0).toFixed(2)}</td>
                        <td>
                          {typeof row.walletBalanceCents === 'number'
                            ? `$${(row.walletBalanceCents / 100).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className={classes.agentActionsCell}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {row.paused ? (
                              <button
                                type="button"
                                className={`${classes.rowBtnPrimary} ${classes.agentActionBtn}`}
                                onClick={() => handleTogglePause(row.agentId, getAgentName(row), true)}
                                disabled={actionSubmitting}
                              >
                                <Play size={14} aria-hidden="true" />
                                Resume
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`${classes.rowBtnWarn} ${classes.agentActionBtn}`}
                                onClick={() => handleTogglePause(row.agentId, getAgentName(row), false)}
                                disabled={actionSubmitting}
                              >
                                <Pause size={14} aria-hidden="true" />
                                Pause
                              </button>
                            )}

                            {row.flagged ? (
                              <button
                                type="button"
                                className={`${classes.rowBtnPrimary} ${classes.agentActionBtn}`}
                                onClick={() => handleResumeAgent(row.agentId, getAgentName(row))}
                                disabled={actionSubmitting}
                              >
                                <ShieldCheck size={14} aria-hidden="true" />
                                Unflag
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`${classes.rowBtnDanger} ${classes.agentActionBtn}`}
                                onClick={() => setFlagModal({ agentId: row.agentId, agentName: getAgentName(row) })}
                                disabled={actionSubmitting}
                              >
                                <Flag size={14} aria-hidden="true" />
                                Flag
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={classes.pagination}>
            <span className={classes.pageMeta}>
              {paged.total === 0
                ? '0 agents'
                : `Showing ${paged.rangeStart}–${paged.rangeEnd} of ${paged.total}`}
            </span>
            <div className={classes.pageBtns}>
              <button
                type="button"
                className={classes.pageBtn}
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className={classes.pageIndicator}>
                Page {paged.page} / {paged.totalPages}
              </span>
              <button
                type="button"
                className={classes.pageBtn}
                disabled={paged.page >= paged.totalPages}
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
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
