import classes from './PageLoader.module.css';

const PageLoader = ({ fullScreen = false, message }) => (
  <div
    className={`${classes.loader} ${fullScreen ? classes.fullScreen : ''}`}
    role="status"
    aria-live="polite"
    aria-label={message || 'Loading'}
  >
    {fullScreen && <div className={classes.ambient} aria-hidden="true" />}
    <div className={classes.stage}>
      <div className={classes.mark}>
        <img
          src="/logo.png"
          alt=""
          className={classes.markImg}
          width={32}
          height={32}
          loading="eager"
          decoding="async"
        />
      </div>
      <p className={classes.wordmark}>CALLSFLOW</p>
      <p className={classes.status}>{message || 'Preparing your workspace'}</p>
      <div className={classes.rail} aria-hidden="true">
        <div className={classes.railFill} />
      </div>
    </div>
  </div>
);

export default PageLoader;
