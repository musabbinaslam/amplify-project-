import PropTypes from 'prop-types';
import classes from './PageSkeleton.module.css';

function Bone({ className = '' }) {
  return <span className={`${classes.bone} ${className}`} />;
}

function RankRow() {
  return (
    <div className={classes.rankRow}>
      <Bone className={classes.rank} />
      <Bone className={classes.avatar} />
      <div className={classes.lines}>
        <Bone className={classes.lineLg} />
        <Bone className={classes.lineSm} />
      </div>
      <Bone className={classes.metric} />
    </div>
  );
}

const PageSkeleton = ({ variant = 'table', rows = 6 }) => {
  if (variant === 'dashboard') {
    return (
      <div className={classes.root} aria-busy="true" aria-label="Loading">
        <div className={classes.kpiGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`glass ${classes.card}`}>
              <div className={classes.kpiTop}>
                <Bone className={classes.icon} />
                <Bone className={classes.lineSm} />
              </div>
              <Bone className={classes.kpiValue} />
              <Bone className={classes.spark} />
            </div>
          ))}
        </div>
        <div className={classes.chartGrid}>
          <div className={`glass ${classes.card} ${classes.chartLg}`}>
            <Bone className={classes.lineMd} />
            <Bone className={classes.chartArea} />
          </div>
          <div className={`glass ${classes.card} ${classes.chartSm}`}>
            <Bone className={classes.lineMd} />
            <Bone className={classes.donut} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'leaderboard') {
    return (
      <div className={classes.root} aria-busy="true" aria-label="Loading">
        <div className={classes.podium}>
          <div className={`glass ${classes.podiumCard} ${classes.podiumSide}`}>
            <Bone className={classes.avatarLg} />
            <Bone className={classes.lineMd} />
            <Bone className={classes.lineSm} />
          </div>
          <div className={`glass ${classes.podiumCard} ${classes.podiumCenter}`}>
            <Bone className={classes.avatarLg} />
            <Bone className={classes.lineMd} />
            <Bone className={classes.lineSm} />
          </div>
          <div className={`glass ${classes.podiumCard} ${classes.podiumSide}`}>
            <Bone className={classes.avatarLg} />
            <Bone className={classes.lineMd} />
            <Bone className={classes.lineSm} />
          </div>
        </div>
        <div className={`glass ${classes.list}`}>
          {Array.from({ length: rows }, (_, i) => <RankRow key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root} aria-busy="true" aria-label="Loading">
      <div className={`glass ${classes.list}`}>
        {Array.from({ length: rows }, (_, i) => <RankRow key={i} />)}
      </div>
    </div>
  );
};

PageSkeleton.propTypes = {
  variant: PropTypes.oneOf(['dashboard', 'table', 'leaderboard']),
  rows: PropTypes.number,
};

export default PageSkeleton;
