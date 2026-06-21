import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Pencil, RefreshCw, Trash2, Wrench, X } from 'lucide-react';
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
} from '../services/adminService';
import classes from './AdminNotificationSettingsPage.module.css';

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

const AdminNotificationSettingsPage = () => {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState([]);
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
  const [submitting, setSubmitting] = useState(false);

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
    const out = await getAdminMaintenanceState();
    const m = out?.maintenance || {};
    setMaintenanceForm({
      active: Boolean(m.active),
      title: m.title || '',
      message: m.message || '',
      startsAt: toLocalDateTimeInput(m.startsAt),
      endsAt: toLocalDateTimeInput(m.endsAt),
    });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadHistory(), refreshMaintenance()]);
      } catch (err) {
        toast.error(err.message || 'Failed to load notification settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadHistory, refreshMaintenance]);

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
      <motion.div
        className={classes.page}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={classes.pageHeader} variants={presets.child}>
          <div className={classes.iconBox} aria-hidden="true">
            <Bell size={22} />
          </div>
          <div>
            <h2>Notification Settings</h2>
            <p>Send broadcasts, manage maintenance alerts, and edit or revoke past pushes</p>
          </div>
        </motion.div>

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
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Priority</th>
                  <th>Sent</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Actions</th>
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
                      <td>
                        <div className={classes.actionsCell}>
                          <button
                            type="button"
                            className={classes.iconBtn}
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
                            className={classes.dangerBtn}
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
      </motion.div>

      {editModal ? (
        <div className={classes.modalOverlay} role="presentation" onClick={() => !submitting && setEditModal(null)}>
          <div
            className={`glass ${classes.modalBox}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-notification-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={classes.modalHeader}>
              <h3 id="edit-notification-title">Edit notification</h3>
              <button type="button" className={classes.modalCloseBtn} onClick={() => setEditModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={classes.modalSub}>Changes apply to every user inbox immediately.</p>
            <form onSubmit={handleSaveEdit}>
              <div className={classes.modalField}>
                <label className={classes.modalLabel} htmlFor="edit-title">Title</label>
                <input
                  id="edit-title"
                  className={classes.input}
                  value={editModal.title}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className={classes.modalField}>
                <label className={classes.modalLabel} htmlFor="edit-body">Message</label>
                <textarea
                  id="edit-body"
                  className={classes.textarea}
                  value={editModal.body}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, body: e.target.value }))}
                />
              </div>
              <div className={classes.formRow}>
                <div className={classes.modalField}>
                  <label className={classes.modalLabel} htmlFor="edit-priority">Priority</label>
                  <select
                    id="edit-priority"
                    className={classes.select}
                    value={editModal.priority}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className={classes.modalField}>
                  <label className={classes.modalLabel} htmlFor="edit-expires">Expires</label>
                  <input
                    id="edit-expires"
                    type="datetime-local"
                    className={classes.input}
                    value={editModal.expiresAt}
                    onChange={(e) => setEditModal((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className={classes.modalActions}>
                <button type="button" className={classes.secondaryBtn} onClick={() => setEditModal(null)} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className={classes.primaryBtn} disabled={submitting}>
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteModal ? (
        <div className={classes.modalOverlay} role="presentation" onClick={() => !submitting && setDeleteModal(null)}>
          <div
            className={`glass ${classes.modalBox}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-notification-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={classes.modalHeader}>
              <h3 id="delete-notification-title">Delete notification</h3>
              <button type="button" className={classes.modalCloseBtn} onClick={() => setDeleteModal(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={classes.modalSub}>
              This removes &ldquo;{deleteModal.title}&rdquo; from all user inboxes. This cannot be undone.
            </p>
            <div className={classes.modalActions}>
              <button type="button" className={classes.secondaryBtn} onClick={() => setDeleteModal(null)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className={classes.dangerBtn} onClick={handleConfirmDelete} disabled={submitting}>
                Delete for all users
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default AdminNotificationSettingsPage;
