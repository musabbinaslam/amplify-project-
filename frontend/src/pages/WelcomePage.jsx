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
        <h1 className={classes.title}>
          Welcome, {user?.name || 'Agent'}!{' '}
          <span className={classes.wave} role="img" aria-label="waving hand">👋</span>
        </h1>
        <p className={classes.subtitle}>Get started by watching our platform tutorial below </p>
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
           <iframe 
             src="https://drive.google.com/file/d/1eTyuk6sAm6XYhC2VhMoJWOwUoqTnHTye/preview" 
             width="100%" 
             height="100%" 
             allow="autoplay" 
             style={{ border: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
             title="How to Use CallsFlow"
           ></iframe>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WelcomePage;
