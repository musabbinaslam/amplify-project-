import PropTypes from 'prop-types';
import classes from './PageSkeleton.module.css';

const PageSkeleton = ({ variant = 'table', rows = 8 }) => {
  if (variant === 'dashboard') {
    return (
      <div className={classes.root} aria-busy="true" aria-label="Loading">
        <div className={`${classes.row} ${classes.kpis}`}>
          {[0, 1, 2, 3].map((i) => <div key={i} className={`${classes.block} ${classes.kpi}`} />)}
        </div>
        <div className={`${classes.row} ${classes.charts}`}>
          <div className={`${classes.block} ${classes.chartLg}`} />
          <div className={`${classes.block} ${classes.chartSm}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root} aria-busy="true" aria-label="Loading">
      <div className={`${classes.block} ${classes.toolbar}`} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${classes.block} ${classes.tableRow}`} />
      ))}
    </div>
  );
};

PageSkeleton.propTypes = {
  variant: PropTypes.oneOf(['dashboard', 'table']),
  rows: PropTypes.number,
};

export default PageSkeleton;
