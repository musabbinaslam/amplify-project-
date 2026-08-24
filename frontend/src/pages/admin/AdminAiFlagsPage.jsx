import { Flag, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  return (
    <AdminPageShell
      title="AI Flags"
      description="Auto-checks calls 10–15s past each campaign’s buffer. Confirm a flag to flag the agent."
      icon={Flag}
      category={ADMIN_CATEGORIES.quality}
      actions={(
        <Link to="/app/admin/qa-rules" className={classes.qaHeaderLink}>
          <Link2 size={14} aria-hidden="true" />
          Compliance rules
        </Link>
      )}
    >
      <QaReviewQueuePanel
        listReviews={listAdminQaReviews}
        confirmReview={confirmAdminQaReview}
        dismissReview={dismissAdminQaReview}
        fetchStatus={getAdminQaPipelineStatus}
        startBackfill={backfillAdminQaReviews}
        reanalyzeReview={reanalyzeAdminQaReview}
        reanalyzeBatch={reanalyzeAdminQaReviewsBatch}
        emptyHint="Eligible calls analyze automatically when they end."
      />
    </AdminPageShell>
  );
}
