/* eslint-disable react/prop-types -- internal shell; brand + children are stable call sites */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Sun, Moon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useUIStore } from '../../store/uiStore';
import CallDeskPreview from '../marketing/CallDeskPreview';
import LightRibbons from '../marketing/LightRibbons';
import classes from './AuthShell.module.css';

const SHOWCASE_POINTS = ['Take calls in your browser', 'Priced up front', 'Every call tracked'];

export default function AuthShell({ brand, children }) {
  const reduceMotion = useReducedMotion();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const rootRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Cursor spotlight + gentle tilt of the call-desk preview.
  const handlePointerMove = (e) => {
    if (e.pointerType === 'touch') return;
    const el = rootRef.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${clientX}px`);
      el.style.setProperty('--my', `${clientY}px`);
      el.style.setProperty('--px', (clientX / window.innerWidth - 0.5).toFixed(3));
      el.style.setProperty('--py', (clientY / window.innerHeight - 0.5).toFixed(3));
    });
  };

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <div ref={rootRef} className={`appAmbient ${classes.authAmbient}`} onPointerMove={handlePointerMove}>
      <span className={classes.spotlight} aria-hidden />
      <div className={classes.page}>
        <LightRibbons />
        <div className={classes.gridOverlay} aria-hidden />

        <header className={classes.topBar}>
          <Link to="/" className={classes.logo}>
            <img src="/logo.png" alt="Callsflow logo" className={classes.logoImg} loading="eager" decoding="async" />
            <span className={classes.logoText}>CALLSFLOW</span>
          </Link>
          <div className={classes.topActions}>
            <Link to="/" className={classes.backLink}>
              <ArrowLeft size={16} aria-hidden />
              <span>Back to site</span>
            </Link>
            <button
              type="button"
              className={classes.themeToggle}
              onClick={toggleTheme}
              title={themeLabel}
              aria-label={themeLabel}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <div className={classes.split}>
          <aside className={classes.showcase} aria-label="CallsFlow in action">
            <CallDeskPreview className={classes.preview} />
            <div className={classes.showcaseCopy}>
              <h2>Live, exclusive inbound calls, routed to your license map.</h2>
              <ul>
                {SHOWCASE_POINTS.map((p) => (
                  <li key={p}><Check size={16} strokeWidth={2.6} aria-hidden /> {p}</li>
                ))}
              </ul>
            </div>
          </aside>

          <motion.div
            className={`glass ${classes.formPanel}`}
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className={classes.brand}>{brand}</div>
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
