/**
 * Shared Framer Motion presets for work UI: opacity-first, short durations, no bouncy springs.
 */

export const EASE_SMOOTH = [0.22, 1, 0.36, 1];

export const DURATION = {
  route: 0.22,
  enter: 0.28,
  stagger: 0.055,
  staggerTight: 0.05,
  dropdown: 0.2,
};

/**
 * Props spread onto AppShell's keyed Outlet wrapper (route changes).
 */
export function routeOutletMotion(reduceMotion) {
  if (reduceMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 3 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.route, ease: EASE_SMOOTH },
  };
}

/**
 * In-page stagger for authenticated screens: root + section child + optional grid / stats strip.
 */
export function createSubtleStaggerPresets(reduceMotion) {
  const instant = reduceMotion;
  const dur = instant ? 0 : DURATION.enter;
  const offset = instant ? 0 : 6;

  const child = {
    hidden: { opacity: instant ? 1 : 0, y: offset },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: dur, ease: EASE_SMOOTH },
    },
  };

  const root = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: instant ? 0 : DURATION.stagger,
        delayChildren: instant ? 0 : 0.04,
      },
    },
  };

  const grid = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: instant ? 0 : DURATION.staggerTight,
        delayChildren: instant ? 0 : 0.02,
      },
    },
  };

  /** Top stats row: fades with parent stagger, then staggers each stat card. */
  const statsStrip = {
    hidden: { opacity: instant ? 1 : 0, y: offset },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: dur,
        ease: EASE_SMOOTH,
        staggerChildren: instant ? 0 : DURATION.staggerTight,
        delayChildren: instant ? 0 : 0.02,
      },
    },
  };

  return { root, child, grid, statsStrip };
}

/** @deprecated Prefer createSubtleStaggerPresets — alias for Dashboard and older imports. */
export function createDashboardPresets(reduceMotion) {
  return createSubtleStaggerPresets(reduceMotion);
}

/**
 * Dropdown / popover panels: AnimatePresence + motion.div spread.
 */
export function dropdownPanelMotion(reduceMotion) {
  const t = reduceMotion
    ? { duration: 0 }
    : { duration: DURATION.dropdown, ease: EASE_SMOOTH };
  return {
    initial: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -4 },
    animate: { opacity: 1, y: 0, transition: t },
    exit: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -4, transition: t },
  };
}
