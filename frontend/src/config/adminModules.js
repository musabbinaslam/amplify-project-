import {
  AlertTriangle,
  Bell,
  CircleDollarSign,
  FileSpreadsheet,
  Flag,
  HeadphonesIcon,
  Mail,
  Phone,
  Radio,
  Search,
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
    id: 'call-trace',
    title: 'Call Trace',
    description: 'Look up a caller phone or CallSid: pings, routing, live status, and call history.',
    route: '/app/admin/call-trace',
    icon: Search,
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
    id: 'export',
    title: 'Data & Excel Export',
    description: 'Download formatted Excel (.xlsx) workbooks for calls, campaigns, and agent rosters.',
    route: '/app/admin/export',
    icon: FileSpreadsheet,
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
    description: 'Review applications, invite codes, assign agents, lock campaigns, and manage DIDs.',
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
    id: 'email-campaigns',
    title: 'Email Campaigns',
    description: 'Retarget and drip sequences for unpaid signups.',
    route: '/app/admin/email-campaigns',
    icon: Mail,
    category: 'communications',
    children: [
      {
        id: 'medicare-retarget',
        title: 'Medicare Retarget',
        description: 'All unpaid Medicare signups — two emails, then converted or exhausted.',
        route: '/app/admin/email-campaigns/medicare-retarget',
        icon: Mail,
        category: 'communications',
      },
    ],
  },
  {
    id: 'support-desk',
    title: 'Support Desk',
    description: 'Live inbox and support analytics — claim threads and track queue health.',
    route: '/app/support-desk',
    icon: HeadphonesIcon,
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

function moduleMatchesRoute(mod, pathname) {
  if (!mod?.route) return false;
  return pathname === mod.route || pathname.startsWith(`${mod.route}/`);
}

export function findAdminModuleById(id) {
  for (const mod of ADMIN_MODULES) {
    if (mod.id === id) return mod;
    const child = (mod.children || []).find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}

export function findParentAdminModule(id) {
  if (!id) return undefined;
  return ADMIN_MODULES.find((mod) => (mod.children || []).some((child) => child.id === id));
}

export function getAdminModuleByRoute(pathname) {
  for (const mod of ADMIN_MODULES) {
    const child = (mod.children || []).find((c) => moduleMatchesRoute(c, pathname));
    if (child) return child;
    if (moduleMatchesRoute(mod, pathname)) return mod;
  }
  return undefined;
}
