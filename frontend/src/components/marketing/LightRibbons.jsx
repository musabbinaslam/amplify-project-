/* eslint-disable react/prop-types -- decorative background, className only */
import { useId } from 'react';
import classes from './LightRibbons.module.css';

/*
 * Decorative sweeping light strands used behind the marketing hero and the
 * auth showcase. Colours come from the brand tokens, so the ribbons follow
 * the user's accent and the light/dark theme automatically.
 */
const curve = (i) => `M-80 ${760 + i * 7} C380 ${640 + i * 5} 820 ${300 - i * 2} 1520 ${80 + i * 9}`;

const STRANDS = Array.from({ length: 18 }, (_, i) => ({
  d: curve(i),
  opacity: Number((0.12 + 0.5 * (1 - Math.abs(i - 8.5) / 8.5)).toFixed(2)),
}));

const PULSES = [2, 5, 8, 10, 13, 16].map((i, j) => ({
  d: curve(i),
  duration: `${(7 + ((j * 1.7) % 5)).toFixed(1)}s`,
  delay: `-${(j * 1.3).toFixed(1)}s`,
}));

export default function LightRibbons({ className = '' }) {
  const gradientId = `cf-ribbon-${useId().replace(/:/g, '')}`;
  const stroke = `url(#${gradientId})`;

  return (
    <svg
      className={`${classes.ribbon} ${className}`}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--brand)', stopOpacity: 0 }} />
          <stop offset="0.38" style={{ stopColor: 'var(--brand)', stopOpacity: 0.95 }} />
          <stop offset="0.62" style={{ stopColor: 'var(--ribbon-mid)', stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: 'var(--brand)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <g className={classes.drift}>
        <path d="M-80 820 C380 683 820 283 1520 157" fill="none" stroke={stroke} strokeWidth="70" className={classes.glow} />
        {STRANDS.map((s) => (
          <path key={s.d} d={s.d} fill="none" stroke={stroke} strokeWidth="1.2" opacity={s.opacity} />
        ))}
        {PULSES.map((p) => (
          <path
            key={`p-${p.d}`}
            d={p.d}
            pathLength="100"
            fill="none"
            className={classes.pulse}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="9 91"
            style={{ animationDuration: p.duration, animationDelay: p.delay }}
          />
        ))}
      </g>
    </svg>
  );
}
