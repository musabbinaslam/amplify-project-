import PropTypes from 'prop-types';
import classes from './NotificationBadge.module.css';

export default function NotificationBadge({
  count = 0,
  max = 99,
  dotOnly = false,
  className = '',
  dotClassName = '',
}) {
  const isOpen = Number(count) > 0 || (dotOnly && count !== false);
  const displayCount = Number(count) > max ? `${max}+` : count;

  return (
    <span
      className={`${classes.badgeWrap} ${className}`}
      data-open={isOpen ? 'true' : 'false'}
      aria-hidden="true"
    >
      <span className={`${classes.badgeDot} ${dotClassName}`}>
        {!dotOnly && displayCount}
      </span>
    </span>
  );
}

NotificationBadge.propTypes = {
  count: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.bool]),
  max: PropTypes.number,
  dotOnly: PropTypes.bool,
  className: PropTypes.string,
  dotClassName: PropTypes.string,
};
