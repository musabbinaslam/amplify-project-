import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import {
  Play, Phone, LayoutDashboard, List, FileText,
  DollarSign, MapPin, Box, User, HeadphonesIcon,
  MessageSquare, Gift, Settings, LogOut,
  ChevronLeft, ChevronRight, CheckCircle2
} from 'lucide-react';
import classes from './Sidebar.module.css';

const navItems = [
  { path: '/', label: 'Welcome', icon: Play },
  { path: '/take-calls', label: 'Take Calls', icon: Phone },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/call-logs', label: 'Call Logs', icon: List },
  { path: '/script', label: 'Script', icon: FileText },
  { path: '/billing', label: 'Billing', icon: DollarSign },
  { path: '/licensed-states', label: 'Licensed States', icon: MapPin },
  { path: '/leads', label: 'Leads', icon: Box, badge: 'Beta' },
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/ai-training', label: 'AI Training', icon: HeadphonesIcon, badge: 'Coming Soon', disabled: true },
  { path: '/support', label: 'Support', icon: MessageSquare },
  { path: '/referral-program', label: 'Referral Program', icon: Gift },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const Sidebar = () => {
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside className={`${classes.sidebar} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
      <div className={classes.header}>
        {!isSidebarCollapsed && (
          <div className={classes.logo}>
            <div className={classes.logoIcon}>
               <span className={classes.logoTriangle}></span>
            </div>
            <h2>AGENTCALLS</h2>
          </div>
        )}
        <button className={classes.toggleBtn} onClick={toggleSidebar}>
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className={classes.nav}>
        {navItems.map((item) => (
           <NavLink
             key={item.path}
             to={item.disabled ? '#' : item.path}
             className={({ isActive }) =>
               `${classes.navItem} ${isActive && !item.disabled ? classes.active : ''} ${item.disabled ? classes.disabled : ''}`
             }
             onClick={(e) => item.disabled && e.preventDefault()}
           >
             <item.icon size={20} className={classes.icon} />
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
        <button className={classes.logoutBtn}>
          <LogOut size={20} className={classes.icon} />
          {!isSidebarCollapsed && <span className={classes.label}>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
