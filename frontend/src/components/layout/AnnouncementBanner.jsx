import React from 'react';
import classes from './AnnouncementBanner.module.css';

const AnnouncementBanner = () => {
  return (
    <div className={classes.banner}>
      <span className={classes.text}>🎮 Join our brand new Discord community!</span>
      <button className={classes.button}>Join Now</button>
      <button className={classes.closeButton}>&times;</button>
    </div>
  );
};

export default AnnouncementBanner;
