import PropTypes from 'prop-types';
import classes from './IconSwap.module.css';

export default function IconSwap({
  state = 'a',
  iconA,
  iconB,
  className = '',
  ariaLabel,
}) {
  return (
    <span
      className={`${classes.iconSwap} ${className}`}
      data-state={state}
      aria-label={ariaLabel}
    >
      <span className={`${classes.icon} ${classes.iconA}`} aria-hidden={state !== 'a'}>
        {iconA}
      </span>
      <span className={`${classes.icon} ${classes.iconB}`} aria-hidden={state !== 'b'}>
        {iconB}
      </span>
    </span>
  );
}

IconSwap.propTypes = {
  state: PropTypes.oneOf(['a', 'b']).isRequired,
  iconA: PropTypes.node.isRequired,
  iconB: PropTypes.node.isRequired,
  className: PropTypes.string,
  ariaLabel: PropTypes.string,
};
