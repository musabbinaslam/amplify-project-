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
