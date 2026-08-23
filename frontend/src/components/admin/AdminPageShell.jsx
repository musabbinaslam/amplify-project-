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
  backTo = '/app/admin',
  backLabel = 'Back to Admin',
  actions = null,
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
        <Link to={backTo} className={classes.backLink}>
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
        {category ? <span className={classes.category}>{category}</span> : null}
      </motion.div>

      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.pageHeaderMain}>
          {Icon ? (
            <div className={classes.iconBox} aria-hidden="true">
              <Icon size={22} />
            </div>
          ) : null}
          <div className={classes.pageHeaderCopy}>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className={classes.pageHeaderActions}>{actions}</div> : null}
      </motion.div>

      {children}
    </motion.div>
  );
}
