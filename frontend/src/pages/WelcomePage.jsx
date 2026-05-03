import React from 'react';
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './WelcomePage.module.css';

const WelcomePage = () => {
  const user = useAuthStore((s) => s.user);
  const presets = useSubtlePageMotion();

  return (
    <motion.div
      className={classes.welcomePage}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={presets.child}>
        <h1 className={classes.title}>Welcome, {user?.name || 'Agent'}! 👋</h1>
        <p className={classes.subtitle}>Get started by watching our platform tutorial below.</p>
      </motion.div>

      <motion.div className={classes.videoContainer} variants={presets.child}>
        <div className={classes.videoHeader}>
          <Play size={24} className={classes.playIcon} />
          <div>
            <h2>How to Use CallsFlow</h2>
            <p>Watch this quick video to learn how to take calls, earn commissions, and maximize your success.</p>
          </div>
        </div>
        
        <div className={classes.videoPlayer}>
           <div className={classes.playLayer}>
              <div className={classes.playBubble}>
                 <Play size={32} fill="white" color="white" />
              </div>
           </div>
           {/* Mock thumbnail for UI */}
           <img src="https://placehold.co/800x450/0a0f1e/1e2d45?text=Video+Player" alt="Video thumbnail" className={classes.thumbnail} />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WelcomePage;
