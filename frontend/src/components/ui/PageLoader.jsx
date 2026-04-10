import React from 'react';
import classes from './PageLoader.module.css';

const PageLoader = ({ fullScreen = false }) => (
  <div className={`${classes.loader} ${fullScreen ? classes.fullScreen : ''}`}>
    <div className={classes.content}>
      <div className={classes.logoWrapper}>
        <div className={classes.logoIcon}>
          <span className={classes.logoTriangle} />
        </div>
      </div>
      <div className={classes.barTrack}>
        <div className={classes.barFill} />
      </div>
    </div>
  </div>
);

export default PageLoader;
