import { useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import classes from './CardTilt.module.css';

export default function CardTilt({
  children,
  className = '',
  cardClassName = '',
  maxTilt = 12,
  showGlare = true,
}) {
  const wrapRef = useRef(null);
  const cardRef = useRef(null);

  const reset = useCallback(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    wrap.classList.remove(classes.isHover);
    card.classList.remove(classes.isTilting);
    card.style.setProperty('--tilt-rx', '0deg');
    card.style.setProperty('--tilt-ry', '0deg');
  }, []);

  const handlePointerMove = useCallback((e) => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    // Check reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    wrap.classList.add(classes.isHover);
    card.classList.add(classes.isTilting);

    const ry = ((px - 0.5) * maxTilt).toFixed(2);
    const rx = ((0.5 - py) * maxTilt).toFixed(2);
    const gx = (px * 100).toFixed(1);
    const gy = (py * 100).toFixed(1);

    card.style.setProperty('--tilt-ry', `${ry}deg`);
    card.style.setProperty('--tilt-rx', `${rx}deg`);
    card.style.setProperty('--tilt-gx', `${gx}%`);
    card.style.setProperty('--tilt-gy', `${gy}%`);
  }, [maxTilt]);

  const handlePointerDown = useCallback((e) => {
    if (e.pointerType !== 'mouse' && wrapRef.current) {
      try {
        wrapRef.current.setPointerCapture(e.pointerId);
      } catch {
        // safe fallback
      }
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`${classes.tiltWrap} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={reset}
      onPointerCancel={reset}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') reset();
      }}
    >
      <div ref={cardRef} className={`${classes.tiltCard} ${cardClassName}`}>
        {children}
        {showGlare && <div className={classes.tiltGlare} aria-hidden="true" />}
      </div>
    </div>
  );
}

CardTilt.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  cardClassName: PropTypes.string,
  maxTilt: PropTypes.number,
  showGlare: PropTypes.bool,
};
