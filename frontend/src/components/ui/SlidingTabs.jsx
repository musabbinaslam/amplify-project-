import { useState, useLayoutEffect, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import classes from './SlidingTabs.module.css';

export default function SlidingTabs({
  tabs = [],
  activeKey,
  onChange,
  className = '',
  tabClassName = '',
  ariaLabel = 'Navigation tabs',
}) {
  const containerRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef({});
  const initialSnapDone = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const positionPill = useCallback((animate = true) => {
    const activeTab = tabRefs.current[String(activeKey)];
    const pill = pillRef.current;
    if (!activeTab || !pill) return false;

    const width = activeTab.offsetWidth;
    const left = activeTab.offsetLeft;

    // If dimensions not yet laid out (0px width), do not lock in snap
    if (width === 0) return false;

    if (!animate) {
      pill.classList.add(classes.pillSnapping);
      pill.style.transform = `translateX(${left}px)`;
      pill.style.width = `${width}px`;
      void pill.offsetWidth;
      pill.classList.remove(classes.pillSnapping);
    } else {
      pill.style.transform = `translateX(${left}px)`;
      pill.style.width = `${width}px`;
    }

    setIsReady(true);
    return true;
  }, [activeKey]);

  useLayoutEffect(() => {
    const animate = initialSnapDone.current;
    const ok = positionPill(animate);
    if (ok) {
      initialSnapDone.current = true;
    } else {
      // Retry in RAF if layout was delayed by parent transitions
      const id = requestAnimationFrame(() => {
        const retryOk = positionPill(false);
        if (retryOk) initialSnapDone.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
  }, [positionPill]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      positionPill(false);
    });

    observer.observe(container);
    Object.values(tabRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [tabs, positionPill]);

  const handleTabClick = (key, e) => {
    const target = e.currentTarget;
    const pill = pillRef.current;
    if (pill && target && target.offsetWidth > 0) {
      pill.style.transform = `translateX(${target.offsetLeft}px)`;
      pill.style.width = `${target.offsetWidth}px`;
      setIsReady(true);
    }
    onChange?.(key);
  };

  return (
    <div
      ref={containerRef}
      className={`${classes.tabsContainer} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        ref={pillRef}
        className={`${classes.pill} ${isReady ? classes.pillReady : ''}`}
        aria-hidden="true"
      />
      {tabs.map((tab) => {
        const key = typeof tab === 'string' ? tab : String(tab.key ?? tab.value ?? tab.id ?? '');
        const label = typeof tab === 'string' ? tab : (tab.label ?? tab.title ?? key);
        const isSelected = String(activeKey) === key;

        return (
          <button
            key={key}
            ref={(el) => {
              if (el) tabRefs.current[key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={`${classes.tabBtn} ${isSelected ? classes.tabBtnActive : ''} ${tabClassName}`}
            onClick={(e) => handleTabClick(key, e)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

SlidingTabs.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        key: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        label: PropTypes.node,
        title: PropTypes.node,
      }),
    ])
  ).isRequired,
  activeKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  tabClassName: PropTypes.string,
  ariaLabel: PropTypes.string,
};
