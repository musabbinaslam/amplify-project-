import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classes from './SuccessCheck.module.css';

export default function SuccessCheck({
  size = 16,
  color = 'currentColor',
  strokeWidth = 2.5,
  className = '',
  active = true,
  triggerKey,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    // Replay keyframes cleanly by forcing reflow
    el.setAttribute('data-state', 'out');
    void el.offsetWidth;
    el.setAttribute('data-state', 'in');
  }, [active, triggerKey]);

  return (
    <span
      ref={ref}
      className={`${classes.successCheck} ${className}`}
      data-state={active ? 'in' : 'out'}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

SuccessCheck.propTypes = {
  size: PropTypes.number,
  color: PropTypes.string,
  strokeWidth: PropTypes.number,
  className: PropTypes.string,
  active: PropTypes.bool,
  triggerKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
