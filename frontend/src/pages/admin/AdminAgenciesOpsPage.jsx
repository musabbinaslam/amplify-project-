import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Users, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { listAdminAgencies } from '../../services/agencyService';
import AdminOpsCommandShell from '../../components/admin/AdminOpsCommandShell';
import AgencyDashboardLayout from '../../components/ops/AgencyDashboardLayout';
import PageLoader from '../../components/ui/PageLoader';
import { usePageBreadcrumbs } from '../../hooks/usePageBreadcrumbs';

const BASE_PATH = '/app/admin/ops/agencies';

export default function AdminAgenciesOpsPage() {
  const navigate = useNavigate();
  const { agencyId } = useParams();
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState([]);

  const loadAgencies = useCallback(async () => {
    try {
      const out = await listAdminAgencies();
      setAgencies(Array.isArray(out?.agencies) ? out.agencies : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load agencies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgencies(); }, [loadAgencies]);

  const metrics = useMemo(() => {
    const active = agencies.filter((a) => a.status !== 'suspended').length;
    const agents = agencies.reduce((sum, a) => sum + (a.agentCount ?? 0), 0);
    return [
      { label: 'Total agencies', value: agencies.length, icon: Building2 },
      { label: 'Active', value: active, icon: Radio },
      { label: 'Agency agents', value: agents, icon: Users },
    ];
  }, [agencies]);

  const validAgency = useMemo(
    () => (agencyId ? agencies.find((a) => a.id === agencyId) : null),
    [agencies, agencyId],
  );

  useEffect(() => {
    if (!agencyId || loading) return;
    if (!validAgency) {
      toast.error('Agency not found');
      navigate(BASE_PATH, { replace: true });
    }
  }, [agencyId, validAgency, loading, navigate]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Agencies', href: agencyId ? BASE_PATH : undefined },
    ];
    if (agencyId) {
      crumbs.push({ label: validAgency?.name || 'Loading…' });
    }
    return crumbs;
  }, [agencyId, validAgency?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const handleSelect = (id) => {
    navigate(id ? `${BASE_PATH}/${id}` : BASE_PATH);
  };

  if (loading && !agencies.length) return <PageLoader />;

  return (
    <AdminOpsCommandShell
      title="Agencies"
      description="Command center for all agency tenants — live ops, analytics, and call logs in one workspace."
      icon={Building2}
      metrics={metrics}
      loading={loading}
      tenants={agencies}
      activeId={agencyId || ''}
      onSelect={handleSelect}
      getTenantId={(a) => a.id}
      getPrimaryLabel={(a) => a.name}
      getSecondaryLabel={(a) => a.slug || a.id}
      getAgentCount={(a) => a.agentCount ?? 0}
      getStatusPill={(a) => ({
        label: a.status === 'suspended' ? 'Suspended' : 'Active',
        variant: a.status === 'suspended' ? 'suspended' : 'active',
      })}
      getSearchText={(a) => [a.name, a.slug, a.id, a.status].filter(Boolean).join(' ')}
      settingsHref={(id) => `/app/admin/agencies?selected=${encodeURIComponent(id)}`}
      settingsLabel="Agency settings"
      settingsRoute="/app/admin/agencies"
      emptyTenantsTitle="No agencies yet"
      emptyTenantsBody="Create your first agency in settings, then return here to monitor performance."
      emptySelectionTitle="Select an agency"
      emptySelectionBody="Choose an agency from the directory to open its live dashboard."
    >
      {validAgency ? (
        <AgencyDashboardLayout
          key={agencyId}
          scope={{ agencyId }}
          embedMode
          compactHeader
          backHref={BASE_PATH}
        />
      ) : null}
    </AdminOpsCommandShell>
  );
}
