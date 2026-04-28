import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Moon, Sun, Bell } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import classes from './Topbar.module.css';
import useDialerStore from '../../store/useDialerStore';

const Topbar = ({
  notifications = [],
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useUIStore();
  const [balanceCents, setBalanceCents] = useState(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const inboxRef = useRef(null);
  const { callState } = useDialerStore();
  
  const isOnline = callState !== 'offline' && callState !== 'error';
  
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

  useEffect(() => {
    if (!isInboxOpen) return undefined;
    const onClickOutside = (event) => {
      if (!inboxRef.current) return;
      if (!inboxRef.current.contains(event.target)) {
        setIsInboxOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isInboxOpen]);

  // Format pathname to Title Case for the header
  const getPageTitle = (pathname) => {
    const stripped = pathname.replace(/^\/app\/?/, '');
    if (!stripped) return 'Lets get started';
    const ACRONYMS = new Set(['ai', 'aca', 'id', 'api', 'us']);
    const titleize = (segment) =>
      segment
        .split('-')
        .map((word) => {
          if (!word) return word;
          if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
    return stripped.split('/').map(titleize).join(' / ');
  };

  const formatBalance = (cents) => {
    if (cents === null) return '...';
    return (cents / 100).toFixed(2);
  };

  const items = useMemo(() => notifications.slice(0, 8), [notifications]);
  const formatTime = (value) => {
    if (!value) return 'Just now';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Just now';
    return dt.toLocaleString();
  };

  return (
    <header className={classes.topbar}>
      <div className={classes.pageInfo}>
        <h1 className={classes.title}>{getPageTitle(location.pathname)}</h1>
        {/* <span className={classes.subtitle}>{user?.name || 'Agent'}</span> */}
      </div>

      <div className={classes.actions}>
        <div className={classes.inboxWrap} ref={inboxRef}>
          <button
            className={classes.iconBtn}
            onClick={() => setIsInboxOpen((v) => !v)}
            title="Notifications"
            type="button"
          >
            <Bell size={18} />
            {unreadCount > 0 ? (
              <span className={classes.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            ) : null}
          </button>
          {isInboxOpen ? (
            <div className={classes.inboxPanel}>
              <div className={classes.inboxHeader}>
                <strong>Notifications</strong>
                <button type="button" className={classes.inlineBtn} onClick={onMarkAllRead}>
                  Mark all read
                </button>
              </div>
              {!items.length ? (
                <p className={classes.emptyText}>No notifications yet.</p>
              ) : (
                <div className={classes.inboxList}>
                  {items.map((row) => (
                    <button
                      type="button"
                      key={row.id || `${row.title}-${row.createdAt}`}
                      className={`${classes.inboxItem} ${!row.read ? classes.inboxItemUnread : ''}`}
                      onClick={() => row.id && onMarkRead && onMarkRead(row.id)}
                    >
                      <span className={classes.itemTitle}>{row.title || 'Notification'}</span>
                      <span className={classes.itemBody}>{row.body || ''}</span>
                      <span className={classes.itemTime}>{formatTime(row.createdAt || row.createdAtIso)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div className={classes.walletBox} onClick={() => navigate('/app/billing')} style={{cursor: 'pointer'}}>
          <Wallet size={16} className={classes.walletIcon} />
          <span className={classes.balance}>{formatBalance(balanceCents)}</span>
          {balanceCents !== null && balanceCents < 5000 && (
            <span className={classes.noCreditsBadge}>Low Credits</span>
          )}
        </div>


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
