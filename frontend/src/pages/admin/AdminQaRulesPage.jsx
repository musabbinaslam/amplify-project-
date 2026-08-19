import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  listAdminQaRules,
  createAdminQaRule,
  updateAdminQaRule,
  deleteAdminQaRule,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

const EMPTY_FORM = {
  name: '',
  instruction: '',
  severity: 'medium',
  active: true,
  campaignIds: [],
};

export default function AdminQaRulesPage() {
  const presets = useSubtlePageMotion();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, overview] = await Promise.all([
        listAdminQaRules(),
        getAdminOverviewLite().catch(() => null),
      ]);
      setRules(rulesRes?.rules || []);
      setCampaigns(overview?.campaigns || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load compliance rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditor({ mode: 'create' });
  };

  const openEdit = (rule) => {
    setForm({
      name: rule.name || '',
      instruction: rule.instruction || '',
      severity: rule.severity || 'medium',
      active: rule.active !== false,
      campaignIds: Array.isArray(rule.campaignIds) ? rule.campaignIds : [],
    });
    setEditor({ mode: 'edit', rule });
  };

  const toggleCampaign = (campaignId) => {
    setForm((prev) => {
      const has = prev.campaignIds.includes(campaignId);
      return {
        ...prev,
        campaignIds: has
          ? prev.campaignIds.filter((id) => id !== campaignId)
          : [...prev.campaignIds, campaignId],
      };
    });
  };

  const saveRule = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.instruction.trim()) {
      toast.error('Name and instruction are required');
      return;
    }
    setSaving(true);
    try {
      if (editor?.mode === 'edit') {
        await updateAdminQaRule(editor.rule.id, form);
        toast.success('Rule updated');
      } else {
        await createAdminQaRule(form);
        toast.success('Rule created');
      }
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Delete compliance rule “${rule.name}”?`)) return;
    try {
      await deleteAdminQaRule(rule.id);
      toast.success('Rule deleted');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to delete rule');
    }
  };

  const toggleActive = async (rule) => {
    try {
      await updateAdminQaRule(rule.id, { active: !rule.active });
      toast.success(rule.active ? 'Rule paused' : 'Rule activated');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to update rule');
    }
  };

  if (loading && !rules.length && !editor) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Compliance Rules"
        description="Define the recording rules Gemini checks after each call."
        icon={ShieldAlert}
        category={ADMIN_CATEGORIES.quality}
      >
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.cardTopRow} style={{ marginBottom: 8 }}>
            <div>
              <h2 className={classes.cardTitle}>Recording QA rules</h2>
              <p className={classes.hint}>
                Active rules are sent with each recording. Leave campaigns empty to apply a rule to every campaign.
              </p>
            </div>
            <button type="button" className={classes.primaryBtn} onClick={openCreate}>
              <Plus size={15} style={{ marginRight: 6 }} />
              Add rule
            </button>
          </div>
          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Severity</th>
                    <th>Campaigns</th>
                    <th>Status</th>
                    <th className={classes.actionsHead}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!rules.length ? (
                    <tr>
                      <td colSpan={5} className={classes.muted}>No compliance rules yet.</td>
                    </tr>
                  ) : rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <strong>{rule.name}</strong>
                        <span className={classes.muted} style={{ display: 'block', fontSize: 12 }}>
                          {String(rule.instruction || '').slice(0, 120)}{rule.instruction?.length > 120 ? '…' : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`${classes.statusPill} ${
                          rule.severity === 'high' ? classes.dispMissed
                            : rule.severity === 'low' ? classes.dispSold
                              : classes.dispAnswered
                        }`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td>
                        {!rule.campaignIds?.length
                          ? 'All campaigns'
                          : rule.campaignIds.join(', ')}
                      </td>
                      <td>
                        <span className={`${classes.statusPill} ${rule.active ? classes.dispAnswered : classes.dispMissed}`}>
                          {rule.active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className={classes.actionsCell}>
                        <div className={classes.actionGroup}>
                          <button type="button" className={classes.rowBtn} onClick={() => openEdit(rule)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className={rule.active ? classes.rowBtnWarn : classes.rowBtnPrimary}
                            onClick={() => toggleActive(rule)}
                          >
                            {rule.active ? 'Pause' : 'Activate'}
                          </button>
                          <button type="button" className={classes.rowBtnDanger} onClick={() => handleDelete(rule)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>
      </AdminPageShell>

      {editor ? (
        <div className={classes.modalOverlay} onClick={() => !saving && setEditor(null)}>
          <div className={`glass ${classes.modalBox}`} onClick={(e) => e.stopPropagation()}>
            <div className={classes.modalHeader}>
              <h3>{editor.mode === 'edit' ? 'Edit compliance rule' : 'New compliance rule'}</h3>
            </div>
            <form onSubmit={saveRule}>
              <label className={classes.modalLabelStack}>
                Name
                <input
                  className={classes.input}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  maxLength={120}
                  required
                />
              </label>
              <label className={classes.modalLabelStack}>
                Instruction for Gemini
                <textarea
                  className={classes.modalTextarea}
                  rows={5}
                  value={form.instruction}
                  onChange={(e) => setForm((prev) => ({ ...prev, instruction: e.target.value }))}
                  placeholder='e.g. Flag if the agent guarantees coverage or says "you are approved".'
                  required
                />
              </label>
              <label className={classes.modalLabelStack}>
                Severity
                <select
                  className={classes.select}
                  value={form.severity}
                  onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className={classes.modalLabelStack}>
                <span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                  /> Active
                </span>
              </label>
              <div className={classes.modalLabelStack}>
                Campaigns (empty = all)
                <div className={classes.qaCampaignChips}>
                  {campaigns.map((c) => (
                    <label key={c.id} className={classes.qaCampaignChip}>
                      <input
                        type="checkbox"
                        checked={form.campaignIds.includes(c.id)}
                        onChange={() => toggleCampaign(c.id)}
                      />
                      {c.label || c.id}
                    </label>
                  ))}
                </div>
              </div>
              <div className={classes.modalActions}>
                <button type="button" className={classes.modalCancelBtn} onClick={() => setEditor(null)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={classes.primaryBtn} disabled={saving}>
                  {saving ? 'Saving…' : 'Save rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
