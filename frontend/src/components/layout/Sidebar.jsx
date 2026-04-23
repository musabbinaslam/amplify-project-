import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import useAuthStore from '../../store/authStore';
import {
  Play, Phone, LayoutDashboard, List, FileText,
  DollarSign, MapPin, Box, User, HeadphonesIcon,
  MessageSquare, Gift, Settings, LogOut,
  ChevronLeft, ChevronRight, CheckCircle2, Shield,
} from 'lucide-react';
import classes from './Sidebar.module.css';

const navItems = [
  { path: '/app', label: 'Welcome', icon: Play, end: true },
  { path: '/app/take-calls', label: 'Take Calls', icon: Phone },
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/call-logs', label: 'Call Logs', icon: List },
  { path: '/app/script', label: 'Script', icon: FileText },
  { path: '/app/billing', label: 'Billing', icon: DollarSign },
  { path: '/app/licensed-states', label: 'Licensed States', icon: MapPin },
  { path: '/app/leads', label: 'Leads', icon: Box, badge: 'Beta', disabled: true, teaser: true },
  { path: '/app/profile', label: 'Profile', icon: User },
  { path: '/app/ai-training', label: 'AI Training', icon: HeadphonesIcon },
  { path: '/app/support', label: 'Support', icon: MessageSquare },
  { path: '/app/referral-program', label: 'Referral Program', icon: Gift },
  { path: '/app/settings', label: 'Settings', icon: Settings },
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
      base.splice(base.length - 1, 0, {
        path: '/app/admin',
        label: 'Admin',
        icon: Shield,
        end: true,
      });
      base.splice(base.length - 1, 0, {
        path: '/app/admin/ai-training',
        label: 'Admin AI Training',
        icon: Shield,
      });
    }
    return base;
  }, [role]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Keep the active sidebar item visible on navigation. Only scrolls when
  // the active item is off-screen ("nearest" = no-op when already visible).
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
        <button className={classes.toggleBtn} onClick={toggleSidebar}>
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav
        ref={navRef}
        className={`${classes.nav} ${isSidebarCollapsed ? classes.navCollapsed : ''}`}
      >
        {items.map((item) => (
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
            title={item.disabled ? 'Coming soon' : undefined}
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
        ))}
      </nav>

      <div className={classes.footer}>
        <button className={`${classes.logoutBtn} ${isSidebarCollapsed ? classes.logoutBtnCollapsed : ''}`} onClick={handleLogout}>
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
