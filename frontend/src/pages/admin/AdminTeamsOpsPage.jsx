import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserCog, Users, Radio } from 'lucide-react';
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
  const navigate = useNavigate();
  const { managerUid } = useParams();
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
      { label: 'Total teams', value: managers.length, icon: UserCog },
      { label: 'With agents', value: withAgents, icon: Radio },
      { label: 'Managed agents', value: agents, icon: Users },
    ];
  }, [managers]);

  const validManager = useMemo(
    () => (managerUid ? managers.find((m) => m.uid === managerUid) : null),
    [managers, managerUid],
  );

  useEffect(() => {
    if (!managerUid || loading) return;
    if (!validManager) {
      toast.error('Manager team not found');
      navigate(BASE_PATH, { replace: true });
    }
  }, [managerUid, validManager, loading, navigate]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Manager Teams', href: managerUid ? BASE_PATH : undefined },
    ];
    if (managerUid) {
      const teamLabel = validManager?.teamName || validManager?.name || 'Loading…';
      crumbs.push({ label: teamLabel });
    }
    return crumbs;
  }, [managerUid, validManager?.teamName, validManager?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const handleSelect = (id) => {
    navigate(id ? `${BASE_PATH}/${id}` : BASE_PATH);
  };

  if (loading && !managers.length) return <PageLoader />;

  return (
    <AdminOpsCommandShell
      title="Manager Teams"
      description="Command center for platform manager teams — roster performance, live ops, and call history."
      icon={UserCog}
      metrics={metrics}
      loading={loading}
      tenants={managers}
      activeId={managerUid || ''}
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
      settingsHref={(id) => `/app/admin/managers?selected=${encodeURIComponent(id)}`}
      settingsLabel="Team settings"
      settingsRoute="/app/admin/managers"
      emptyTenantsTitle="No manager teams yet"
      emptyTenantsBody="Promote a platform user to manager in settings, then monitor their team here."
      emptySelectionTitle="Select a team"
      emptySelectionBody="Choose a manager team from the directory to open its performance dashboard."
    >
      {validManager ? (
        <TeamDashboardLayout
          key={managerUid}
          scope={{ managerUid }}
          embedMode
          compactHeader
          backHref={BASE_PATH}
        />
      ) : null}
    </AdminOpsCommandShell>
  );
}
