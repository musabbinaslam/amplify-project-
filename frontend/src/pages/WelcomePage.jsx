import React from 'react';
import { Play } from 'lucide-react';
import useAuthStore from '../store/authStore';
import classes from './WelcomePage.module.css';

const WelcomePage = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className={classes.welcomePage}>
      <h1 className={classes.title}>Welcome, {user?.name || 'Agent'}! 👋</h1>
      <p className={classes.subtitle}>Get started by watching our platform tutorial below.</p>
      
      <div className={classes.videoContainer}>
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
      </div>
    </div>
  );
};

export default WelcomePage;
