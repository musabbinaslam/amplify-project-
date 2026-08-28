import { Navigate, useSearchParams } from 'react-router-dom';

export default function AdminAgenciesOpsPage() {
  const [searchParams] = useSearchParams();
  const selected = searchParams.get('selected') || '';
  const to = selected
    ? `/app/admin/agencies?selected=${encodeURIComponent(selected)}&tab=overview`
    : '/app/admin/agencies';
  return <Navigate to={to} replace />;
}
