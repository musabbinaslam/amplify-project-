import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Save, Tag, Clock, DollarSign, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { upsertAdminCampaign } from '../../services/adminService';
import PropTypes from 'prop-types';
import classes from '../../pages/AdminDashboardPage.module.css';

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const BOX_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.15 } },
};

const EMPTY_FORM = { id: '', label: '', buffer: '', price: '' };

/**
 * CampaignEditorModal
 *
 * Props:
 *   campaign  — null (add mode) or { id, label, buffer, price } (edit mode)
 *   onClose   — callback to close the modal
 *   onSaved   — callback(updatedCampaign) called after a successful save
 */
export default function CampaignEditorModal({ campaign, onClose, onSaved }) {
  const isEdit = Boolean(campaign?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (campaign) {
      setForm({
        id: campaign.id || '',
        label: campaign.label || '',
        buffer: String(campaign.buffer ?? ''),
        price: String(campaign.price ?? ''),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [campaign]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await upsertAdminCampaign({
        id: form.id.trim().toLowerCase(),
        label: form.label.trim(),
        buffer: Number(form.buffer),
        price: Number(form.price),
      });
      toast.success(isEdit ? `"${result.campaign.label}" updated!` : `"${result.campaign.label}" created!`);
      onSaved?.(result.campaign);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={classes.modalOverlay}
        variants={OVERLAY_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
      >
        <motion.div
          className={classes.modalBox}
          variants={BOX_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 480, width: '100%' }}
        >
          <div className={classes.modalHeader}>
            <h3>{isEdit ? 'Edit Campaign' : 'Add Campaign'}</h3>
            <button type="button" className={classes.modalCloseBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <p className={classes.modalSub}>
            {isEdit
              ? 'Update the label, buffer, or price. Changes take effect immediately across all pages.'
              : 'Create a new campaign. The Internal ID cannot be changed after creation.'}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className={classes.modalLabel}>
                <Hash size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Internal ID
              </label>
              <input
                className={classes.input}
                type="text"
                placeholder="e.g. fe_inbounds_3"
                value={form.id}
                onChange={set('id')}
                disabled={isEdit}
                required
                pattern="^[a-z0-9_]+$"
                title="Lowercase letters, numbers, and underscores only"
                style={isEdit ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              />
              {!isEdit && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Lowercase letters, numbers, underscores only. Cannot be changed after creation.
                </p>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className={classes.modalLabel}>
                <Tag size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Display Label
              </label>
              <input
                className={classes.input}
                type="text"
                placeholder="e.g. FE Inbounds (New)"
                value={form.label}
                onChange={set('label')}
                required
                maxLength={80}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <div>
                <label className={classes.modalLabel}>
                  <Clock size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Buffer (seconds)
                </label>
                <input
                  className={classes.input}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 90"
                  value={form.buffer}
                  onChange={set('buffer')}
                  required
                />
              </div>
              <div>
                <label className={classes.modalLabel}>
                  <DollarSign size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  Price ($)
                </label>
                <input
                  className={classes.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 45.00"
                  value={form.price}
                  onChange={set('price')}
                  required
                />
              </div>
            </div>

            <div className={classes.modalActions}>
              <button
                type="button"
                className={classes.modalCancelBtn}
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={classes.primaryBtn}
                disabled={saving}
              >
                <Save size={15} style={{ marginRight: 6 }} />
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

CampaignEditorModal.propTypes = {
  campaign: PropTypes.shape({
    id: PropTypes.string,
    label: PropTypes.string,
    buffer: PropTypes.number,
    price: PropTypes.number,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
};
