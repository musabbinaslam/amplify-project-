import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Flag, WalletCards, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  dismissSuspiciousAgent,
  forceChargeSuspiciousAgent,
  flagAdminAgent,
} from '../../services/adminService';
import shared from './adminShared.module.css';
import classes from './ForceChargeFlow.module.css';

/**
 * Same force-charge + insufficient-balance flag flow as Suspicious Drop Patterns.
 * Pass an agent shaped like suspicious list items: { agentId, agentName, flaggedLogs }.
 */
export function useForceChargeFlow({ onSuccess } = {}) {
  const [forceChargeModal, setForceChargeModal] = useState(null);
  const [flagModal, setFlagModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const openForceCharge = (agent) => {
    if (!agent?.agentId) return;
    setForceChargeModal({ agent });
  };

  const handleForceCharge = async () => {
    if (!forceChargeModal) return;
    const { agent } = forceChargeModal;
    const campaignId = agent.flaggedLogs?.[0]?.campaign || null;
    const callSid = agent.flaggedLogs?.[0]?.callSid || null;
    setActionLoading(true);
    try {
      const res = await forceChargeSuspiciousAgent(agent.agentId, campaignId, callSid);
      if (res.insufficientBalance) {
        setForceChargeModal(null);
        setFlagModal({ agent, shortfallCents: res.shortfallCents || 0 });
        return;
      }
      const amount = res.amountCents ? `$${(res.amountCents / 100).toFixed(2)}` : 'the penalty';
      toast.success(
        res.alreadyCharged
          ? `${agent.agentName} was already force charged ${amount}.`
          : `Force charged ${agent.agentName} ${amount}.`,
      );
      setForceChargeModal(null);
      await onSuccess?.(agent, { action: res.alreadyCharged ? 'already_force_charged' : 'force_charged', res });
    } catch (e) {
      toast.error(e.message || 'Failed to force charge');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlagAgent = async () => {
    if (!flagModal) return;
    const { agent } = flagModal;
    setActionLoading(true);
    try {
      await flagAdminAgent(
        agent.agentId,
        'Insufficient wallet balance — suspicious drop penalty could not be charged.',
      );
      await dismissSuspiciousAgent(agent.agentId);
      toast.success(`${agent.agentName} has been flagged and removed from the pool.`);
      setFlagModal(null);
      await onSuccess?.(agent, { action: 'flagged' });
    } catch (e) {
      toast.error(e.message || 'Failed to flag agent');
    } finally {
      setActionLoading(false);
    }
  };

  const forceChargeModals = (
    <>
      {forceChargeModal
        ? createPortal(
          <div className={shared.modalOverlay} onClick={() => !actionLoading && setForceChargeModal(null)}>
            <div className={`glass ${shared.modalBox}`} onClick={(e) => e.stopPropagation()}>
              <div className={shared.modalHeader}>
                <h3 className={`${classes.warnTitle} ${classes.warnTitleCharge}`}>
                  <AlertTriangle size={18} />
                  Confirm force charge
                </h3>
                <button
                  type="button"
                  className={shared.modalCloseBtn}
                  onClick={() => setForceChargeModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className={shared.modalSub}>
                Deduct one call charge from {forceChargeModal.agent.agentName} for{' '}
                {forceChargeModal.agent.flaggedLogs?.[0]?.campaignLabel || 'their flagged campaign'}.
                They will be notified and their warning will clear.
              </p>
              <div className={shared.modalActions}>
                <button
                  type="button"
                  className={shared.modalCancelBtn}
                  onClick={() => setForceChargeModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={shared.dangerBtn}
                  onClick={handleForceCharge}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Charging…' : 'Confirm charge'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      {flagModal
        ? createPortal(
          <div className={shared.modalOverlay} onClick={() => !actionLoading && setFlagModal(null)}>
            <div className={`glass ${shared.modalBox}`} onClick={(e) => e.stopPropagation()}>
              <div className={shared.modalHeader}>
                <h3 className={`${classes.warnTitle} ${classes.warnTitleFlag}`}>
                  <WalletCards size={18} />
                  Insufficient balance
                </h3>
                <button
                  type="button"
                  className={shared.modalCloseBtn}
                  onClick={() => setFlagModal(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <p className={shared.modalSub}>
                {flagModal.agent.agentName} cannot cover the penalty
                {flagModal.shortfallCents > 0
                  ? ` — short by $${(flagModal.shortfallCents / 100).toFixed(2)}`
                  : ''}
                . Flag them to pull them from the pool until an admin reviews.
              </p>
              <div className={shared.modalActions}>
                <button
                  type="button"
                  className={shared.modalCancelBtn}
                  onClick={() => setFlagModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${shared.primaryBtn} ${classes.flagBtn}`}
                  onClick={handleFlagAgent}
                  disabled={actionLoading}
                >
                  <Flag size={14} />
                  {actionLoading ? 'Flagging…' : 'Flag agent'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );

  return { openForceCharge, actionLoading, forceChargeModals };
}
