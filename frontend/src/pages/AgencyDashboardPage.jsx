import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import useAuthStore from '../store/authStore';
import AgencyDashboardLayout from '../components/ops/AgencyDashboardLayout';
import AgencyStatusGate from '../components/agency/AgencyStatusGate';
import { isAgencyGated } from '../utils/agencyGate';

/** Agency tenant ops — scoped to one agency via /api/agency/*. */
export default function AgencyDashboardPage() {
  const user = useAuthStore((s) => s.user);

  if (isAgencyGated(user)) {
    return <AgencyStatusGate />;
  }

  // Role says agency_admin but membership is missing (orphan profile).
  if (!user?.agencyId) {
    return (
      <div className="glass" style={{ maxWidth: 520, margin: '24px auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Building2 size={20} />
          <h2 style={{ margin: 0, fontSize: 18 }}>No agency assigned</h2>
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
          Your account is marked as an agency admin, but you aren&apos;t linked to an agency yet.
          Start an application from Profile, or ask a platform admin to assign you.
        </p>
        <Link to="/app/profile" style={{ color: 'var(--brand-text)', fontWeight: 700, fontSize: 13 }}>
          Go to Profile →
        </Link>
      </div>
    );
  }

  return <AgencyDashboardLayout showInvite />;
}
