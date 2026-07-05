import { useState, useCallback, useEffect } from 'react';
import { CircleDollarSign, RefreshCw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  listAdminCallContests,
  approveAdminCallContest,
  denyAdminCallContest,
} from '../../services/adminService';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import {
  ContestReviewCard,
  AdminActionModal,
  openContestProofUrl,
} from '../../components/admin/ContestReviewCard';
import { RecordingModal } from '../CallLogsPage';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminCallContestsPage() {
  const presets = useSubtlePageMotion();
  const [callContests, setCallContests] = useState([]);
  const [contestFilter, setContestFilter] = useState('pending');
  const [contestsLoading, setContestsLoading] = useState(false);
  const [expandedContestId, setExpandedContestId] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadCallContests = useCallback(async (status = contestFilter) => {
    setContestsLoading(true);
    try {
      const out = await listAdminCallContests(status, 50);
      setCallContests(out.contests || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load call contests');
    } finally {
      setContestsLoading(false);
    }
  }, [contestFilter]);

  useEffect(() => {
    loadCallContests('pending');
  }, [loadCallContests]);

  const openApproveContestModal = (contest) => {
    setActionNote('');
    setActionModal({
      type: 'approve_contest',
      context: {
        contest,
        agentName: contest.agentName || contest.agentId,
        amount: Number(contest.cost || 0).toFixed(2),
      },
    });
  };

  const openDenyContestModal = (contest) => {
    setActionNote('');
    setActionModal({
      type: 'deny_contest',
      context: {
        contest,
        agentName: contest.agentName || contest.agentId,
      },
    });
  };

  const submitActionModal = async () => {
    const trimmed = actionNote.trim();
    if (trimmed.length < 10) {
      toast.error('Note must be at least 10 characters');
      return;
    }
    if (!actionModal) return;

    setActionSubmitting(true);
    try {
      if (actionModal.type === 'approve_contest') {
        const { contest } = actionModal.context;
        await approveAdminCallContest(contest.id, trimmed);
        toast.success('Contest approved — wallet credited');
        setExpandedContestId(null);
        setActionModal(null);
        setActionNote('');
        setCallContests((prev) => (
          contestFilter === 'pending'
            ? prev.filter((c) => c.id !== contest.id)
            : prev.map((c) => (c.id === contest.id ? { ...c, status: 'approved' } : c))
        ));
        void loadCallContests(contestFilter);
      } else if (actionModal.type === 'deny_contest') {
        const { contest } = actionModal.context;
        await denyAdminCallContest(contest.id, trimmed);
        toast.success('Contest denied');
        setExpandedContestId(null);
        setActionModal(null);
        setActionNote('');
        setCallContests((prev) => (
          contestFilter === 'pending'
            ? prev.filter((c) => c.id !== contest.id)
            : prev.map((c) => (c.id === contest.id ? { ...c, status: 'denied', contestDenyNote: trimmed } : c))
        ));
        void loadCallContests(contestFilter);
      }
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionSubmitting(false);
    }
  };

  const closeActionModal = () => {
    if (actionSubmitting) return;
    setActionModal(null);
    setActionNote('');
  };

  return (
    <>
      <AdminPageShell
        title="Call Charge Contests"
        description="Review agent disputes, proof files, and approve or deny credits."
        icon={CircleDollarSign}
        category={ADMIN_CATEGORIES.agents}
      >
        <motion.section className={`glass ${classes.sectionCard} ${classes.contestSection}`} variants={presets.child}>
          <div className={classes.cardTopRow}>
            <h2 className={classes.cardTitle}>Call charge contests</h2>
            <div className={classes.filterRow}>
              <select
                className={classes.select}
                value={contestFilter}
                onChange={(e) => {
                  setContestFilter(e.target.value);
                  loadCallContests(e.target.value);
                }}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="denied">Denied</option>
                <option value="all">All</option>
              </select>
              <button type="button" className={classes.refreshBtn} onClick={() => loadCallContests(contestFilter)}>
                <RefreshCw size={14} className={contestsLoading ? classes.spin : ''} /> Refresh
              </button>
            </div>
          </div>
          <p className={classes.hint}>Agents contest billable calls with proof. Review and approve (credit wallet) or deny.</p>
          {contestsLoading && !callContests.length ? (
            <p className={classes.muted}>Loading contests...</p>
          ) : !callContests.length ? (
            <div className={classes.emptyPanel}>
              <FileText size={28} className={classes.emptyPanelIcon} />
              <h4>No {contestFilter === 'all' ? '' : contestFilter} contests</h4>
              <p>Pending contest reviews will appear here.</p>
            </div>
          ) : (
            <div className={classes.contestList}>
              {callContests.map((c) => (
                <ContestReviewCard
                  key={c.id}
                  contest={c}
                  expanded={expandedContestId === c.id}
                  onToggle={() => setExpandedContestId(expandedContestId === c.id ? null : c.id)}
                  onOpenProof={openContestProofUrl}
                  onPlayRecording={() => setActiveRecording({
                    recordingUrl: c.recordingUrl,
                    recordingSid: c.recordingSid || null,
                    campaign: c.campaignLabel || c.campaign,
                    campaignLabel: c.campaignLabel || c.campaign,
                    duration: c.duration,
                    createdAt: c.submittedAt || c.createdAt,
                    isBillable: c.isBillable,
                  })}
                  onApprove={() => openApproveContestModal(c)}
                  onDeny={() => openDenyContestModal(c)}
                />
              ))}
            </div>
          )}
        </motion.section>
      </AdminPageShell>

      {activeRecording && (
        <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />
      )}

      <AdminActionModal
        modal={actionModal}
        note={actionNote}
        onNoteChange={setActionNote}
        submitting={actionSubmitting}
        onClose={closeActionModal}
        onSubmit={submitActionModal}
      />
    </>
  );
}
