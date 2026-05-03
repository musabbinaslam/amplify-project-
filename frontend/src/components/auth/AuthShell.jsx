/* eslint-disable react/prop-types -- internal shell; children + wide are stable call sites */
import { motion, useReducedMotion } from 'framer-motion';
import classes from './AuthShell.module.css';

export default function AuthShell({ children, wide = false }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={classes.page}>
      <div className={classes.gridOverlay} aria-hidden />
      <div className={classes.aurora} aria-hidden />
      <div className={classes.inner}>
        <motion.div
          className={`${classes.card} ${wide ? classes.cardWide : ''}`}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.42,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className={classes.cardBody}>{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
