import React from 'react';
import { useLocation } from 'react-router-dom';
import { Wallet, Globe, Moon, Sun, Settings2 } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import classes from './Topbar.module.css';
import useDialerStore from '../../store/useDialerStore';

const Topbar = () => {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useUIStore();
  const { callState } = useDialerStore();
  
  const isOnline = callState !== 'offline' && callState !== 'error';
  
  // Format pathname to Title Case for the header
  const getPageTitle = (pathname) => {
    const stripped = pathname.replace(/^\/app\/?/, '');
    if (!stripped) return 'Lets get started';
    return stripped.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <header className={classes.topbar}>
      <div className={classes.pageInfo}>
        <h1 className={classes.title}>{getPageTitle(location.pathname)}</h1>
        {/* <span className={classes.subtitle}>{user?.name || 'Agent'}</span> */}
      </div>

      <div className={classes.actions}>
        <div className={classes.walletBox}>
          <Wallet size={16} className={classes.walletIcon} />
          <span className={classes.balance}>0.00</span>
          <span className={classes.noCreditsBadge}>No Credits</span>
        </div>

        <button className={classes.iconBtn}>
          <Globe size={18} />
        </button>
        <button className={classes.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        
        <div className={`${classes.statusBadge} ${isOnline ? classes.statusOnline : ''}`}>
          <span className={classes.statusDot}></span>
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
