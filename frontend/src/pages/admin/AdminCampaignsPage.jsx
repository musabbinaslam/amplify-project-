import { useState, useEffect, useCallback } from 'react';
import { Settings2, Plus, Trash2, Link } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  getAdminCampaignControls,
  patchAdminCampaignControl,
  deleteAdminCampaign,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import CampaignEditorModal from '../../components/modals/CampaignEditorModal';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminCampaignsPage() {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [campaignControls, setCampaignControls] = useState({});
  const [pauseReasonDraft, setPauseReasonDraft] = useState({});
  const [campaignEditorModal, setCampaignEditorModal] = useState(null);

  const loadShell = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await getAdminOverviewLite();
      setOverview(ov);
    } catch (e) {
      toast.error(e.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCampaignControls = useCallback(async () => {
    const out = await getAdminCampaignControls();
    setCampaignControls(out?.campaigns || {});
  }, []);

  useEffect(() => {
    Promise.all([loadShell(), refreshCampaignControls()]);
  }, [loadShell, refreshCampaignControls]);

  const campaigns = overview?.campaigns || [];

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

  const handleCopyPing = (campaignId) => {
    let baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
    baseUrl = baseUrl.replace(/\/+$/, ''); // trim trailing slash
    const pingUrl = `${baseUrl}/api/public/ping/${campaignId}?phone=[lead_phone]`;
    navigator.clipboard.writeText(pingUrl).then(() => {
      toast.success('Ping URL copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy Ping URL');
    });
  };

  const handleDeleteCampaign = async (campaignId, label) => {
    if (!window.confirm(`Are you sure you want to permanently delete the campaign "${label}" (${campaignId})? This cannot be undone.`)) return;
    try {
      await deleteAdminCampaign(campaignId);
      toast.success(`Campaign "${label}" deleted`);
      const [bundle, controls] = await Promise.all([
        getAdminOverviewLite(),
        getAdminCampaignControls(),
      ]);
      setOverview(bundle);
      setCampaignControls(controls?.campaigns || {});
    } catch (err) {
      toast.error(err.message || 'Failed to delete campaign');
    }
  };

  if (loading && !overview) return <PageLoader />;

  return (
    <AdminPageShell
      title="Campaign Settings"
      description="Edit pricing and buffers, pause campaigns, or add new ones."
      icon={Settings2}
      category={ADMIN_CATEGORIES.configuration}
    >
      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardTopRow} style={{ marginBottom: 8 }}>
          <div>
            <h2 className={classes.cardTitle}>Campaign Management</h2>
            <p className={classes.hint}>
              Edit pricing &amp; buffers, pause/resume campaigns, or add new ones. Changes take effect immediately across all pages.
            </p>
          </div>
          <button
            type="button"
            className={classes.primaryBtn}
            onClick={() => setCampaignEditorModal({})}
          >
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Campaign
          </button>
        </div>
        <div className={classes.tableWrap}>
          <div className={classes.tableScroll}>
            <table className={`${classes.table} ${classes.campaignTable}`}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Buffer</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Pause Reason</th>
                  <th className={classes.actionsHead}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={classes.muted}>No campaigns available</td>
                  </tr>
                ) : (
                  campaigns.map((c) => {
                    const control = campaignControls[c.id] || {};
                    const paused = Boolean(control.paused || c.paused);
                    const reasonValue = pauseReasonDraft[c.id] ?? (control.reason || c.pauseReason || '');
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.label}</strong>
                          <span className={classes.muted} style={{ display: 'block', fontSize: 11 }}>{c.id}</span>
                        </td>
                        <td>{c.buffer}s</td>
                        <td>${Number(c.price).toFixed(2)}</td>
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
                        <td className={classes.actionsCell}>
                          <div className={classes.actionGroup}>
                            <button
                              type="button"
                              className={classes.rowBtn}
                              onClick={() => setCampaignEditorModal(c)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={paused ? classes.rowBtnPrimary : classes.rowBtnWarn}
                              onClick={() => toggleCampaignPause(c.id, !paused)}
                            >
                              {paused ? 'Resume' : 'Pause'}
                            </button>
                            <button
                              type="button"
                              className={classes.rowBtn}
                              title={`Copy Ping URL for ${c.id}`}
                              onClick={() => handleCopyPing(c.id)}
                            >
                              <Link size={14} />
                            </button>
                            <button
                              type="button"
                              className={classes.rowBtnDanger}
                              title={`Delete campaign ${c.id}`}
                              onClick={() => handleDeleteCampaign(c.id, c.label)}
                            >
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

      {campaignEditorModal !== null && (
        <CampaignEditorModal
          campaign={campaignEditorModal?.id ? campaignEditorModal : null}
          onClose={() => setCampaignEditorModal(null)}
          onSaved={() => { loadShell(); }}
        />
      )}
    </AdminPageShell>
  );
}
