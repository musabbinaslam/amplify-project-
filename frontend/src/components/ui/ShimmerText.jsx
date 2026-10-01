import PropTypes from 'prop-types';
import classes from './ShimmerText.module.css';

function extractText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
}

export default function ShimmerText({
  text,
  children,
  className = '',
  as: Component = 'span',
  variant = 'default',
}) {
  const content = text ?? children ?? '';
  const textString = typeof text === 'string' ? text : extractText(content);

  const variantClass = variant === 'brand'
    ? classes.variantBrand
    : variant === 'accent'
      ? classes.variantAccent
      : '';

  return (
    <Component
      className={`${classes.shimmerText} ${variantClass} ${className}`}
      data-text={textString || undefined}
    >
      {content}
    </Component>
  );
}

ShimmerText.propTypes = {
  text: PropTypes.string,
  children: PropTypes.node,
  className: PropTypes.string,
  as: PropTypes.elementType,
  variant: PropTypes.oneOf(['default', 'brand', 'accent']),
};
