import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell, Pencil, RefreshCw, Trash2, Wrench, X, Save, Type, MessageSquareText, Flag, CalendarClock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import {
  deleteAdminBroadcast,
  getAdminMaintenanceState,
  listAdminBroadcasts,
  patchAdminBroadcast,
  patchAdminMaintenanceState,
  postAdminBroadcastNotification,
  postAdminTargetedNotification,
  listAdminUsersLite,
} from '../services/adminService';
import { ADMIN_CATEGORIES } from '../config/adminModules';
import AdminPageShell from '../components/admin/AdminPageShell';
import classes from './AdminNotificationSettingsPage.module.css';
import shared from '../components/admin/adminShared.module.css';

const toLocalDateTimeInput = (value) => {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const nowLocalInput = () => toLocalDateTimeInput(new Date());

function formatSentAt(row) {
  const value = row?.createdAtIso || row?.createdAt;
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString();
}

function getBroadcastStatus(row) {
  if (row?.revoked) return 'revoked';
  if (row?.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function statusLabel(status) {
  if (status === 'revoked') return 'Revoked';
  if (status === 'expired') return 'Expired';
  return 'Active';
}

function statusClass(status) {
  if (status === 'revoked') return classes.statusRevoked;
  if (status === 'expired') return classes.statusExpired;
  return classes.statusActive;
}

export default function AdminNotificationSettingsPage() {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [targetedForm, setTargetedForm] = useState({
    userIds: [],
    title: '',
    body: '',
    priority: 'normal',
    expiresAt: '',
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
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const out = await listAdminBroadcasts({ limit: 100 });
      setBroadcasts(Array.isArray(out?.rows) ? out.rows : []);
    } catch (err) {
      toast.error(err.message || 'Failed to load notification history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

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
      console.error('Failed to load maintenance state', err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const out = await listAdminUsersLite();
      setAvailableUsers(out?.users || []);
    } catch (err) {
      console.error('Failed to load users for targeted push', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadHistory(), refreshMaintenance(), loadUsers()]);
      } catch (err) {
        toast.error(err.message || 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHistory, refreshMaintenance, loadUsers]);

  const filteredUsers = useMemo(() => {
    return availableUsers.filter(u => 
      (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableUsers, searchQuery]);

  const toggleUser = (id) => {
    setTargetedForm(prev => {
      const isSelected = prev.userIds.includes(id);
      return {
        ...prev,
        userIds: isSelected ? prev.userIds.filter(u => u !== id) : [...prev.userIds, id]
      };
    });
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
      setSubmitting(true);
      const payload = {
        title: broadcastForm.title.trim(),
        body: broadcastForm.body.trim(),
        priority: broadcastForm.priority,
        ...(broadcastForm.expiresAt ? { expiresAt: new Date(broadcastForm.expiresAt).toISOString() } : {}),
      };
      const out = await postAdminBroadcastNotification(payload);
      toast.success(`Broadcast sent to ${out.recipientCount || 0} users`);
      setBroadcastForm((prev) => ({ ...prev, title: '', body: '', expiresAt: '' }));
      await loadHistory();
    } catch (err) {
      toast.error(err.message || 'Failed to send broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendTargeted = async (e) => {
    e.preventDefault();
    if (targetedForm.userIds.length === 0) {
      toast.error('Please select at least one user');
      return;
    }
    if (!targetedForm.title.trim() || !targetedForm.body.trim()) {
      toast.error('Notification title and message are required');
      return;
    }
    try {
      const now = Date.now();
      if (targetedForm.expiresAt) {
        const expiresMs = new Date(targetedForm.expiresAt).getTime();
        if (!Number.isFinite(expiresMs) || expiresMs < now) {
          toast.error('Expiry must be in the future');
          return;
        }
      }
      setSubmitting(true);
      const payload = {
        userIds: targetedForm.userIds,
        title: targetedForm.title.trim(),
        body: targetedForm.body.trim(),
        priority: targetedForm.priority,
        ...(targetedForm.expiresAt ? { expiresAt: new Date(targetedForm.expiresAt).toISOString() } : {}),
      };
      const out = await postAdminTargetedNotification(payload);
      toast.success(`Targeted push sent to ${out.recipientCount || 0} users`);
      setTargetedForm({ userIds: [], title: '', body: '', priority: 'normal', expiresAt: '' });
      await loadHistory();
    } catch (err) {
      toast.error(err.message || 'Failed to send targeted push');
    } finally {
      setSubmitting(false);
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

      setSubmitting(true);
      const payload = {
        active: isActive,
        title: isActive ? maintenanceForm.title.trim() : '',
        message: isActive ? maintenanceForm.message.trim() : '',
        startsAt: isActive && maintenanceForm.startsAt ? new Date(maintenanceForm.startsAt).toISOString() : null,
        endsAt: isActive && maintenanceForm.endsAt ? new Date(maintenanceForm.endsAt).toISOString() : null,
      };
      await patchAdminMaintenanceState(payload);
      toast.success(maintenanceForm.active ? 'Maintenance update published' : 'Maintenance mode turned off');
      await Promise.all([refreshMaintenance(), loadHistory()]);
    } catch (err) {
      toast.error(err.message || 'Failed to save maintenance state');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModal?.id) return;
    if (!editModal.title.trim() || !editModal.body.trim()) {
      toast.error('Title and message are required');
      return;
    }
    try {
      setSubmitting(true);
      await patchAdminBroadcast(editModal.id, {
        title: editModal.title.trim(),
        body: editModal.body.trim(),
        priority: editModal.priority,
        expiresAt: editModal.expiresAt
          ? new Date(editModal.expiresAt).toISOString()
          : null,
      });
      toast.success('Notification updated for all users');
      setEditModal(null);
      await loadHistory();
    } catch (err) {
      toast.error(err.message || 'Failed to update notification');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal?.id) return;
    try {
      setSubmitting(true);
      const out = await deleteAdminBroadcast(deleteModal.id);
      toast.success(`Removed from ${out.removedCount || 0} user inboxes`);
      setDeleteModal(null);
      await loadHistory();
    } catch (err) {
      toast.error(err.message || 'Failed to delete notification');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedBroadcasts = useMemo(
    () => [...broadcasts].sort((a, b) => {
      const aTs = new Date(a.createdAtIso || a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAtIso || b.createdAt || 0).getTime();
      return bTs - aTs;
    }),
    [broadcasts],
  );

  if (loading) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Notification Settings"
        description="Send broadcasts, manage maintenance alerts, and edit or revoke past pushes."
        icon={Bell}
        category={ADMIN_CATEGORIES.communications}
      >
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <h2 className={classes.cardTitle}>Send notifications</h2>
          <p className={classes.hint}>
            Pushes sent before this page launched are not listed in history.
          </p>
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
              <button type="submit" className={classes.primaryBtn} disabled={submitting}>
                Send broadcast
              </button>
            </form>

            <form className={classes.notificationForm} onSubmit={handleSendTargeted}>
              <h3 className={classes.subTitle}>Targeted push</h3>
              
              <div style={{ position: 'relative' }}>
                <div 
                  className={classes.input} 
                  style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '42px', alignItems: 'center' }}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  {targetedForm.userIds.length === 0 ? <span style={{color: 'var(--text-secondary)'}}>Select users...</span> : (
                    targetedForm.userIds.map(id => {
                      const u = availableUsers.find(x => x.id === id);
                      return (
                        <span key={id} style={{ background: 'var(--brand-solid)', color: 'var(--brand-on)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {u?.name || id}
                          <X size={12} style={{cursor:'pointer'}} onClick={(e) => { e.stopPropagation(); toggleUser(id); }} />
                        </span>
                      );
                    })
                  )}
                </div>
                {dropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'color-mix(in srgb, var(--surface-container-highest) 96%, transparent)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', marginTop: '4px', maxHeight: '240px', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 24px rgba(0,0,0,0.4)' }}>
                    <input 
                      className={classes.input} 
                      style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', background: 'transparent' }} 
                      placeholder="Search users..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                    <div style={{ overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {filteredUsers.length === 0 && <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>No users found</div>}
                      {filteredUsers.map(u => (
                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', cursor: 'pointer', borderRadius: 'var(--radius-md)', background: targetedForm.userIds.includes(u.id) ? 'color-mix(in srgb, var(--brand-text) 12%, transparent)' : 'transparent', transition: 'background 0.15s ease' }}>
                          <input type="checkbox" style={{ accentColor: 'var(--brand-text)' }} checked={targetedForm.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: targetedForm.userIds.includes(u.id) ? '600' : '500' }}>{u.name}</span>
                            {u.email && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{u.email}</span>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                className={classes.input}
                placeholder="Notification title"
                value={targetedForm.title}
                onChange={(e) => setTargetedForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <textarea
                className={classes.textarea}
                placeholder="Message"
                value={targetedForm.body}
                onChange={(e) => setTargetedForm((prev) => ({ ...prev, body: e.target.value }))}
              />
              <div className={classes.formRow}>
                <select
                  className={classes.select}
                  value={targetedForm.priority}
                  onChange={(e) => setTargetedForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="low">Low priority</option>
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                </select>
                <input
                  type="datetime-local"
                  className={classes.input}
                  value={targetedForm.expiresAt}
                  onChange={(e) => setTargetedForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  min={nowLocalInput()}
                />
              </div>
              <button type="submit" className={classes.primaryBtn} disabled={submitting}>
                Send targeted push
              </button>
            </form>

            <form className={classes.notificationForm} onSubmit={handleSaveMaintenance}>
              <h3 className={classes.subTitle}>
                <Wrench size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                Maintenance banner
              </h3>
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
              <button type="submit" className={classes.primaryBtn} disabled={submitting}>
                {maintenanceForm.active ? 'Publish maintenance update' : 'Save maintenance off'}
              </button>
            </form>
          </div>
        </motion.section>

        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.toolbar}>
            <div>
              <h2 className={classes.cardTitle}>Push history</h2>
              <p className={classes.hint}>Edit or delete a push to update every user inbox.</p>
            </div>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={loadHistory}
              disabled={historyLoading}
            >
              <RefreshCw size={16} className={historyLoading ? classes.spin : undefined} />
              Refresh
            </button>
          </div>

          <div className={classes.tableWrap}>
            <table className={`${classes.table} ${classes.historyTable}`}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Priority</th>
                  <th>Sent</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th className={classes.actionsHead}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedBroadcasts.length ? sortedBroadcasts.map((row) => {
                  const status = getBroadcastStatus(row);
                  const isRevoked = status === 'revoked';
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className={`${classes.typePill} ${row.type === 'maintenance' ? classes.typeMaintenance : classes.typeBroadcast}`}>
                          {row.type === 'maintenance' ? 'Maintenance' : 'Broadcast'}
                        </span>
                      </td>
                      <td>{row.title || '—'}</td>
                      <td className={classes.previewCell}>{row.body || '—'}</td>
                      <td>{row.priority || 'normal'}</td>
                      <td>{formatSentAt(row)}</td>
                      <td>{row.recipientCount ?? '—'}</td>
                      <td>
                        <span className={`${classes.statusPill} ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className={classes.actionsCell}>
                        <div className={classes.actionGroup}>
                          <button
                            type="button"
                            className={classes.rowBtn}
                            disabled={isRevoked || submitting}
                            onClick={() => setEditModal({
                              id: row.id,
                              title: row.title || '',
                              body: row.body || '',
                              priority: row.priority || 'normal',
                              expiresAt: toLocalDateTimeInput(row.expiresAt),
                            })}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className={classes.rowBtnDanger}
                            disabled={isRevoked || submitting}
                            onClick={() => setDeleteModal({ id: row.id, title: row.title || 'Notification' })}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8}>
                      <div className={classes.emptyPanel}>No admin pushes yet. Send a broadcast or publish maintenance above.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>
      </AdminPageShell>

      {editModal ? (
        <motion.div
          className={shared.modalOverlay}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => !submitting && setEditModal(null)}
        >
          <motion.div
            className={`glass ${shared.modalBox}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-notification-title"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shared.modalHeader}>
              <h3 id="edit-notification-title">Edit notification</h3>
              <button type="button" className={shared.modalCloseBtn} onClick={() => setEditModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={shared.modalSub}>Changes apply to every user inbox immediately.</p>
            <form onSubmit={handleSaveEdit}>
              <div className={shared.modalField}>
                <label className={shared.modalLabel} htmlFor="edit-title">
                  <Type size={14} />
                  Title
                </label>
                <input
                  id="edit-title"
                  className={shared.input}
                  value={editModal.title}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div className={shared.modalField}>
                <label className={shared.modalLabel} htmlFor="edit-body">
                  <MessageSquareText size={14} />
                  Message
                </label>
                <textarea
                  id="edit-body"
                  className={shared.modalTextarea}
                  rows={4}
                  value={editModal.body}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, body: e.target.value }))}
                  required
                />
              </div>
              <div className={shared.modalFormGrid}>
                <div className={shared.modalField}>
                  <label className={shared.modalLabel} htmlFor="edit-priority">
                    <Flag size={14} />
                    Priority
                  </label>
                  <select
                    id="edit-priority"
                    className={shared.select}
                    value={editModal.priority}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className={shared.modalField}>
                  <label className={shared.modalLabel} htmlFor="edit-expires">
                    <CalendarClock size={14} />
                    Expires
                  </label>
                  <input
                    id="edit-expires"
                    type="datetime-local"
                    className={shared.input}
                    value={editModal.expiresAt}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className={shared.modalActions}>
                <button type="button" className={shared.modalCancelBtn} onClick={() => setEditModal(null)} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className={shared.primaryBtn} disabled={submitting}>
                  <Save size={15} />
                  {submitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}

      {deleteModal ? (
        <motion.div
          className={shared.modalOverlay}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => !submitting && setDeleteModal(null)}
        >
          <motion.div
            className={`glass ${shared.modalBox}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-notification-title"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shared.modalHeader}>
              <h3 id="delete-notification-title">Delete notification</h3>
              <button type="button" className={shared.modalCloseBtn} onClick={() => setDeleteModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={shared.modalSub}>
              This removes &ldquo;{deleteModal.title}&rdquo; from all user inboxes. This cannot be undone.
            </p>
            <div className={shared.modalActions}>
              <button type="button" className={shared.modalCancelBtn} onClick={() => setDeleteModal(null)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className={shared.dangerBtn} onClick={handleConfirmDelete} disabled={submitting}>
                <Trash2 size={15} />
                {submitting ? 'Deleting…' : 'Delete for all users'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </>
  );
};


