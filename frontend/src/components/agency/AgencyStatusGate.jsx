/* eslint-disable react/prop-types */
import { useState } from 'react';
import { Building2, MessageCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import useSupportChatStore from '../../store/useSupportChatStore';
import { reapplyAgencyApplication } from '../../services/agencyService';
import { isAgencyGated } from '../../utils/agencyGate';
import classes from './AgencyStatusGate.module.css';

/**
 * Shown when the user's agency is pending, rejected, or suspended.
 * Blocks Take Calls / Agency Dashboard until platform approval / reactivation.
 */
export default function AgencyStatusGate({ variant = 'page' }) {
  const user = useAuthStore((s) => s.user);
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const openPopup = useSupportChatStore((s) => s.openPopup);
  const navigate = useNavigate();
  const [reapplying, setReapplying] = useState(false);
  const status = user?.agencyStatus;
  const name = user?.agencyName || 'Your agency';
  const reason = user?.agencyRejectReason;

  if (!isAgencyGated(user)) return null;

  const pending = status === 'pending';
  const suspended = status === 'suspended';
  const rejected = status === 'rejected';
  const unknown = !status;

  const handleReapply = async () => {
    setReapplying(true);
    try {
      await reapplyAgencyApplication();
      await refreshUserRole();
      toast.success('You can submit a new agency application on your Profile');
      navigate('/app/profile');
    } catch (err) {
      toast.error(err?.message || 'Could not clear application');
    } finally {
      setReapplying(false);
    }
  };

  let title = 'Agency application not approved';
  if (pending || unknown) title = 'Agency under review';
  if (suspended) title = 'Agency suspended';

  return (
    <div className={`glass ${classes.card} ${variant === 'inline' ? classes.inline : ''}`}>
      <div className={classes.icon} aria-hidden="true">
        <Building2 size={22} />
      </div>
      <h2 className={classes.title}>{title}</h2>
      <p className={classes.body}>
        {pending || unknown ? (
          <>
            <strong>{name}</strong>
            {' '}
            {unknown
              ? 'status is still loading. Take Calls stays locked until we confirm your agency is active.'
              : 'is waiting for CallsFlow approval. You only have access to this status page, Profile, and Support until we approve your application.'}
          </>
        ) : null}
        {rejected ? (
          <>
            <strong>{name}</strong>
            {' '}
            was not approved.
            {reason ? ` Reason: ${reason}` : ' Contact support if you have questions.'}
            {' '}
            You can clear this application and submit a new one from Profile.
          </>
        ) : null}
        {suspended ? (
          <>
            <strong>{name}</strong>
            {' '}
            is suspended. Take Calls and agency ops are paused until a platform admin reactivates
            the account. Contact Support if you need help.
          </>
        ) : null}
      </p>
      <div className={classes.actions}>
        <button type="button" className={classes.chatBtn} onClick={() => openPopup?.()}>
          <MessageCircle size={16} />
          Open Support Chat
        </button>
        {rejected ? (
          <button
            type="button"
            className={classes.secondaryBtn}
            onClick={handleReapply}
            disabled={reapplying}
          >
            <RefreshCw size={16} className={reapplying ? classes.spin : ''} />
            {reapplying ? 'Clearing…' : 'Start a new application'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
