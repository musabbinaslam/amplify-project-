import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Globe, Moon, Sun, Settings2 } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import classes from './Topbar.module.css';

const Topbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useUIStore();
  const [balanceCents, setBalanceCents] = useState(null);
  
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const { stripeService } = await import('../../services/stripeService');
        const wallet = await stripeService.getWallet();
        if (wallet) setBalanceCents(wallet.balance);
      } catch (err) {
        console.error('Failed to fetch balance', err);
      }
    };
    if (user) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Format pathname to Title Case for the header
  const getPageTitle = (pathname) => {
    const stripped = pathname.replace(/^\/app\/?/, '');
    if (!stripped) return 'Lets get started';
    return stripped.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatBalance = (cents) => {
    if (cents === null) return '...';
    return (cents / 100).toFixed(2);
  };

  return (
    <header className={classes.topbar}>
      <div className={classes.pageInfo}>
        <h1 className={classes.title}>{getPageTitle(location.pathname)}</h1>
        {/* <span className={classes.subtitle}>{user?.name || 'Agent'}</span> */}
      </div>

      <div className={classes.actions}>
        <div className={classes.walletBox} onClick={() => navigate('/app/billing')} style={{cursor: 'pointer'}}>
          <Wallet size={16} className={classes.walletIcon} />
          <span className={classes.balance}>{formatBalance(balanceCents)}</span>
          {balanceCents !== null && balanceCents < 5000 && (
            <span className={classes.noCreditsBadge}>Low Credits</span>
          )}
        </div>

        <button className={classes.iconBtn}>
          <Globe size={18} />
        </button>
        <button className={classes.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
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
