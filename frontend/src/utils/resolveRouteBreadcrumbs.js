import { getAdminModuleByRoute } from '../config/adminModules';

const ADMIN_HOME = '/app/admin';

/** @type {Record<string, string>} */
const TOP_LEVEL_ROUTES = {
  '/app': "Let's get started",
  '/app/take-calls': 'Take Calls',
  '/app/dashboard': 'Dashboard',
  '/app/leaderboard': 'Leaderboard',
  '/app/call-logs': 'Call Logs',
  '/app/ai-training': 'AI Training',
  '/app/script': 'Script',
  '/app/notes': 'Notes',
  '/app/billing': 'Billing',
  '/app/licensed-states': 'Licensed States',
  '/app/leads': 'Leads',
  '/app/profile': 'Profile',
  '/app/support': 'Support',
  '/app/settings': 'Settings',
  '/app/referral-program': 'Referral Program',
  '/app/agency': 'Agency Dashboard',
  '/app/team-dashboard': 'Team Dashboard',
  '/app/qa': 'QA Dashboard',
};

const looksLikeId = (segment) => /^[A-Za-z0-9_-]{18,}$/.test(segment);

function titleizeSegment(segment) {
  const ACRONYMS = new Set(['ai', 'aca', 'id', 'api', 'us']);
  return segment
    .split('-')
    .map((word) => {
      if (!word) return word;
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function fallbackLabel(pathname) {
  const stripped = pathname.replace(/^\/app\/?/, '');
  if (!stripped) return "Let's get started";

  const KNOWN_SEGMENTS = {
    admin: 'Admin',
    agencies: 'Agencies',
    teams: 'Manager Teams',
    managers: 'Managers',
    ops: null,
  };

  const labels = stripped
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (Object.prototype.hasOwnProperty.call(KNOWN_SEGMENTS, segment)) {
        return KNOWN_SEGMENTS[segment];
      }
      if (looksLikeId(segment)) return null;
      return titleizeSegment(segment);
    })
    .filter(Boolean);

  return labels[labels.length - 1] || 'Page';
}

/**
 * @param {string} pathname
 * @returns {Array<{ label: string, href?: string }>}
 */
export function resolveRouteBreadcrumbs(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/app';

  if (TOP_LEVEL_ROUTES[normalized]) {
    return [{ label: TOP_LEVEL_ROUTES[normalized] }];
  }

  if (normalized === ADMIN_HOME) {
    return [{ label: 'Admin' }];
  }

  const adminModule = getAdminModuleByRoute(normalized);
  if (adminModule && normalized === adminModule.route) {
    return [
      { label: 'Admin', href: ADMIN_HOME },
      { label: adminModule.title },
    ];
  }

  if (normalized === '/app/admin/ops/agencies') {
    return [
      { label: 'Admin', href: ADMIN_HOME },
      { label: 'Agencies', href: '/app/admin/agencies' },
    ];
  }

  if (normalized === '/app/admin/ops/teams') {
    return [
      { label: 'Admin', href: ADMIN_HOME },
      { label: 'Manager Teams' },
    ];
  }

  const agenciesOpsLegacy = normalized.match(/^\/app\/admin\/ops\/agencies\/([^/]+)$/);
  if (agenciesOpsLegacy) {
    return [
      { label: 'Admin', href: ADMIN_HOME },
      { label: 'Agencies', href: '/app/admin/agencies' },
      { label: 'Loading…' },
    ];
  }

  const teamsOpsLegacy = normalized.match(/^\/app\/admin\/ops\/teams\/([^/]+)$/);
  if (teamsOpsLegacy) {
    return [
      { label: 'Admin', href: ADMIN_HOME },
      { label: 'Manager Teams', href: '/app/admin/ops/teams' },
      { label: 'Loading…' },
    ];
  }

  if (normalized === '/app/qa/ai-training') {
    return [
      { label: 'QA Dashboard', href: '/app/qa' },
      { label: 'QA AI Training' },
    ];
  }

  return [{ label: fallbackLabel(normalized) }];
}
