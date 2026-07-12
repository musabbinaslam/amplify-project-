import { useState, useEffect, useCallback, useMemo } from 'react';
import { Phone, Plus, Trash2, AlertTriangle, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  listAdminDids,
  listAdminAgencies,
  createAdminDid,
  patchAdminDid,
  deleteAdminDid,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

const PLATFORM_AGENCY_LABEL = 'Platform (no agency)';

function resolveAgencyLabel(agencyId, agencyNameById) {
  if (agencyId == null || agencyId === '') return 'Platform';
  return agencyNameById.get(String(agencyId)) || String(agencyId);
}

export default function AdminPhoneRoutingPage() {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [agencies, setAgencies] = useState([]);
  const [dids, setDids] = useState([]);
  const [patchingId, setPatchingId] = useState(null);
  const [didForm, setDidForm] = useState({
    phoneE164: '',
    campaignId: '',
    agencyId: '',
    label: '',
    active: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, didList, agencyList] = await Promise.all([
        getAdminOverviewLite(),
        listAdminDids(),
        listAdminAgencies().catch(() => ({ agencies: [] })),
      ]);
      setOverview(ov);
      setDids(didList.dids || []);
      setAgencies(agencyList.agencies || []);
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

  const agencyNameById = useMemo(() => {
    const map = new Map();
    agencies.forEach((agency) => {
      if (agency?.id) map.set(String(agency.id), agency.name || agency.id);
    });
    return map;
  }, [agencies]);

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
        agencyId: didForm.agencyId || null,
        label: didForm.label.trim(),
        active: didForm.active,
      });
      toast.success('Route created');
      setDidForm({
        phoneE164: '',
        campaignId: '',
        agencyId: '',
        label: '',
        active: true,
      });
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

  const handlePatchAgency = async (row, newAgencyId) => {
    setPatchingId(row.id);
    try {
      await patchAdminDid(row.id, { agencyId: newAgencyId || null });
      toast.success('Agency updated — calls will now route correctly');
      await refreshDids();
    } catch (err) {
      toast.error(err.message || 'Failed to update agency');
    } finally {
      setPatchingId(null);
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

  const brokenRoutes = dids.filter((d) => !d.agencyId);

  if (loading && !overview) return <PageLoader />;

  return (
    <AdminPageShell
      title="Phone Routing"
      description="Map incoming phone numbers to campaigns and agencies for Twilio call routing."
      icon={Phone}
      category={ADMIN_CATEGORIES.configuration}
    >
      {brokenRoutes.length > 0 && (
        <motion.div
          variants={presets.child}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 20,
          }}
        >
          <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: '#f59e0b', fontSize: 14 }}>
              {brokenRoutes.length} route{brokenRoutes.length > 1 ? 's are' : ' is'} missing an Agency — agency agents will NOT receive calls on these DIDs
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Use the Agency dropdown in the table below to assign the correct agency to each affected route.
            </p>
          </div>
        </motion.div>
      )}

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.cardTopRow} style={{ marginBottom: 8 }}>
          <div>
            <h2 className={classes.cardTitle}>Phone numbers → campaign</h2>
            <p className={classes.hint}>
              Incoming Twilio calls use the called number to resolve the campaign and agency.
              Setting an agency ensures calls are routed to agency agents, not the platform pool.
              Agency is required when routing DIDs to agency-locked campaigns.
            </p>
          </div>
        </div>

        <form className={classes.didForm} onSubmit={handleCreateDid}>
          <div className={classes.didFormFields}>
            <div className={classes.formField}>
              <label htmlFor="did-phone" className={classes.didFormFieldLabel}>Phone (E.164)</label>
              <input
                id="did-phone"
                className={classes.input}
                placeholder="+15551234567"
                value={didForm.phoneE164}
                onChange={(e) => setDidForm((f) => ({ ...f, phoneE164: e.target.value }))}
              />
            </div>
            <div className={classes.formField}>
              <label htmlFor="did-campaign" className={classes.didFormFieldLabel}>Campaign</label>
              <select
                id="did-campaign"
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
              <label
                htmlFor="did-agency"
                className={classes.didFormFieldLabel}
                title="Required for agency DIDs"
              >
                <Building2 size={13} aria-hidden="true" />
                Agency
              </label>
              <select
                id="did-agency"
                className={classes.select}
                value={didForm.agencyId}
                onChange={(e) => setDidForm((f) => ({ ...f, agencyId: e.target.value }))}
              >
                <option value="">{PLATFORM_AGENCY_LABEL}</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name || agency.id}
                  </option>
                ))}
              </select>
            </div>
            <div className={classes.formField}>
              <label htmlFor="did-label" className={classes.didFormFieldLabel}>Label</label>
              <input
                id="did-label"
                className={classes.input}
                placeholder="Optional"
                value={didForm.label}
                onChange={(e) => setDidForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
          </div>
          <div className={classes.didFormActions}>
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
                  <th>Agency</th>
                  <th>Label</th>
                  <th>Status</th>
                  <th className={classes.actionsHead}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dids.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={classes.muted}>
                      No routes yet
                    </td>
                  </tr>
                ) : (
                  dids.map((d) => {
                    const active = d.active !== false;
                    const isMissingAgency = !d.agencyId;
                    const isPatchingThis = patchingId === d.id;
                    const agencyLabel = resolveAgencyLabel(d.agencyId, agencyNameById);
                    return (
                      <tr
                        key={d.id}
                        style={isMissingAgency ? { background: 'rgba(245,158,11,0.05)' } : {}}
                      >
                        <td className={classes.mono}>
                          <span className={classes.tableCellTruncate} title={d.phoneE164}>
                            {d.phoneE164}
                          </span>
                        </td>
                        <td>
                          <span className={classes.tableCellTruncate} title={d.campaignId}>
                            {d.campaignId}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isMissingAgency && (
                              <AlertTriangle
                                size={13}
                                color="#f59e0b"
                                title="Missing agency — calls won't route to agency agents"
                              />
                            )}
                            <select
                              className={classes.select}
                              style={{
                                fontSize: 12,
                                padding: '3px 6px',
                                minWidth: 140,
                                borderColor: isMissingAgency ? 'rgba(245,158,11,0.6)' : undefined,
                              }}
                              value={d.agencyId || ''}
                              disabled={isPatchingThis}
                              title={agencyLabel}
                              onChange={(e) => handlePatchAgency(d, e.target.value)}
                            >
                              <option value="">Platform</option>
                              {agencies.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name || a.id}
                                </option>
                              ))}
                            </select>
                            {isPatchingThis && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saving…</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={classes.tableCellWrap} title={d.label || undefined}>
                            {d.label || '—'}
                          </span>
                        </td>
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
