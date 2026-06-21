import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Moon, Sun, Bell } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import classes from './Topbar.module.css';
import useDialerStore from '../../store/useDialerStore';

const Topbar = ({
  notifications = [],
  adminNotifications = [],
  isAdmin = false,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  notificationTick = 0,
  latestNotificationId = null,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useUIStore();
  const [balanceCents, setBalanceCents] = useState(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isInboxClosing, setIsInboxClosing] = useState(false);
  const [isBellAnimating, setIsBellAnimating] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [inboxTab, setInboxTab] = useState('general');
  const inboxRef = useRef(null);
  const notificationModalRef = useRef(null);
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

    const handleWalletUpdate = (e) => {
      if (e.detail !== undefined) {
        setBalanceCents(e.detail);
      } else {
        fetchBalance();
      }
    };

    if (user) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 60000);
      window.addEventListener('wallet_updated', handleWalletUpdate);
      return () => {
        clearInterval(interval);
        window.removeEventListener('wallet_updated', handleWalletUpdate);
      };
    }
  }, [user]);

  useEffect(() => {
    if (!isInboxOpen || isInboxClosing) return undefined;
    const onClickOutside = (event) => {
      if (!inboxRef.current) return;
      if (!inboxRef.current.contains(event.target)) {
        setIsInboxClosing(true);
        window.setTimeout(() => {
          setIsInboxOpen(false);
          setIsInboxClosing(false);
        }, 170);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isInboxOpen, isInboxClosing]);

  useEffect(() => {
    if (!notificationTick) return;
    setIsBellAnimating(true);
    const timer = window.setTimeout(() => setIsBellAnimating(false), 1100);
    return () => window.clearTimeout(timer);
  }, [notificationTick]);

  useEffect(() => {
    if (!selectedNotification) return undefined;
    const onEsc = (event) => {
      if (event.key === 'Escape') setSelectedNotification(null);
    };
    const onOutside = (event) => {
      if (!notificationModalRef.current) return;
      if (!notificationModalRef.current.contains(event.target)) {
        setSelectedNotification(null);
      }
    };
    document.addEventListener('keydown', onEsc);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [selectedNotification]);

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

  const generalItems = useMemo(() => notifications.slice(0, 12), [notifications]);
  const adminItems = useMemo(
    () => (isAdmin ? adminNotifications.slice(0, 12) : []),
    [adminNotifications, isAdmin],
  );
  const generalUnread = useMemo(
    () => notifications.filter((row) => !row.read).length,
    [notifications],
  );
  const adminUnread = useMemo(
    () => adminNotifications.filter((row) => !row.read).length,
    [adminNotifications],
  );
  const activeItems = inboxTab === 'admin' && isAdmin ? adminItems : generalItems;
  const activeTabEmpty = activeItems.length === 0;

  const closeInbox = () => {
    setIsInboxClosing(true);
    window.setTimeout(() => {
      setIsInboxOpen(false);
      setIsInboxClosing(false);
      setInboxTab('general');
    }, 170);
  };

  const openNotification = (row) => {
    if (row.id && onMarkRead) onMarkRead(row.id);

    // Actionable alerts — navigate directly (no detail modal flash).
    if (row.linkPath && (row.type === 'admin_alert' || row.type === 'contest_credited')) {
      closeInbox();
      navigate(row.linkPath);
      return;
    }

    closeInbox();
    setSelectedNotification(row);
  };

  const renderInboxItems = (rows) => rows.map((row) => (
    <button
      type="button"
      key={row.id || `${row.title}-${row.createdAt}`}
      className={`${classes.inboxItem} ${!row.read ? classes.inboxItemUnread : ''} ${
        latestNotificationId && row.id === latestNotificationId ? classes.inboxItemNew : ''
      } ${row.type === 'admin_alert' ? classes.inboxItemAdmin : ''}`}
      onClick={() => openNotification(row)}
    >
      <span className={classes.itemTitle}>{row.title || 'Notification'}</span>
      <span className={classes.itemBody}>{row.body || ''}</span>
      <span className={classes.itemTime}>{formatTime(row.createdAt || row.createdAtIso)}</span>
    </button>
  ));
  const toggleInbox = () => {
    if (isInboxOpen && !isInboxClosing) {
      setIsInboxClosing(true);
      window.setTimeout(() => {
        setIsInboxOpen(false);
        setIsInboxClosing(false);
        setInboxTab('general');
      }, 170);
      return;
    }
    setInboxTab('general');
    setIsInboxOpen(true);
  };
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
            className={`${classes.iconBtn} ${isBellAnimating ? classes.bellAnimated : ''}`}
            onClick={toggleInbox}
            title="Notifications"
            type="button"
          >
            <Bell size={18} className={classes.bellIcon} />
            {unreadCount > 0 ? (
              <span className={`${classes.unreadBadge} ${isBellAnimating ? classes.badgeAnimated : ''}`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>
          {isInboxOpen ? (
            <div
              className={`${classes.inboxPanel} ${
                isInboxClosing ? classes.inboxPanelClose : classes.inboxPanelOpen
              }`}
            >
              <div className={classes.inboxHeader}>
                <strong>Notifications</strong>
                <button
                  type="button"
                  className={classes.inlineBtn}
                  onClick={() => onMarkAllRead?.(inboxTab === 'admin' && isAdmin ? 'admin' : 'general')}
                >
                  Mark all read
                </button>
              </div>
              {isAdmin ? (
                <div className={classes.inboxTabs} role="tablist" aria-label="Notification sections">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inboxTab === 'general'}
                    className={`${classes.inboxTab} ${inboxTab === 'general' ? classes.inboxTabActive : ''}`}
                    onClick={() => setInboxTab('general')}
                  >
                    Updates
                    {generalUnread > 0 ? (
                      <span className={classes.inboxTabBadge}>{generalUnread > 99 ? '99+' : generalUnread}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inboxTab === 'admin'}
                    className={`${classes.inboxTab} ${inboxTab === 'admin' ? classes.inboxTabActiveAdmin : ''}`}
                    onClick={() => setInboxTab('admin')}
                  >
                    Admin
                    {adminUnread > 0 ? (
                      <span className={`${classes.inboxTabBadge} ${classes.inboxTabBadgeAdmin}`}>
                        {adminUnread > 99 ? '99+' : adminUnread}
                      </span>
                    ) : null}
                  </button>
                </div>
              ) : null}
              {activeTabEmpty ? (
                <p className={classes.emptyText}>
                  {inboxTab === 'admin' ? 'No admin alerts right now.' : 'No notifications yet.'}
                </p>
              ) : (
                <div className={classes.inboxList}>
                  {renderInboxItems(activeItems)}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={classes.walletBox}
          onClick={() => navigate('/app/billing')}
          title="View billing"
        >
          <Wallet size={16} className={classes.walletIcon} />
          <span className={classes.balance}>{formatBalance(balanceCents)}</span>
          {balanceCents !== null && balanceCents < 5000 && (
            <span className={classes.noCreditsBadge}>Low Credits</span>
          )}
        </button>


        <button className={classes.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        
        <div className={`${classes.statusBadge} ${isOnline ? classes.statusOnline : ''}`}>
          <span className={classes.statusDot}></span>
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>
      {selectedNotification ? createPortal(
        <div className={classes.notificationModalBackdrop}>
          <div className={classes.notificationModal} ref={notificationModalRef}>
            <div className={classes.notificationModalHeader}>
              <h3>{selectedNotification.title || 'Notification'}</h3>
              <button
                type="button"
                className={classes.notificationCloseBtn}
                onClick={() => setSelectedNotification(null)}
              >
                Close
              </button>
            </div>
            <div className={classes.notificationModalMeta}>
              <span>{formatTime(selectedNotification.createdAt || selectedNotification.createdAtIso)}</span>
              <span>{String(selectedNotification.type || 'general').replace(/_/g, ' ')}</span>
            </div>
            <p className={classes.notificationModalBody}>{selectedNotification.body || 'No description available.'}</p>
          </div>
        </div>
      , document.body) : null}
    </header>
  );
};

export default Topbar;
