import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  listAdminDids,
  createAdminDid,
  patchAdminDid,
  deleteAdminDid,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminPhoneRoutingPage() {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [dids, setDids] = useState([]);
  const [didForm, setDidForm] = useState({
    phoneE164: '',
    campaignId: '',
    label: '',
    active: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, didList] = await Promise.all([
        getAdminOverviewLite(),
        listAdminDids(),
      ]);
      setOverview(ov);
      setDids(didList.dids || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load phone routing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const campaigns = overview?.campaigns || [];

  const refreshDids = async () => {
    const didList = await listAdminDids();
    setDids(didList.dids || []);
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

  if (loading && !overview) return <PageLoader />;

  return (
    <AdminPageShell
      title="Phone Routing"
      description="Map incoming phone numbers to campaigns for Twilio call routing."
      icon={Phone}
      category={ADMIN_CATEGORIES.configuration}
    >
      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardTopRow} style={{ marginBottom: 8 }}>
          <div>
            <h2 className={classes.cardTitle}>Phone numbers → campaign</h2>
            <p className={classes.hint}>
              Incoming Twilio calls use the called number to resolve the campaign when no query/body campaign is set.
            </p>
          </div>
        </div>

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
            <table className={`${classes.table} ${classes.routingTable}`}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Campaign</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th className={classes.actionsHead}>Actions</th>
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
                  dids.map((d) => {
                    const active = d.active !== false;
                    return (
                      <tr key={d.id}>
                        <td className={classes.mono}>{d.phoneE164}</td>
                        <td>{d.campaignId}</td>
                        <td>{d.label || '—'}</td>
                        <td>
                          <span className={`${classes.statusPill} ${active ? classes.dispAnswered : classes.dispMissed}`}>
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className={classes.actionsCell}>
                          <div className={classes.actionGroup}>
                            <button
                              type="button"
                              className={active ? classes.rowBtnWarn : classes.rowBtnPrimary}
                              onClick={() => toggleDidActive(d)}
                            >
                              {active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className={classes.rowBtnDanger}
                              title={`Remove route for ${d.phoneE164}`}
                              onClick={() => removeDid(d)}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
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
    </AdminPageShell>
  );
}
