import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listAdminAgencies } from '../../services/agencyService';
import { getAdminOverviewLite } from '../../services/adminService';
import AdminOpsCommandShell from '../../components/admin/AdminOpsCommandShell';
import AgencyDashboardLayout from '../../components/ops/AgencyDashboardLayout';
import PageLoader from '../../components/ui/PageLoader';
import { usePageBreadcrumbs } from '../../hooks/usePageBreadcrumbs';

const BASE_PATH = '/app/admin/ops/agencies';

export default function AdminAgenciesOpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected') || '';
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState([]);
  const [liveCallsRaw, setLiveCallsRaw] = useState([]);
  const [agentsRaw, setAgentsRaw] = useState([]);

  const loadAgencies = useCallback(async () => {
    try {
      const [out, ov] = await Promise.all([
        listAdminAgencies(),
        getAdminOverviewLite()
      ]);
      setAgencies(Array.isArray(out?.agencies) ? out.agencies : []);
      setLiveCallsRaw(ov?.liveCalls || []);
      setAgentsRaw(ov?.agents || []);
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
    
    let callsCount = liveCallsRaw.length;
    if (selectedId) {
      const agencyAgentIds = new Set(agentsRaw.filter((a) => a.agencyId === selectedId).map((a) => a.id));
      callsCount = liveCallsRaw.filter((c) => agencyAgentIds.has(c.agentId)).length;
    }

    return [
      { label: 'agencies', value: agencies.length },
      { label: 'active', value: active },
      { label: 'agents', value: agents },
      { label: 'live calls', value: callsCount },
    ];
  }, [agencies, liveCallsRaw, agentsRaw, selectedId]);

  const validAgency = useMemo(
    () => (selectedId ? agencies.find((a) => a.id === selectedId) : null),
    [agencies, selectedId],
  );

  useEffect(() => {
    if (!selectedId || loading) return;
    if (!validAgency) {
      toast.error('Agency not found');
      setSearchParams({}, { replace: true });
    }
  }, [selectedId, validAgency, loading, setSearchParams]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Agencies', href: selectedId ? BASE_PATH : undefined },
    ];
    if (selectedId) {
      crumbs.push({ label: validAgency?.name || 'Loading…' });
    }
    return crumbs;
  }, [selectedId, validAgency?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const handleSelect = (id) => {
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  if (loading && !agencies.length) return <PageLoader />;

  return (
    <AdminOpsCommandShell
      metrics={metrics}
      loading={loading}
      tenants={agencies}
      activeId={selectedId}
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
      settingsRoute="/app/admin/agencies"
      settingsLabel="Agency settings"
      emptyTenantsTitle="No agencies yet"
      emptyTenantsBody="Create your first agency in settings, then return here to monitor performance."
      emptySelectionTitle="Select an agency"
      emptySelectionBody="Choose an agency from the directory to open its live dashboard."
    >
      {validAgency ? (
        <AgencyDashboardLayout
          scope={{ agencyId: selectedId }}
          embedMode
          compactHeader
          settingsHref={`/app/admin/agencies?selected=${encodeURIComponent(selectedId)}`}
          settingsLabel="Agency settings"
        />
      ) : null}
    </AdminOpsCommandShell>
  );
}
