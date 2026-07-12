import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listAdminManagers } from '../../services/adminService';
import AdminOpsCommandShell from '../../components/admin/AdminOpsCommandShell';
import TeamDashboardLayout from '../../components/ops/TeamDashboardLayout';
import PageLoader from '../../components/ui/PageLoader';
import { usePageBreadcrumbs } from '../../hooks/usePageBreadcrumbs';

const BASE_PATH = '/app/admin/ops/teams';

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 6);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

export default function AdminTeamsOpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('selected') || '';
  const range = useMemo(() => defaultRange(), []);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);

  const loadManagers = useCallback(async () => {
    try {
      const out = await listAdminManagers(range);
      setManagers(Array.isArray(out?.managers) ? out.managers : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load manager teams');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadManagers(); }, [loadManagers]);

  const metrics = useMemo(() => {
    const withAgents = managers.filter((m) => (m.agentCount ?? 0) > 0).length;
    const agents = managers.reduce((sum, m) => sum + (m.agentCount ?? 0), 0);
    return [
      { label: 'teams', value: managers.length },
      { label: 'with agents', value: withAgents },
      { label: 'agents', value: agents },
    ];
  }, [managers]);

  const validManager = useMemo(
    () => (selectedId ? managers.find((m) => m.uid === selectedId) : null),
    [managers, selectedId],
  );

  useEffect(() => {
    if (!selectedId || loading) return;
    if (!validManager) {
      toast.error('Manager team not found');
      setSearchParams({}, { replace: true });
    }
  }, [selectedId, validManager, loading, setSearchParams]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Manager Teams', href: selectedId ? BASE_PATH : undefined },
    ];
    if (selectedId) {
      const teamLabel = validManager?.teamName || validManager?.name || 'Loading…';
      crumbs.push({ label: teamLabel });
    }
    return crumbs;
  }, [selectedId, validManager?.teamName, validManager?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const handleSelect = (id) => {
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  if (loading && !managers.length) return <PageLoader />;

  return (
    <AdminOpsCommandShell
      metrics={metrics}
      loading={loading}
      tenants={managers}
      activeId={selectedId}
      onSelect={handleSelect}
      getTenantId={(m) => m.uid}
      getPrimaryLabel={(m) => m.teamName || m.name || m.uid}
      getSecondaryLabel={(m) => m.email || (m.teamName ? m.name : null)}
      getAgentCount={(m) => m.agentCount ?? 0}
      getExtraMeta={(m) => {
        const calls = m.summary?.totalCalls;
        return calls != null ? `${calls} calls (7d)` : null;
      }}
      getSearchText={(m) => [
        m.teamName,
        m.name,
        m.email,
        m.uid,
      ].filter(Boolean).join(' ')}
      settingsRoute="/app/admin/managers"
      settingsLabel="Team settings"
      emptyTenantsTitle="No manager teams yet"
      emptyTenantsBody="Promote a platform user to manager in settings, then monitor their team here."
      emptySelectionTitle="Select a team"
      emptySelectionBody="Choose a manager team from the directory to open its performance dashboard."
    >
      {validManager ? (
        <TeamDashboardLayout
          scope={{ managerUid: selectedId }}
          embedMode
          compactHeader
          settingsHref={`/app/admin/managers?selected=${encodeURIComponent(selectedId)}`}
          settingsLabel="Team settings"
        />
      ) : null}
    </AdminOpsCommandShell>
  );
}
