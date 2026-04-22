import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import classes from './CustomSelect.module.css';

/**
 * CustomSelect — matches the Dashboard period-picker aesthetic.
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
  const ref = useRef(null);

  // Normalize options to { value, label }
  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selected = normalised.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={classes.wrapper} ref={ref}>
      <button
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

      {open && (
        <div
          className={`${classes.menu} ${menuAlign === 'right' ? classes.menuRight : menuAlign === 'top' ? classes.menuTop : classes.menuLeft}`}
          role="listbox"
        >
          {normalised.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${classes.item} ${o.value === value ? classes.activeItem : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
