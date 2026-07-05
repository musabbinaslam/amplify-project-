import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminAnalyticsBundle,
  forceRemoveAgent,
  flagAdminAgent,
  resumeAdminAgent,
  listAdminUsers,
  patchManagerSettings,
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
  const [allUsers, setAllUsers] = useState([]);
  const [managerTargetUid, setManagerTargetUid] = useState('');
  const [managerRole, setManagerRole] = useState('agent');
  const [managerManaged, setManagerManaged] = useState([]);
  const [managerSaving, setManagerSaving] = useState(false);
  const [managerAgentSearch, setManagerAgentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userPickerOpen, setUserPickerOpen] = useState(false);

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

  const loadAllUsers = useCallback(async () => {
    try {
      const data = await listAdminUsers();
      setAllUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      // Non-fatal: panel falls back to analytics directory below.
    }
  }, []);

  useEffect(() => {
    loadAllUsers();
  }, [loadAllUsers]);

  const agentDirectory = useMemo(() => {
    const map = new Map();
    allUsers.forEach((u) => {
      if (u.uid && !map.has(u.uid)) map.set(u.uid, { id: u.uid, name: u.name || u.email || u.uid });
    });
    if (map.size === 0) {
      agentStats.forEach((a) => {
        const id = getAgentId(a);
        if (id && !map.has(id)) map.set(id, { id, name: getAgentName(a) });
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, agentStats]);

  const selectedUserName = useMemo(
    () => agentDirectory.find((a) => a.id === managerTargetUid)?.name || '',
    [agentDirectory, managerTargetUid],
  );

  const userPickerResults = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = q
      ? agentDirectory.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      : agentDirectory;
    return list.slice(0, 50);
  }, [agentDirectory, userSearch]);

  useEffect(() => {
    if (!managerTargetUid) {
      setManagerRole('agent');
      setManagerManaged([]);
      return;
    }
    const u = allUsers.find((x) => x.uid === managerTargetUid);
    setManagerRole(u?.role === 'manager' ? 'manager' : 'agent');
    setManagerManaged(Array.isArray(u?.managedAgents) ? u.managedAgents : []);
  }, [managerTargetUid, allUsers]);

  const managedDirectory = useMemo(() => {
    const q = managerAgentSearch.trim().toLowerCase();
    return agentDirectory.filter((a) => (
      a.id !== managerTargetUid && (!q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
    ));
  }, [agentDirectory, managerAgentSearch, managerTargetUid]);

  const toggleManagedAgent = useCallback((uid) => {
    setManagerManaged((prev) => (
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    ));
  }, []);

  const handleSaveManagerSettings = async () => {
    if (!managerTargetUid) {
      toast.error('Select a user first');
      return;
    }
    setManagerSaving(true);
    try {
      const payload = {
        role: managerRole,
        managedAgents: managerRole === 'manager' ? managerManaged : [],
      };
      const out = await patchManagerSettings(managerTargetUid, payload);
      toast.success(`Saved: ${out.role}${out.role === 'manager' ? ` (${out.managedAgents.length} agents)` : ''}`);
      await loadAllUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to save manager settings');
    } finally {
      setManagerSaving(false);
    }
  };

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
                  </tr>
                </thead>
                <tbody>
                  {analyticsLoading ? (
                    <tr><td colSpan={7} className={classes.muted}>Loading analytics…</td></tr>
                  ) : filteredAgentStats.length === 0 ? (
                    <tr><td colSpan={7} className={classes.muted}>No agent stats match this filter</td></tr>
                  ) : (
                    filteredAgentStats.map((row) => (
                      <tr key={row.agentId}>
                        <td className={classes.agentCell}>
                          <details style={{ cursor: 'pointer' }}>
                            <summary style={{ listStyle: 'none' }} title="Tap to view phone number">
                              <strong>{getAgentName(row)}</strong>
                              {getAgentName(row) !== getAgentId(row) ? (
                                <span className={classes.agentSubId}>{getAgentId(row)}</span>
                              ) : null}
                            </summary>
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                      type="button"
                                      onClick={() => handleResumeAgent(row.agentId, getAgentName(row))}
                                    >
                                      ✅ Resume Agent
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className={classes.dangerBtn}
                                    style={{ padding: '4px 8px', fontSize: '11px', minHeight: 'auto' }}
                                    type="button"
                                    onClick={() => setFlagModal({ agentId: row.agentId, agentName: getAgentName(row) })}
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
          <h2 className={classes.cardTitle}>Manager settings</h2>
          <p className={classes.hint}>
            Promote any user to a read-only Manager. Managers see a Team Dashboard scoped strictly to the agents you select below — no wallet, phone, or admin access.
          </p>

          <div className={classes.didForm} style={{ gridTemplateColumns: '1.4fr 1fr', position: 'relative', zIndex: 20 }}>
            <div className={classes.formField}>
              <label>User</label>
              <div className={classes.combo}>
                <input
                  className={classes.select}
                  placeholder="Search by name, email, or ID…"
                  value={userPickerOpen ? userSearch : (selectedUserName || userSearch)}
                  onFocus={() => { setUserPickerOpen(true); setUserSearch(''); }}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPickerOpen(true); }}
                  onBlur={() => setTimeout(() => setUserPickerOpen(false), 150)}
                  aria-label="Search for a user to manage"
                />
                {userPickerOpen ? (
                  <div className={classes.comboMenu}>
                    {userPickerResults.length === 0 ? (
                      <div className={classes.comboEmpty}>No users match “{userSearch}”.</div>
                    ) : (
                      userPickerResults.map((a) => (
                        <div
                          key={a.id}
                          className={classes.comboItem}
                          onMouseDown={() => {
                            setManagerTargetUid(a.id);
                            setUserPickerOpen(false);
                            setUserSearch('');
                          }}
                        >
                          <span className={classes.comboItemName}>{a.name}</span>
                          <span className={classes.comboItemSub}>{a.id}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {managerTargetUid ? (
                <span className={classes.muted} style={{ fontSize: '12px', marginTop: '4px' }}>
                  Selected: <strong>{selectedUserName}</strong>
                </span>
              ) : null}
            </div>
            <div className={classes.formField}>
              <label>Role</label>
              <select
                className={classes.select}
                value={managerRole}
                onChange={(e) => setManagerRole(e.target.value)}
              >
                <option value="agent">Agent</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>

          {managerRole === 'manager' ? (
            <div style={{ marginTop: '8px' }}>
              <div className={classes.cardTopRow}>
                <h3 className={classes.cardTitle} style={{ fontSize: '15px' }}>
                  Managed agents {managerManaged.length ? `(${managerManaged.length})` : ''}
                </h3>
                <input
                  className={classes.searchInput}
                  placeholder="Search agents"
                  value={managerAgentSearch}
                  onChange={(e) => setManagerAgentSearch(e.target.value)}
                />
              </div>
              {!managerTargetUid ? (
                <p className={classes.muted}>Select a user above to assign agents.</p>
              ) : managedDirectory.length === 0 ? (
                <p className={classes.muted}>No agents match this search.</p>
              ) : (
                <div
                  className={classes.tableWrap}
                  style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px' }}
                >
                  {managedDirectory.map((a) => (
                    <label key={a.id} className={classes.check} style={{ padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={managerManaged.includes(a.id)}
                        onChange={() => toggleManagedAgent(a.id)}
                      />
                      {a.name}
                      <span className={classes.agentSubId} style={{ marginLeft: '6px' }}>{a.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={handleSaveManagerSettings}
              disabled={managerSaving || !managerTargetUid}
            >
              {managerSaving ? 'Saving…' : 'Save manager settings'}
            </button>
          </div>
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
              <h3>Flag Agent</h3>
              <button type="button" className={classes.modalCloseBtn} onClick={() => setFlagModal(null)}>
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
}
