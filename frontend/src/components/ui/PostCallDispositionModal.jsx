import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, PhoneOff, XCircle, Clock, Loader2 } from 'lucide-react';
import useDialerStore from '../../store/useDialerStore';
import { setDisposition } from '../../services/dispositionService';
import classes from './PostCallDispositionModal.module.css';

const OPTIONS = [
  { value: 'sold', label: 'Sold', icon: CheckCircle2, variant: 'sold' },
  { value: 'callback', label: 'Callback', icon: Clock, variant: 'warn' },
  { value: 'not_interested', label: 'Not Interested', icon: XCircle, variant: 'danger' },
  { value: 'no_answer', label: 'No Answer', icon: PhoneOff, variant: 'neutral' },
];

function formatDuration(sec) {
  const s = Math.max(0, parseInt(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Controlled dialog for setting a post-call disposition.
 * Works in two modes:
 *  - Global mode (default): reads pendingDisposition from the dialer store after calls end.
 *  - Manual mode (override): pass `override` + `onClose` to open it for historical calls
 *    from the Call Logs page.
 */
const PostCallDispositionModal = ({ override = null, onClose = null }) => {
  const pending = useDialerStore((s) => s.pendingDisposition);
  const clearPending = useDialerStore((s) => s.clearPendingDisposition);

  const meta = override || pending;
  const isOpen = Boolean(meta);

  const [selected, setSelected] = useState(null);
  const [saleAmount, setSaleAmount] = useState('');
  const [carrier, setCarrier] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setSaleAmount('');
      setCarrier('');
      setNotes('');
      setFormError('');
      setSaving(false);
    }
  }, [isOpen, meta?.callSid]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const saleAmountNum = useMemo(() => {
    const n = Number(saleAmount);
    return Number.isFinite(n) ? n : NaN;
  }, [saleAmount]);

  const canSave = useMemo(() => {
    if (!selected) return false;
    if (selected === 'sold') {
      if (!Number.isFinite(saleAmountNum) || saleAmountNum < 0) return false;
    }
    return true;
  }, [selected, saleAmountNum]);

  const close = () => {
    if (override) {
      onClose?.();
    } else {
      clearPending();
    }
  };

  const handleSkip = () => {
    close();
  };

  const handleSave = async () => {
    if (!canSave || !meta?.callSid) return;
    setFormError('');
    setSaving(true);
    try {
      const payload = { disposition: selected };
      if (selected === 'sold') {
        payload.saleAmount = saleAmountNum;
        if (carrier.trim()) payload.carrier = carrier.trim();
      }
      if (notes.trim()) payload.notes = notes.trim();
      await setDisposition(meta.callSid, payload);
      toast.success(selected === 'sold' ? 'Sale recorded' : 'Disposition saved');
      close();
    } catch (err) {
      const msg = err?.message || 'Failed to save disposition';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const callerId = meta?.callerId || meta?.from || null;
  const durationSec = meta?.durationSec != null ? meta.durationSec : meta?.duration;
  const campaign = meta?.campaignLabel || meta?.campaign || null;

  return (
    <div className={classes.overlay} role="dialog" aria-modal="true" aria-labelledby="dispositionTitle">
      <div className={classes.modal}>
        <div className={classes.header}>
          <div className={classes.titleBlock}>
            <h3 id="dispositionTitle">How did that call go?</h3>
            <p>Log the outcome so your dashboard stays accurate.</p>
          </div>
          <button type="button" className={classes.closeBtn} onClick={handleSkip} aria-label="Skip">
            &times;
          </button>
        </div>

        <div className={classes.meta}>
          {callerId && (
            <span><strong>Caller:</strong> {callerId}</span>
          )}
          {durationSec != null && (
            <span><strong>Duration:</strong> {formatDuration(durationSec)}</span>
          )}
          {campaign && (
            <span><strong>Campaign:</strong> {campaign}</span>
          )}
        </div>

        <div className={classes.body}>
          <label className={classes.label}>Disposition</label>
          <div className={classes.optionGrid}>
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selected === opt.value;
              const variantClass = classes[opt.variant] || '';
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`${classes.optionBtn} ${variantClass} ${isSelected ? classes.selected : ''}`}
                  onClick={() => setSelected(opt.value)}
                  disabled={saving}
                >
                  <Icon size={18} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {selected === 'sold' && (
            <div className={classes.saleDetails}>
              <div className={classes.field}>
                <label>Policy AP (required)</label>
                <div className={classes.apField}>
                  <span className={classes.apPrefix}>$</span>
                  <input
                    className={classes.apInput}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    autoFocus
                    disabled={saving}
                  />
                </div>
                {saleAmount !== '' && (!Number.isFinite(saleAmountNum) || saleAmountNum < 0) && (
                  <span className={classes.errorText}>Enter a non-negative number.</span>
                )}
              </div>
              <div className={classes.field}>
                <label>Carrier (optional)</label>
                <input
                  className={classes.input}
                  type="text"
                  maxLength={64}
                  placeholder="e.g. Mutual of Omaha"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          )}

          <div className={classes.field} style={{ marginTop: 14 }}>
            <label>Notes (optional)</label>
            <textarea
              className={classes.textarea}
              maxLength={500}
              placeholder="Anything worth remembering about this call…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </div>

          {formError && <div className={classes.errorText}>{formError}</div>}
        </div>

        <div className={classes.footer}>
          <button type="button" className={classes.skipBtn} onClick={handleSkip} disabled={saving}>
            Skip
          </button>
          <button
            type="button"
            className={classes.saveBtn}
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? <><Loader2 size={16} className={classes.spinner} /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostCallDispositionModal;
