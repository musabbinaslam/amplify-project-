import { Play, Clock, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import AgencyStatusGate from '../components/agency/AgencyStatusGate';
import PumpkinLogo from '../components/ui/PumpkinLogo';
import { HALLOWEEN_MODE } from '../config/seasonalTheme';
import { isAgencyReviewLockdown } from '../utils/agencyGate';
import classes from './WelcomePage.module.css';

const TUTORIAL_EMBED_URL = 'https://drive.google.com/file/d/1eTyuk6sAm6XYhC2VhMoJWOwUoqTnHTye/preview';

const WelcomePage = () => {
  const user = useAuthStore((s) => s.user);
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();

  if (isAgencyReviewLockdown(user)) {
    return <AgencyStatusGate />;
  }

  return (
    <motion.div
      className={`${classes.page} ${HALLOWEEN_MODE ? classes.halloweenPage : ''}`}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <div className={classes.contentColumn}>
        {HALLOWEEN_MODE ? (
          /* ── Halloween Hero Banner ── */
          <motion.div className={`glass ${classes.heroBanner}`} variants={presets.child}>
            <svg className={classes.cobwebTopRight} viewBox="0 0 140 140" fill="none" aria-hidden="true">
              <path d="M140 0 L0 28 M140 0 L18 76 M140 0 L58 118 M140 0 L108 140" stroke="currentColor" strokeWidth="1" opacity="0.28" />
              <path d="M104 7 Q98 22 92 29 Q83 36 74 39" stroke="currentColor" strokeWidth="1" opacity="0.25" />
              <path d="M72 14 Q62 39 46 54 Q32 64 16 69" stroke="currentColor" strokeWidth="1" opacity="0.22" />
              <path d="M36 21 Q24 58 2 80" stroke="currentColor" strokeWidth="1" opacity="0.18" />
            </svg>

            <div className={classes.moonScene} aria-hidden="true">
              <div className={classes.harvestMoon} />
              <svg className={classes.batsSvg} viewBox="0 0 220 90" fill="none">
                <path
                  className={classes.batOne}
                  d="M42 38 C35 28, 22 29, 14 37 C22 36, 27 39, 31 44 C35 41, 39 41, 42 43 C45 41, 49 41, 53 44 C57 39, 62 36, 70 37 C62 29, 49 28, 42 38 Z"
                  fill="#ffb35c"
                  opacity="0.55"
                />
                <path
                  className={classes.batTwo}
                  d="M128 24 C123 17, 114 18, 108 24 C114 23, 118 25, 120 29 C123 27, 126 27, 128 28 C130 27, 133 27, 136 29 C138 25, 142 23, 148 24 C142 18, 133 17, 128 24 Z"
                  fill="#ff9442"
                  opacity="0.45"
                />
                <path
                  className={classes.batThree}
                  d="M178 52 C174 47, 167 48, 163 52 C167 51, 170 53, 172 56 C174 54, 176 54, 178 55 C180 54, 182 54, 184 56 C186 53, 189 51, 193 52 C189 48, 182 47, 178 52 Z"
                  fill="#ffd28a"
                  opacity="0.38"
                />
              </svg>
            </div>

            <div className={classes.heroContent}>
              <div className={classes.heroCopy}>
                <span className={classes.halloweenPill}>
                  <Sparkles size={12} />
                  HALLOWEEN EDITION &nbsp;·&nbsp; NO GHOST LEADS
                </span>
                <h1 className={classes.title}>
                  Welcome, <span className={classes.nameHighlight}>{user?.name || 'Agent'}</span>!{' '}
                  <span
                    className={`${classes.wave} ${reduceMotion ? classes.waveReduced : ''}`}
                    role="img"
                    aria-label="pumpkin"
                  >
                    🎃
                  </span>
                </h1>
                <p className={classes.subtitle}>
                  No cold graveyards or recycled lists—just live inbound callers ready to close. Watch our platform walkthrough below to get started.
                </p>
              </div>

              <div className={classes.heroEmblem} aria-hidden="true">
                <PumpkinLogo className={classes.heroPumpkin} />
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── Standard Hero ── */
          <motion.div className={classes.hero} variants={presets.child}>
            <h1 className={classes.title}>
              Welcome, {user?.name || 'Agent'}!{' '}
              <span
                className={`${classes.wave} ${reduceMotion ? classes.waveReduced : ''}`}
                role="img"
                aria-label="waving hand"
              >
                👋
              </span>
            </h1>
            <p className={classes.subtitle}>Get started by watching our platform tutorial below.</p>
          </motion.div>
        )}

        {/* ── Shift hours banner ── */}
        <motion.div className={`glass ${classes.hoursCard}`} variants={presets.child}>
          <span className={classes.hoursIcon}><Clock size={16} /></span>
          <div className={classes.hoursText}>
            <span className={classes.hoursLabel}>Call Hours</span>
            <span className={classes.hoursValue}>Monday – Saturday &nbsp;·&nbsp; 9:00 AM – 7:00 PM EST</span>
          </div>
          <span className={classes.hoursBadge}>{HALLOWEEN_MODE ? '🎃 Shift Hours' : 'Shift Hours'}</span>
        </motion.div>

        {/* ── Video tutorial card ── */}
        <motion.div variants={presets.child}>
          <div className={`glass ${classes.videoCard}`}>
            <div className={classes.cardHeader}>
              <div className={classes.iconBox} aria-hidden="true">
                <Play size={20} />
              </div>
              <div className={classes.cardHeaderText}>
                <h2>How to Use CallsFlow</h2>
                <p>
                  Watch this quick video to learn how to take calls, earn commissions, and maximize your success.
                </p>
              </div>
            </div>

            <div className={classes.cardDivider} />

            <div className={classes.videoShell}>
              <div className={classes.videoPlayer}>
                <iframe
                  src={TUTORIAL_EMBED_URL}
                  className={classes.videoFrame}
                  allow="autoplay"
                  title="How to Use CallsFlow"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default WelcomePage;
