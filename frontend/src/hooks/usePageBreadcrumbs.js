import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * @param {Array<{ label: string, href?: string }> | null} crumbs
 */
export function usePageBreadcrumbs(crumbs) {
  const setPageBreadcrumbs = useUIStore((s) => s.setPageBreadcrumbs);
  const crumbsKey = crumbs ? JSON.stringify(crumbs) : '';

  useEffect(() => {
    setPageBreadcrumbs(crumbs);
    return () => setPageBreadcrumbs(null);
  }, [crumbs, crumbsKey, setPageBreadcrumbs]);
}
