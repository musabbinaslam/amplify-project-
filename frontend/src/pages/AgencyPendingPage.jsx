import { useEffect } from 'react';
import { Building2, Mail, Clock, XCircle } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { isAgencySignupRejected } from '../utils/authRoles';
import classes from './AgencyPendingPage.module.css';

const SUPPORT_EMAIL = 'admin@callsflow.io';

export default function AgencyPendingPage() {
  const user = useAuthStore((s) => s.user);
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const rejected = isAgencySignupRejected(user);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshUserRole().catch(() => {});
    }, 30000);
    return () => window.clearInterval(id);
  }, [refreshUserRole]);

  return (
    <div className={classes.page}>
      <div className={classes.card}>
        <div className={`${classes.iconWrap} ${rejected ? classes.iconRejected : ''}`}>
          {rejected ? <XCircle size={28} /> : <Clock size={28} />}
        </div>
        <p className={classes.eyebrow}>
          {rejected ? 'Application not approved' : 'Agency application pending'}
        </p>
        <h1 className={classes.title}>
          {rejected ? 'We couldn’t approve your agency yet' : 'Thanks for applying'}
        </h1>
        <p className={classes.body}>
          {rejected
            ? 'Your agency application was not approved. Reach out to our team if you’d like more details or to reapply.'
            : 'Your agency signup is under review. Campaigns and calling tools stay locked until we confirm your agency. We’ll email you once a decision is made.'}
        </p>

        <div className={classes.detailBox}>
          <Building2 size={16} aria-hidden />
          <div>
            <strong>{user?.name || 'Applicant'}</strong>
            <span>{user?.email || '—'}</span>
          </div>
        </div>

        <a className={classes.contactBtn} href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail size={16} aria-hidden />
          Contact us at {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
