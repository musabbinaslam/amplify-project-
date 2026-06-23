/* eslint-disable react/prop-types -- internal shell; brand + children are stable call sites */
import { Sun, Moon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useUIStore } from '../../store/uiStore';
import classes from './AuthShell.module.css';

export default function AuthShell({ brand, children }) {
  const reduceMotion = useReducedMotion();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  return (
    <div className={`appAmbient ${classes.authAmbient}`}>
      <div className={classes.page}>
        <div className={classes.gridOverlay} aria-hidden />
        <button
          type="button"
          className={classes.themeToggle}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className={classes.split}>
          <aside className={classes.brandColumn}>{brand}</aside>
          <motion.div
            className={`glass ${classes.formPanel}`}
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.42,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
