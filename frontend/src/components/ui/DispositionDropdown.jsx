import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../../services/apiClient';
import toast from 'react-hot-toast';
import classes from './DispositionDropdown.module.css';

// ─── Disposition config ────────────────────────────────────────────────────────
export const DISPOSITION_OPTIONS = [
  { id: 'not_interested', label: 'Not Interested', colorClass: 'red' },
  { id: 'callback',       label: 'Call Back',       colorClass: 'yellow' },
  { id: 'busy',           label: 'Busy',             colorClass: 'red' },
  { id: 'policy_closed',  label: 'Policy Closed',    colorClass: 'brand' },
  { id: 'dead_air',       label: 'Dead Air',         colorClass: 'muted' },
  { id: 'sold',           label: 'Sold',             colorClass: 'brand' },
];

const dropdownVariants = {
  hidden:  { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, scale: 0.95, y: -4,  transition: { duration: 0.1,  ease: [0.4, 0, 1, 1] } },
};

export function getDispositionLabel(disp) {
  return DISPOSITION_OPTIONS.find((o) => o.id === disp)?.label ?? '—';
}

export function getDispositionColorClass(disp, isBillable) {
  if (isBillable) return 'brand';
  return DISPOSITION_OPTIONS.find((o) => o.id === disp)?.colorClass ?? 'muted';
}

// ─── Portal menu – fixed position to escape table/card clipping ───────────────
function DropdownPortal({ triggerEl, current, onSelect, onMouseDownOutside }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const menuH = 240;
    const menuW = 168;
    const margin = 8;

    let top  = rect.bottom + 6;
    let left = rect.left;

    // Flip upward when near viewport bottom
    if (rect.bottom + menuH > window.innerHeight - margin) {
      top = rect.top - menuH - 6;
    }
    // Don't overflow right edge
    if (left + menuW > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - menuW - margin);
    }

    setPos({ top, left });
  }, [triggerEl]);

  return createPortal(
    <AnimatePresence>
      <motion.ul
        key="disp-portal"
        className={classes.menuPortal}
        style={{ top: pos.top, left: pos.left }}
        role="listbox"
        aria-label="Select disposition"
        variants={dropdownVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        // Stop mousedown from bubbling to the document outside-click listener.
        // This is the classic pattern: document listens in bubbling, menu stops bubbling.
        onMouseDown={(e) => e.stopPropagation()}
      >
        {DISPOSITION_OPTIONS.map((opt) => (
          <li
            key={opt.id}
            role="option"
            aria-selected={opt.id === current}
            className={`${classes.menuItem} ${opt.id === current ? classes.menuItemActive : ''} ${classes[`menuItem_${opt.colorClass}`]}`}
            // Use mousedown so selection fires before blur/close events
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent focus loss from trigger button
              onSelect(opt.id);
            }}
          >
            <span className={`${classes.menuDot} ${classes[`dot_${opt.colorClass}`]}`} aria-hidden />
            {opt.label}
          </li>
        ))}
      </motion.ul>
    </AnimatePresence>,
    document.body,
  );
}

/**
 * DispositionDropdown
 *
 * Props:
 *   logId        {string}   – Firestore / API log ID
 *   disposition  {string}   – current disposition value
 *   isBillable   {boolean}  – if true, badge is locked to "Sold" (not editable)
 *   onUpdate     {fn}       – called with (logId, newDisposition) after successful PATCH
 *   size         {'sm'|'md'}
 *   readOnly     {boolean}
 */
const DispositionDropdown = ({
  logId,
  disposition,
  isBillable = false,
  onUpdate,
  size = 'md',
  readOnly = false,
}) => {
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [optimistic, setOptimistic] = useState(disposition);
  const triggerRef = useRef(null);

  // Sync external changes (polling refresh) when not mid-save
  useEffect(() => {
    if (!saving) setOptimistic(disposition);
  }, [disposition, saving]);

  // Outside-click: listen on document in BUBBLING phase.
  // The portal menu stops its own mousedown from bubbling, so this only fires
  // for clicks that are genuinely outside both the trigger and the menu.
  useEffect(() => {
    if (!open) return undefined;

    const onMouseDown = (e) => {
      // If click is on/inside the trigger button, let the button's onClick handle it
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    // Bubbling (no capture flag) — fires AFTER element handlers
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = useCallback(async (newDisp) => {
    setOpen(false);
    if (newDisp === optimistic) return;
    const prev = optimistic;
    setOptimistic(newDisp); // optimistic update
    setSaving(true);
    try {
      await apiFetch(`/api/voice/logs/${encodeURIComponent(logId)}/disposition`, {
        method: 'PATCH',
        body: { disposition: newDisp },
      });
      onUpdate?.(logId, newDisp);
      toast.success('Disposition updated');
    } catch (err) {
      setOptimistic(prev); // rollback
      toast.error(err?.message || 'Failed to update disposition');
    } finally {
      setSaving(false);
    }
  }, [logId, optimistic, onUpdate]);

  const colorClass = getDispositionColorClass(optimistic, isBillable);
  const label      = isBillable ? 'Sold' : getDispositionLabel(optimistic);
  const isLocked   = readOnly || isBillable;

  const pillCls = [
    classes.pill,
    classes[`pill_${colorClass}`],
    size === 'sm' ? classes.pillSm : '',
    !isLocked ? classes.pillClickable : '',
  ].filter(Boolean).join(' ');

  if (isLocked) {
    return (
      <span className={pillCls} aria-label={`Disposition: ${label}`}>
        {saving && <Loader2 size={10} className={classes.spinner} />}
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={pillCls}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Disposition: ${label}. Click to change`}
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
      >
        {saving ? <Loader2 size={10} className={classes.spinner} /> : null}
        <span>{label}</span>
        <ChevronDown
          size={11}
          className={`${classes.chevron} ${open ? classes.chevronOpen : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <DropdownPortal
          triggerEl={triggerRef.current}
          current={optimistic}
          onSelect={handleSelect}
        />
      )}
    </>
  );
};

export default DispositionDropdown;
