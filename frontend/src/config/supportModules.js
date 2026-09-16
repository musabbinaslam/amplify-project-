import { BarChart2, Inbox } from 'lucide-react';

export const SUPPORT_MODULES = [
  {
    id: 'inbox',
    title: 'Live Inbox',
    description: 'Claim threads, reply live, and close conversations.',
    route: '/app/support-desk/inbox',
    icon: Inbox,
    category: 'Desk',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'Queue health, volume, wait times, and your reply stats.',
    route: '/app/support-desk/analytics',
    icon: BarChart2,
    category: 'Insights',
  },
];

export const SUPPORT_DESK_HOME = '/app/support-desk';

export function isSupportDeskPath(pathname = '') {
  return pathname === SUPPORT_DESK_HOME || pathname.startsWith(`${SUPPORT_DESK_HOME}/`);
}

export function getSupportModuleByRoute(pathname = '') {
  return SUPPORT_MODULES.find((mod) => mod.route === pathname) || null;
}
