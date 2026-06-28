import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import useAuthStore from '../../store/authStore';
import useDialerStore from '../../store/useDialerStore';
import {
  Play, Phone, LayoutDashboard, List, FileText,
  DollarSign, Box, User, HeadphonesIcon,
  MessageSquare, Gift, Settings, LogOut,
  ChevronLeft, ChevronRight, Shield, FileEdit, ShieldCheck, Bell, Users,
} from 'lucide-react';
import classes from './Sidebar.module.css';

const NAV_GROUP_LABELS = {
  work: 'Work',
  business: 'Business',
  you: 'You',
  manager: 'Team',
  admin: 'Admin',
  qa: 'QA',
};

const navItems = [
  { path: '/app', label: 'Welcome', icon: Play, end: true, group: 'work' },
  { path: '/app/take-calls', label: 'Take Calls', icon: Phone, group: 'work' },
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'work' },
  { path: '/app/call-logs', label: 'Call Logs', icon: List, group: 'work' },
  { path: '/app/script', label: 'Script', icon: FileText, group: 'work' },
  { path: '/app/notes', label: 'Notes', icon: FileEdit, group: 'work' },
  { path: '/app/billing', label: 'Billing', icon: DollarSign, group: 'business' },
  { path: '/app/leads', label: 'Leads', icon: Box, badge: 'Beta', disabled: true, teaser: true, group: 'business' },
  { path: '/app/profile', label: 'Profile', icon: User, group: 'you' },
  { path: '/app/ai-training', label: 'AI Training', icon: HeadphonesIcon, group: 'you' },
  { path: '/app/support', label: 'Support', icon: MessageSquare, group: 'you' },
  { path: '/app/referral-program', label: 'Referral Program', icon: Gift, group: 'you' },
  { path: '/app/settings', label: 'Settings', icon: Settings, group: 'you' },
];

const Sidebar = () => {
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.user?.role);
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);
  const activeItemRef = useRef(null);

  const items = React.useMemo(() => {
    const base = [...navItems];
    if (role === 'admin') {
      base.push(
        { path: '/app/admin', label: 'Admin', icon: Shield, end: true, group: 'admin' },
        { path: '/app/admin/notifications', label: 'Notification Settings', icon: Bell, group: 'admin' },
        { path: '/app/admin/ai-training', label: 'Admin AI Training', icon: Shield, group: 'admin' },
      );
    }
    if (role === 'qa') {
      base.push(
        { path: '/app/qa', label: 'QA Dashboard', icon: ShieldCheck, end: true, group: 'qa' },
        { path: '/app/qa/ai-training', label: 'QA AI Training', icon: ShieldCheck, group: 'qa' },
      );
    }
    if (role === 'manager' || role === 'admin') {
      base.push(
        { path: '/app/team-dashboard', label: 'Team Dashboard', icon: Users, end: true, group: 'manager' },
      );
    }
    return base;
  }, [role]);

  const navGroups = React.useMemo(() => {
    const order = ['work', 'business', 'you', 'manager', 'admin', 'qa'];
    return order
      .map((groupId) => ({
        id: groupId,
        label: NAV_GROUP_LABELS[groupId],
        items: items.filter((item) => item.group === groupId),
      }))
      .filter((group) => group.items.length > 0);
  }, [items]);

  const handleLogout = async () => {
    const dialerState = useDialerStore.getState();
    if (dialerState.callState !== 'offline') {
      dialerState.goOffline();
      await new Promise((r) => setTimeout(r, 300));
    }
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    const el = activeItemRef.current;
    const container = navRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const navRect = container.getBoundingClientRect();
    const fullyVisible = elRect.top >= navRect.top && elRect.bottom <= navRect.bottom;
    if (!fullyVisible) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [location.pathname]);

  const renderNavItem = (item) => (
    <NavLink
      key={item.path}
      to={item.disabled ? '#' : item.path}
      end={item.end || false}
      ref={(el) => {
        if (!el) return;
        const matches = item.end
          ? location.pathname === item.path
          : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
        if (matches && !item.disabled) {
          activeItemRef.current = el;
        }
      }}
      className={({ isActive }) =>
        `${classes.navItem} ${isSidebarCollapsed ? classes.navItemCollapsed : ''} ${isActive && !item.disabled ? classes.active : ''} ${item.disabled ? classes.disabled : ''} ${item.teaser ? classes.teaser : ''}`
      }
      onClick={(e) => item.disabled && e.preventDefault()}
      aria-disabled={item.disabled ? 'true' : undefined}
      title={item.disabled ? 'Coming soon' : item.label}
      tabIndex={item.disabled ? -1 : undefined}
    >
      <span className={`${classes.iconWrap} ${isSidebarCollapsed ? classes.iconWrapCollapsed : ''}`}>
        <item.icon size={20} className={classes.icon} />
      </span>
      {!isSidebarCollapsed && (
        <>
          <span className={classes.label}>{item.label}</span>
          {item.badge && (
            <span className={`${classes.badge} ${item.badge === 'Beta' ? classes.beta : classes.comingSoon}`}>
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <aside className={`${classes.sidebar} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
      <div className={classes.header}>
        {!isSidebarCollapsed && (
          <div className={classes.logo}>
            <img
              src="/logo.png"
              alt="Callsflow logo"
              className={classes.logoImg}
              loading="eager"
              decoding="async"
            />
            <h2>CALLSFLOW</h2>
          </div>
        )}
        <button type="button" className={classes.toggleBtn} onClick={toggleSidebar} aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav
        ref={navRef}
        className={`${classes.nav} ${isSidebarCollapsed ? classes.navCollapsed : ''}`}
        aria-label="Main navigation"
      >
        {navGroups.map((group) => (
          <div key={group.id} className={classes.navGroup}>
            {!isSidebarCollapsed && (
              <p className={classes.navGroupLabel}>{group.label}</p>
            )}
            {group.items.map(renderNavItem)}
          </div>
        ))}
      </nav>

      <div className={classes.footer}>
        <button
          type="button"
          className={`${classes.logoutBtn} ${isSidebarCollapsed ? classes.logoutBtnCollapsed : ''}`}
          onClick={handleLogout}
        >
          <span className={`${classes.iconWrap} ${isSidebarCollapsed ? classes.iconWrapCollapsed : ''}`}>
            <LogOut size={20} className={classes.icon} />
          </span>
          {!isSidebarCollapsed && <span className={classes.label}>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
