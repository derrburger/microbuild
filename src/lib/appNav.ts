/** Role-based app navigation — single source for top nav (no duplicate dashboard tab row). */

export type AppShellRole = 'public' | 'buyer' | 'creator' | 'admin';

export type AppNavItem = {
  to: string;
  label: string;
  /** Exact path match only (e.g. /dashboard overview). */
  end?: boolean;
  /** Extra path prefixes that should highlight this item. */
  alsoActiveOn?: string[];
};

export const PUBLIC_NAV: AppNavItem[] = [
  { to: '/browse', label: 'Browse' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/pricing', label: 'Pricing' },
];

export const BUYER_NAV: AppNavItem[] = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/browse', label: 'Browse Workflows' },
  { to: '/dashboard/requests', label: 'My Requests' },
  { to: '/messages', label: 'Messages' },
];

export const CREATOR_NAV: AppNavItem[] = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/browse', label: 'Buyer Requests' },
  { to: '/dashboard/applications', label: 'Applications' },
  {
    to: '/dashboard/projects',
    label: 'Projects',
    alsoActiveOn: ['/dashboard/projects/'],
  },
  { to: '/dashboard/workflows', label: 'Workflows', alsoActiveOn: ['/dashboard/workflows/'] },
  { to: '/messages', label: 'Messages' },
];

export const ADMIN_NAV: AppNavItem[] = [
  { to: '/admin', label: 'AI Command Center', end: true },
  { to: '/admin#buyers', label: 'Requests' },
  { to: '/admin#creators', label: 'Creators' },
  { to: '/admin#marketplace', label: 'Applications' },
  { to: '/admin#pipeline', label: 'Projects' },
  { to: '/admin#workflows', label: 'Workflows' },
  { to: '/admin#health', label: 'Health' },
];

export function resolveAppShellRole(
  loggedIn: boolean,
  accountType: string | undefined,
  isAdmin: boolean,
): AppShellRole {
  if (!loggedIn) return 'public';
  if (isAdmin) return 'admin';
  const t = accountType?.toLowerCase();
  if (t === 'creator') return 'creator';
  if (t === 'buyer') return 'buyer';
  return 'public';
}

export function navItemsForRole(role: AppShellRole): AppNavItem[] {
  switch (role) {
    case 'buyer':
      return BUYER_NAV;
    case 'creator':
      return CREATOR_NAV;
    case 'admin':
      return ADMIN_NAV;
    default:
      return PUBLIC_NAV;
  }
}

export function isNavItemActive(pathname: string, hash: string, item: AppNavItem): boolean {
  const [pathPart, hashPart] = item.to.split('#');
  const targetHash = hashPart ? `#${hashPart}` : '';
  const targetPath = pathPart || '/';

  if (targetHash) {
    return pathname.startsWith('/admin') && hash.toLowerCase() === targetHash.toLowerCase();
  }

  if (item.end) {
    if (pathname !== targetPath && pathname !== `${targetPath}/`) return false;
    if (targetPath === '/dashboard') {
      return !pathname.startsWith('/dashboard/');
    }
    if (targetPath === '/admin') {
      const h = hash.toLowerCase();
      return !h || h === '#command' || h === '#';
    }
    return true;
  }

  if (pathname === targetPath || pathname.startsWith(`${targetPath}/`)) return true;

  for (const prefix of item.alsoActiveOn ?? []) {
    if (prefix.startsWith('#')) {
      if (hash === prefix) return true;
    } else if (pathname.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}
