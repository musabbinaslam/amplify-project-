import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import classes from './AdminModuleCard.module.css';

/* eslint-disable react/prop-types */
export default function AdminModuleCard({
  title,
  description,
  icon: Icon,
  route,
  category,
  badge,
  variants,
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={classes.wrap}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <Link to={route} className={`glass ${classes.card}`}>
        <div className={classes.metaRow}>
          <div className={classes.iconBox} aria-hidden="true">
            <Icon size={24} />
          </div>
          {badge != null && badge > 0 ? (
            <span className={classes.badge}>{badge}</span>
          ) : null}
        </div>
        <div className={classes.body}>
          {category ? <span className={classes.category}>{category}</span> : null}
          <h3 className={classes.title}>{title}</h3>
          <p className={classes.description}>{description}</p>
        </div>
      </Link>
    </motion.div>
  );
}
