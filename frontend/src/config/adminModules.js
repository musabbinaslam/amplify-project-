import {
  AlertTriangle,
  Bell,
  CircleDollarSign,
  Flag,
  HeadphonesIcon,
  Phone,
  Radio,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Users,
  Building2,
  UserCog,
} from 'lucide-react';

export const ADMIN_CATEGORIES = {
  operations: 'Operations',
  agents: 'Agents & Billing',
  configuration: 'Configuration',
  communications: 'Communications',
  quality: 'Quality',
};

export const ADMIN_MODULES = [
  {
    id: 'live-ops',
    title: 'Live Operations',
    description: 'Monitor live calls, pool status, and online agents in real time.',
    route: '/app/admin/live-ops',
    icon: Radio,
    category: 'operations',
  },
  {
    id: 'analytics',
    title: 'Analytics & Reports',
    description: 'Call trends, campaign and agent performance, and drilldown reports.',
    route: '/app/admin/analytics',
    icon: TrendingUp,
    category: 'operations',
  },
  {
    id: 'call-contests',
    title: 'Call Charge Contests',
    description: 'Review agent disputes, proof files, and approve or deny credits.',
    route: '/app/admin/call-contests',
    icon: CircleDollarSign,
    category: 'agents',
    badgeKey: 'pendingContests',
  },
  {
    id: 'suspicious',
    title: 'Suspicious Drop Patterns',
    description: 'Review agents who repeatedly dropped calls just before the billing threshold.',
    route: '/app/admin/suspicious',
    icon: AlertTriangle,
    category: 'agents',
    badgeKey: 'suspiciousAgents',
  },
  {
    id: 'agents',
    title: 'Agent Management',
    description: 'Agent performance, flag or resume agents, and emergency pool removal.',
    route: '/app/admin/agents',
    icon: Users,
    category: 'agents',
  },
  {
    id: 'agencies',
    title: 'Agencies',
    description: 'Create agencies, assign agents, lock campaigns, and manage agency DIDs.',
    route: '/app/admin/agencies',
    icon: Building2,
    category: 'configuration',
  },
  {
    id: 'managers',
    title: 'Manager Teams',
    description: 'Promote managers, assign agent allowlists, and view team performance stats.',
    route: '/app/admin/managers',
    icon: UserCog,
    category: 'configuration',
  },
  {
    id: 'campaigns',
    title: 'Campaign Settings',
    description: 'Edit pricing and buffers, pause campaigns, or add new ones.',
    route: '/app/admin/campaigns',
    icon: Settings2,
    category: 'configuration',
  },
  {
    id: 'phone-routing',
    title: 'Phone Routing',
    description: 'Map incoming phone numbers to campaigns for Twilio call routing.',
    route: '/app/admin/phone-routing',
    icon: Phone,
    category: 'configuration',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Send broadcasts, targeted alerts, and manage maintenance windows.',
    route: '/app/admin/notifications',
    icon: Bell,
    category: 'communications',
  },
  {
    id: 'ai-training',
    title: 'AI Training',
    description: 'Coaching adherence, risk tracking, and agent plan visibility.',
    route: '/app/admin/ai-training',
    icon: HeadphonesIcon,
    category: 'quality',
  },
  {
    id: 'ai-flags',
    title: 'AI Flags',
    description: 'Review AI-generated call flags and verify or dismiss them.',
    route: '/app/admin/ai-flags',
    icon: Flag,
    category: 'quality',
    badgeKey: 'pendingAiFlags',
  },
  {
    id: 'qa-rules',
    title: 'Compliance Rules',
    description: 'Define the recording rules Gemini checks after each call.',
    route: '/app/admin/qa-rules',
    icon: ShieldAlert,
    category: 'quality',
  },
];

export function getAdminModulesByCategory() {
  const order = Object.keys(ADMIN_CATEGORIES);
  return order
    .map((categoryId) => ({
      id: categoryId,
      label: ADMIN_CATEGORIES[categoryId],
      modules: ADMIN_MODULES.filter((m) => m.category === categoryId),
    }))
    .filter((group) => group.modules.length > 0);
}

export function getAdminModuleByRoute(pathname) {
  return ADMIN_MODULES.find((m) => pathname === m.route || pathname.startsWith(`${m.route}/`));
}
