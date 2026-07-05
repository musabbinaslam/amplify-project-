import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import classes from './AdminPageShell.module.css';

/* eslint-disable react/prop-types */
export default function AdminPageShell({
  title,
  description,
  icon: Icon,
  category,
  children,
}) {
  const presets = useSubtlePageMotion();

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.topBar} variants={presets.child}>
        <Link to="/app/admin" className={classes.backLink}>
          <ArrowLeft size={16} />
          Back to Admin
        </Link>
        {category ? <span className={classes.category}>{category}</span> : null}
      </motion.div>

      <motion.div className={classes.pageHeader} variants={presets.child}>
        {Icon ? (
          <div className={classes.iconBox} aria-hidden="true">
            <Icon size={22} />
          </div>
        ) : null}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </motion.div>

      {children}
    </motion.div>
  );
}
