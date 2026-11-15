import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './NotFoundPage.module.css';

export default function NotFoundPage() {
  const presets = useSubtlePageMotion();

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={`glass ${classes.card}`} variants={presets.child}>
        <p className={classes.code}>404</p>
        <h1>Page not found</h1>
        <p className={classes.copy}>
          This route is not in the app. Head back to Welcome or take calls.
        </p>
        <div className={classes.actions}>
          <Link to="/app" className={classes.primary}>Go to Welcome</Link>
          <Link to="/app/take-calls" className={classes.ghost}>Take Calls</Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
