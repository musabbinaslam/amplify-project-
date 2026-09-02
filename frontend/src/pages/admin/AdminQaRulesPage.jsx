import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Plus, Trash2, X, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  listAdminQaRules,
  createAdminQaRule,
  updateAdminQaRule,
  deleteAdminQaRule,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AiFlagsMasterToggle from '../../components/admin/AiFlagsMasterToggle';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

const EMPTY_FORM = {
  name: '',
  description: '',
  instruction: '',
  severity: 'medium',
  active: true,
  campaignIds: [],
};

function shortDescription(rule) {
  const written = String(rule?.description || '').trim();
  if (written) return written;
  const instruction = String(rule?.instruction || '').replace(/\s+/g, ' ').trim();
  if (!instruction) return 'No description yet.';
  const sentence = instruction.split(/(?<=[.!?])\s+/)[0] || instruction;
  if (sentence.length <= 140) return sentence;
  return `${sentence.slice(0, 137).trimEnd()}…`;
}

function severityClass(severity) {
  if (severity === 'high') return classes.qaChipConfirmed;
  if (severity === 'low') return classes.qaChipClear;
  return classes.qaChipPending;
}

function severityLabel(severity) {
  if (severity === 'high') return 'High';
  if (severity === 'low') return 'Low';
  return 'Medium';
}

