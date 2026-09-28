import PropTypes from 'prop-types';
import classes from './Accordion.module.css';

export default function AccordionItem({
  title,
  children,
  isOpen,
  onToggle,
  className = '',
  headerClassName = '',
  contentClassName = '',
}) {
  return (
    <div
      className={`${classes.accordionItem} ${className}`}
      data-open={isOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        className={`${classes.accordionHeader} ${headerClassName}`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className={classes.chevron} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6.5L8 10.5L12 6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      <div className={classes.accordionPanel}>
        <div className={classes.accordionInner}>
          <div className={`${classes.accordionContent} ${contentClassName}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

AccordionItem.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  className: PropTypes.string,
  headerClassName: PropTypes.string,
  contentClassName: PropTypes.string,
};
