import React from 'react';
import classes from './PageLoader.module.css';

const PageLoader = ({ fullScreen = false }) => (
  <div className={`${classes.loader} ${fullScreen ? classes.fullScreen : ''}`}>
    <div className={classes.content}>
      <div className={classes.logoWrapper}>
        <img
          src="/logo.png"
          alt="Callsflow logo"
          className={classes.logoImg}
          loading="eager"
          decoding="async"
        />
      </div>
      <div className={classes.barTrack}>
        <div className={classes.barFill} />
      </div>
    </div>
  </div>
);

export default PageLoader;