export default function AdminQaRulesPage() {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aiFlagsEnabled, setAiFlagsEnabled] = useState(true);

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

  useEffect(() => {
    if (!aiFlagsEnabled) setEditor(null);
  }, [aiFlagsEnabled]);

  const openCreate = () => {
    if (!aiFlagsEnabled) return;
    setForm(EMPTY_FORM);
    setEditor({ mode: 'create' });
  };

  const openEdit = (rule) => {
    if (!aiFlagsEnabled) return;
    setForm({
      name: rule.name || '',
      description: rule.description || '',
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

  const applyAllCampaigns = () => {
    setForm((prev) => ({ ...prev, campaignIds: [] }));
  };

  const saveRule = async (e) => {
    e.preventDefault();
    if (!aiFlagsEnabled) return;
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
    if (!aiFlagsEnabled) return;
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
    if (!aiFlagsEnabled) return;
    try {
      await updateAdminQaRule(rule.id, { active: !rule.active });
      toast.success(rule.active ? 'Rule paused' : 'Rule activated');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to update rule');
    }
  };

  const appliesAll = form.campaignIds.length === 0;
  const campaignLabel = (id) => campaigns.find((c) => c.id === id)?.label || id;
  const activeCount = rules.filter((rule) => rule.active !== false).length;
  const pausedCount = rules.length - activeCount;
  const coversAllCampaigns = rules.some(
    (rule) => !Array.isArray(rule.campaignIds) || rule.campaignIds.length === 0,
  );
  const scopedCampaignCount = new Set(
    rules.flatMap((rule) => (Array.isArray(rule.campaignIds) ? rule.campaignIds : [])),
  ).size;

  if (loading && !rules.length && !editor) return <PageLoader />;

  return (
    <>
      <AdminPageShell
        title="Compliance Rules"
        description="Gemini uses these rules when a call lands in the buffer +10–15s window."
        icon={ShieldAlert}
        category={ADMIN_CATEGORIES.quality}
        actions={(
          <div className={classes.qaHeaderActions}>
            <AiFlagsMasterToggle onChange={(snap) => setAiFlagsEnabled(snap.enabled)} />
            <Link to="/app/admin/ai-flags" className={classes.qaHeaderLink}>
              <Flag size={14} aria-hidden="true" />
              AI Flags
            </Link>
            {aiFlagsEnabled ? (
              <button type="button" className={classes.primaryBtn} onClick={openCreate}>
                <Plus size={15} />
                Add rule
              </button>
            ) : null}
          </div>
        )}
      >
        <motion.section className={classes.qaRulesPage} variants={presets.child}>
          <motion.div
            className={`glass ${classes.qaStrip} ${classes.qaRulesStrip}`}
            variants={presets.statsStrip}
          >
            <div className={`${classes.qaStripCell} ${activeCount > 0 ? classes.qaStripCellHot : ''}`}>
              <span className={classes.qaStripLabel}>Active</span>
              <span className={classes.qaStripValue}>{activeCount}</span>
              <span className={classes.qaStripSub}>Used on the next eligible call</span>
            </div>
            <div className={classes.qaStripCell}>
              <span className={classes.qaStripLabel}>Paused</span>
              <span className={classes.qaStripValue}>{pausedCount}</span>
              <span className={classes.qaStripSub}>Not sent to Gemini</span>
            </div>
            <div className={classes.qaStripCell}>
              <span className={classes.qaStripLabel}>Campaigns</span>
              <span className={classes.qaStripValue}>{coversAllCampaigns || !rules.length ? 'All' : scopedCampaignCount}</span>
              <span className={classes.qaStripSub}>
                {coversAllCampaigns || !rules.length ? 'Including new campaigns' : 'Selected only'}
              </span>
            </div>
          </motion.div>

          {!rules.length ? (
            <motion.div className={classes.qaEmpty} variants={presets.child}>
              <ShieldAlert size={26} className={classes.qaEmptyIcon} />
              <h4>No rules yet</h4>
              <p>
                {aiFlagsEnabled
                  ? 'Add a rule so Gemini knows what to flag on eligible recordings.'
                  : 'Turn on AI Flags to add compliance rules.'}
              </p>
            </motion.div>
          ) : (
            <motion.div className={classes.qaRulesList} variants={presets.grid}>
              {rules.map((rule) => {
                const scoped = Array.isArray(rule.campaignIds) && rule.campaignIds.length > 0;
                const visibleCampaigns = scoped ? rule.campaignIds.slice(0, 4) : [];
                const extraCampaigns = scoped ? Math.max(0, rule.campaignIds.length - 4) : 0;
                const paused = rule.active === false;

                return (
                  <motion.article
                    key={rule.id}
                    className={`${classes.qaCard} ${classes.qaRuleCard} ${paused ? classes.qaRuleCardPaused : ''}`}
                    variants={presets.child}
                    whileHover={reduceMotion ? undefined : { y: -3 }}
                    transition={{ duration: 0.2, ease: EASE_SMOOTH }}
                  >
                    <div className={classes.qaRuleCardHead}>
                      <h3 className={classes.qaRuleCardTitle}>{rule.name}</h3>
                      <div className={classes.qaRuleCardChips}>
                        <span className={`${classes.qaChip} ${severityClass(rule.severity)}`}>
                          {severityLabel(rule.severity)}
                        </span>
                        <span className={`${classes.qaChip} ${paused ? classes.qaChipDismissed : classes.qaChipClear}`}>
                          {paused ? 'Paused' : 'Active'}
                        </span>
                      </div>
                    </div>

                    <p className={classes.qaRuleBlurb}>{shortDescription(rule)}</p>

                    <div className={classes.qaRuleCardScope}>
                      {scoped ? (
                        <>
                          {visibleCampaigns.map((id) => (
                            <span key={id} className={classes.qaRulePill}>{campaignLabel(id)}</span>
                          ))}
                          {extraCampaigns > 0 ? (
                            <span className={classes.qaRulePill}>+{extraCampaigns}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className={classes.qaRulePill}>All campaigns</span>
                      )}
                    </div>

                    {aiFlagsEnabled ? (
                      <div className={classes.qaRuleCardFoot}>
                        <button type="button" className={classes.qaGhostBtn} onClick={() => openEdit(rule)}>
                          Edit
                        </button>
                        <button type="button" className={classes.qaGhostBtn} onClick={() => toggleActive(rule)}>
                          {paused ? 'Activate' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          className={classes.qaIconBtn}
                          onClick={() => handleDelete(rule)}
                          aria-label={`Delete ${rule.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </motion.article>
                );
              })}
            </motion.div>
          )}
        </motion.section>
      </AdminPageShell>

      <AnimatePresence>
      {editor ? (
        <motion.div
          className={classes.modalOverlay}
          onClick={() => !saving && setEditor(null)}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE_SMOOTH }}
        >
          <motion.div
            className={`glass ${classes.qaRuleModal}`}
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE_SMOOTH }}
          >
            <div className={classes.qaRuleModalHead}>
              <div>
                <h3>{editor.mode === 'edit' ? 'Edit rule' : 'New rule'}</h3>
                <p>Gemini reads this instruction on eligible recordings.</p>
              </div>
              <button
                type="button"
                className={classes.qaIconBtn}
                onClick={() => !saving && setEditor(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form className={classes.qaRuleForm} onSubmit={saveRule}>
              <label className={classes.qaRuleField}>
                <span>Name</span>
                <input
                  className={classes.input}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  maxLength={120}
                  placeholder="e.g. Premature hang-up"
                  required
                />
              </label>

              <label className={classes.qaRuleField}>
                <span>Short description</span>
                <input
                  className={classes.input}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  maxLength={180}
                  placeholder="Shown on this page — e.g. Agent ends the call before starting the job."
                />
              </label>

              <label className={classes.qaRuleField}>
                <span>Instruction</span>
                <textarea
                  className={classes.qaRuleTextarea}
                  rows={6}
                  value={form.instruction}
                  onChange={(e) => setForm((prev) => ({ ...prev, instruction: e.target.value }))}
                  placeholder='Flag if the agent hangs up before starting the job. Include a short quote and timestamp when evidence is clear.'
                  required
                />
              </label>

              <div className={classes.qaRuleMetaRow}>
                <div className={classes.qaRuleField}>
                  <span>Severity</span>
                  <div className={classes.qaSeg} role="group" aria-label="Severity">
                    {['low', 'medium', 'high'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`${classes.qaSegBtn} ${form.severity === level ? classes.qaSegBtnActive : ''}`}
                        onClick={() => setForm((prev) => ({ ...prev, severity: level }))}
                      >
                        {severityLabel(level)}
                      </button>
                    ))}
                  </div>
                </div>
                <label className={classes.qaRuleToggle}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                  />
                  <span>
                    <strong>{form.active ? 'Active' : 'Paused'}</strong>
                    <em>Used on the next eligible call</em>
                  </span>
                </label>
              </div>

              <div className={classes.qaRuleField}>
                <span>Campaigns</span>
                <p className={classes.qaRuleHint}>
                  {appliesAll
                    ? 'Applies to every campaign, including new ones.'
                    : `Applies to ${form.campaignIds.length} selected campaign${form.campaignIds.length === 1 ? '' : 's'}.`}
                </p>
                <div className={classes.qaCampaignGrid}>
                  <button
                    type="button"
                    className={`${classes.qaPick} ${appliesAll ? classes.qaPickActive : ''}`}
                    onClick={applyAllCampaigns}
                  >
                    All campaigns
                  </button>
                  {campaigns.map((c) => {
                    const checked = form.campaignIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`${classes.qaPick} ${checked ? classes.qaPickActive : ''}`}
                        onClick={() => toggleCampaign(c.id)}
                      >
                        {c.label || c.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={classes.qaRuleFooter}>
                <button type="button" className={classes.modalCancelBtn} onClick={() => setEditor(null)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={classes.primaryBtn} disabled={saving}>
                  {saving ? 'Saving…' : 'Save rule'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}
