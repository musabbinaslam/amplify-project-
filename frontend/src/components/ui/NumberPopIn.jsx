import { useMemo } from 'react';
import classes from './NumberPopIn.module.css';

/* eslint-disable react/prop-types */
/**
 * NumberPopIn - Transitions.dev "Number pop-in" transition
 *
 * Iterated for Callsflow / Amplify:
 * - Tabular numbers to avoid horizontal jiggle on numeric updates
 * - Smooth decimal cascade (.00) with subtle blur and spring overshoot
 * - Automatically re-animates when values update or reload
 * - Supports currency, percentage, commas, and plain integers
 * - Built-in reduced motion accessibility guard
 */
export default function NumberPopIn({
  value,
  prefix = '',
  suffix = '',
  className = '',
  style,
  refreshKey = 0,
}) {
  const isPresent = value !== null && value !== undefined && value !== '';
  const rawString = isPresent ? `${prefix}${value}${suffix}` : '';

  // Analyze characters and assign intelligent stagger tokens
  const tokens = useMemo(() => {
    if (!isPresent) return [];
    const chars = rawString.split('');
    const len = chars.length;
    if (len === 0) return [];

    const dotIndex = chars.lastIndexOf('.');
    const hasDecimal = dotIndex !== -1 && dotIndex < len - 1;

    return chars.map((char, index) => {
      let stagger = 0;

      if (hasDecimal) {
        const decimalsCount = len - 1 - dotIndex;
        if (decimalsCount >= 2) {
          // E.g. $0.00 or 2500.00 -> cents stagger 1 and 2
          if (index === dotIndex + 1) stagger = 1;
          else if (index === dotIndex + 2) stagger = 2;
          else if (index > dotIndex + 2) stagger = 3;
        } else {
          // E.g. 12.3 -> dot and single decimal stagger
          if (index === dotIndex) stagger = 1;
          else if (index === dotIndex + 1) stagger = 2;
        }
      } else {
        // Non-decimal values:
        // len > 2: e.g. 100 or 1,280 -> last 2 digits stagger (stagger 1, 2)
        // len == 2: e.g. 0% or 42 -> second character staggers (stagger 1)
        // len == 1: e.g. 0 -> stagger 0
        if (len > 2) {
          if (index === len - 2) stagger = 1;
          else if (index === len - 1) stagger = 2;
        } else if (len === 2 && index === 1) {
          stagger = 1;
        }
      }

      return {
        char,
        stagger: stagger > 0 ? Math.min(stagger, 4) : 0,
      };
    });
  }, [rawString, isPresent]);

  if (!isPresent) return null;

  // Combined animation key to cleanly re-trigger CSS animation on value change or manual refresh
  const animKey = `${rawString}__${refreshKey}`;

  return (
    <span
      key={animKey}
      className={`${classes.digitGroup} ${className}`}
      style={style}
      aria-label={rawString}
    >
      {tokens.map((token, i) => (
        <span
          key={`${i}-${token.char}`}
          className={classes.digit}
          data-stagger={token.stagger > 0 ? String(token.stagger) : undefined}
          aria-hidden="true"
        >
          {token.char === ' ' ? '\u00A0' : token.char}
        </span>
      ))}
    </span>
  );
}
