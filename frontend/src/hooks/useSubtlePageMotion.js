import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { createSubtleStaggerPresets } from '../motion/appMotion';

/**
 * Presets for subtle in-page stagger on `/app` routes (respects prefers-reduced-motion).
 */
export function useSubtlePageMotion() {
  const reduceMotion = useReducedMotion();
  return useMemo(
    () => createSubtleStaggerPresets(reduceMotion),
    [reduceMotion],
  );
}
