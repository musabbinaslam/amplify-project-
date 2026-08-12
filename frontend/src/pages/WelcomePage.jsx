import { Play, Clock } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './WelcomePage.module.css';

const TUTORIAL_EMBED_URL = 'https://drive.google.com/file/d/1eTyuk6sAm6XYhC2VhMoJWOwUoqTnHTye/preview';

const WelcomePage = () => {
  const user = useAuthStore((s) => s.user);
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <div className={classes.contentColumn}>
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

        {/* Shift hours banner */}
        <motion.div className={`glass ${classes.hoursCard}`} variants={presets.child}>
          <span className={classes.hoursIcon}><Clock size={16} /></span>
          <div className={classes.hoursText}>
            <span className={classes.hoursLabel}>Call Hours</span>
            <span className={classes.hoursValue}>Monday – Saturday &nbsp;·&nbsp; 9:00 AM – 7:00 PM EST</span>
          </div>
          <span className={classes.hoursBadge}>Shift Hours</span>
        </motion.div>

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
