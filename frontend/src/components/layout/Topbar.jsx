import React from 'react';
import { useLocation } from 'react-router-dom';
import { Wallet, Globe, Moon, Settings2 } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import classes from './Topbar.module.css';

const Topbar = () => {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  
  // Format pathname to Title Case for the header
  const getPageTitle = (pathname) => {
    if (pathname === '/') return 'Welcome';
    const path = pathname.split('/')[1];
    return path.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <header className={classes.topbar}>
      <div className={classes.pageInfo}>
        <h1 className={classes.title}>{getPageTitle(location.pathname)}</h1>
        <span className={classes.subtitle}>{user?.name || 'Agent'}</span>
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
        <button className={classes.iconBtn}>
          <Moon size={18} />
        </button>
        
        <div className={classes.statusBadge}>
          <span className={classes.statusDot}></span>
          Offline
        </div>
      </div>
    </header>
  );
};

export default Topbar;
