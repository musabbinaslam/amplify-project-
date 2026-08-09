import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import classes from './CustomSelect.module.css';

/**
 * CustomSelect — matches the Dashboard period-picker aesthetic (DESIGN.md §7.6).
 * Menu is portaled to document.body so it is not trapped under sibling .glass cards
 * (backdrop-filter / isolation stacking contexts).
 *
 * Props:
 *   options   — array of { value, label } OR plain strings
 *   value     — currently selected value
 *   onChange  — (value) => void
 *   placeholder — shown when nothing selected (optional)
 *   className — extra class for the trigger button (optional)
 *   menuAlign — 'left' | 'right' | 'top' (default 'left')
 */
const CustomSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  className = '',
  menuAlign = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selected = normalised.find((o) => o.value === value);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const style = {
      position: 'fixed',
      minWidth: `${Math.max(rect.width, 160)}px`,
      zIndex: 1200,
    };

    if (menuAlign === 'top') {
      style.left = `${rect.left}px`;
      style.bottom = `${window.innerHeight - rect.top + gap}px`;
      style.top = 'auto';
    } else if (menuAlign === 'right') {
      style.top = `${rect.bottom + gap}px`;
      style.right = `${window.innerWidth - rect.right}px`;
      style.left = 'auto';
    } else {
      style.top = `${rect.bottom + gap}px`;
      style.left = `${rect.left}px`;
    }

    setMenuStyle(style);
  }, [menuAlign]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const menu = open && menuStyle
    ? createPortal(
      <div
        ref={menuRef}
        className={`${classes.menu} ${classes.menuPortaled}`}
        style={menuStyle}
        role="listbox"
      >
        {normalised.map((o) => (
          <div
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            className={`${classes.item} ${o.value === value ? classes.activeItem : ''}`}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            {o.label}
          </div>
        ))}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={classes.wrapper}>
      <button
        ref={triggerRef}
        type="button"
        className={`${classes.trigger} ${className}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? classes.selectedLabel : classes.placeholder}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`${classes.icon} ${open ? classes.iconOpen : ''}`}
        />
      </button>
      {menu}
    </div>
  );
};

export default CustomSelect;
