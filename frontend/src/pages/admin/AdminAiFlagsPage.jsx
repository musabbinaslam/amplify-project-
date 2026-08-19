import { Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import QaReviewQueuePanel from '../../components/admin/QaReviewQueuePanel';
import {
  listAdminQaReviews,
  confirmAdminQaReview,
  dismissAdminQaReview,
  getAdminQaPipelineStatus,
  backfillAdminQaReviews,
  reanalyzeAdminQaReview,
  reanalyzeAdminQaReviewsBatch,
} from '../../services/adminService';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminAiFlagsPage() {
  const presets = useSubtlePageMotion();

  return (
    <AdminPageShell
      title="AI Flags"
      description="Review AI-generated call flags and verify or dismiss them."
      icon={Flag}
      category={ADMIN_CATEGORIES.quality}
    >
      <motion.section className={`glass ${classes.sectionCard} ${classes.contestSection}`} variants={presets.child}>
        <QaReviewQueuePanel
          listReviews={listAdminQaReviews}
          confirmReview={confirmAdminQaReview}
          dismissReview={dismissAdminQaReview}
          fetchStatus={getAdminQaPipelineStatus}
          startBackfill={backfillAdminQaReviews}
          reanalyzeReview={reanalyzeAdminQaReview}
          reanalyzeBatch={reanalyzeAdminQaReviewsBatch}
          emptyHint="No pending flags yet. Analyze older recordings above, or wait for the next completed call."
        />
      </motion.section>
    </AdminPageShell>
  );
}
