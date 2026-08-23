import { Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import QaReviewQueuePanel from '../components/admin/QaReviewQueuePanel';
import {
  listQaReviews,
  confirmQaReview,
  dismissQaReview,
  getQaPipelineStatus,
} from '../services/qaService';
import classes from './QaAITrainingPage.module.css';

export default function QaReviewPage() {
  const presets = useSubtlePageMotion();

  return (
    <motion.section
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.header className={classes.header} variants={presets.child}>
        <div className={classes.icon}><Flag size={22} /></div>
        <div>
          <h2>AI Flags</h2>
          <p>Verify flags from eligible calls (buffer +10–15s). Confirming a violation flags the agent.</p>
        </div>
      </motion.header>

      <motion.div variants={presets.child}>
        <QaReviewQueuePanel
          listReviews={listQaReviews}
          confirmReview={confirmQaReview}
          dismissReview={dismissQaReview}
          fetchStatus={getQaPipelineStatus}
        />
      </motion.div>
    </motion.section>
  );
}
