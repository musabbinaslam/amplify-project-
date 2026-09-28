import { motion, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import NumberPopIn from '../ui/NumberPopIn';
import classes from './adminShared.module.css';

/* eslint-disable react/prop-types */
export default function AdminStatCard({ label, value, icon: Icon, variants, loading, wide, animate = true }) {
  const reduceMotion = useReducedMotion();
  const renderValue = () => {
    if (loading) {
      return <span className={wide ? classes.skeletonNumWide : classes.skeletonNum} />;
    }
    if (animate && (typeof value === 'number' || typeof value === 'string')) {
      return <NumberPopIn value={value} />;
    }
    return value;
  };

  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.statIconBox}>
        <Icon size={18} />
      </div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>
        {renderValue()}
      </div>
    </motion.div>
  );
}
