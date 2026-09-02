import { useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Moon, Sun, Bell, ChevronRight } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import useDialerStore from '../../store/useDialerStore';
import { dropdownPanelMotion } from '../../motion/appMotion';
import NotificationDetailModal from '../modals/NotificationDetailModal';
import { resolveRouteBreadcrumbs } from '../../utils/resolveRouteBreadcrumbs';
import classes from './Topbar.module.css';

/* eslint-disable react/prop-types -- topbar props wired from AppShell */
const Topbar = ({
  notifications = [],
  adminNotifications = [],
  aiFlagNotifications = [],
  isAdmin = false,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  notificationTick = 0,
  latestNotificationId = null,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const user = useAuthStore((s) => s.user);
  const { theme, toggleTheme, pageBreadcrumbs } = useUIStore();
  const [balanceCents, setBalanceCents] = useState(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isBellAnimating, setIsBellAnimating] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [inboxTab, setInboxTab] = useState('general');
  const inboxRef = useRef(null);
  const { callState } = useDialerStore();
  const showPersonaWarning = Boolean(user && user.personaStatus !== 'verified');

  const isOnline = callState !== 'offline' && callState !== 'error';
  const inboxMotion = dropdownPanelMotion(reduceMotion);

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
    if (!isInboxOpen) return undefined;
    const onClickOutside = (event) => {
      if (!inboxRef.current?.contains(event.target)) {
        setIsInboxOpen(false);
        setInboxTab('general');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isInboxOpen]);

  useEffect(() => {
    if (!notificationTick) return;
    setIsBellAnimating(true);
    const timer = window.setTimeout(() => setIsBellAnimating(false), 1100);
    return () => window.clearTimeout(timer);
  }, [notificationTick]);

  const breadcrumbs = useMemo(() => {
    if (pageBreadcrumbs?.length) return pageBreadcrumbs;
    return resolveRouteBreadcrumbs(location.pathname);
  }, [pageBreadcrumbs, location.pathname]);

  const formatBalance = (cents) => {
    if (cents === null) return '...';
    return (cents / 100).toFixed(2);
  };

  const formatTime = (value) => {
    if (!value) return 'Just now';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Just now';
    return dt.toLocaleString();
  };

  const generalItems = useMemo(() => notifications.slice(0, 12), [notifications]);
  const adminItems = useMemo(
    () => (isAdmin ? adminNotifications.slice(0, 12) : []),
    [adminNotifications, isAdmin],
  );
  const aiFlagItems = useMemo(
    () => (isAdmin ? aiFlagNotifications.slice(0, 12) : []),
    [aiFlagNotifications, isAdmin],
  );
  const generalUnread = useMemo(
    () => notifications.filter((row) => !row.read).length,
    [notifications],
  );
  const adminUnread = useMemo(
    () => adminNotifications.filter((row) => !row.read).length,
    [adminNotifications],
  );
  const aiFlagUnread = useMemo(
    () => aiFlagNotifications.filter((row) => !row.read).length,
    [aiFlagNotifications],
  );
  const activeItems = inboxTab === 'admin' && isAdmin
    ? adminItems
    : inboxTab === 'ai_flags' && isAdmin
      ? aiFlagItems
      : generalItems;
  const activeTabEmpty = activeItems.length === 0;

  const closeInbox = () => {
    setIsInboxOpen(false);
    setInboxTab('general');
  };

  const openNotification = (row) => {
    if (row.id && onMarkRead) onMarkRead(row.id);

    if (row.linkPath && (row.type === 'admin_alert' || row.type === 'ai_flag' || row.type === 'contest_credited')) {
      closeInbox();
      navigate(row.linkPath);
      return;
    }

    closeInbox();
    setSelectedNotification(row);
  };

  const toggleInbox = () => {
    if (isInboxOpen) {
      closeInbox();
      return;
    }
    setInboxTab('general');
    setIsInboxOpen(true);
  };

  const renderInboxItems = (rows) => rows.map((row) => (
    <button
      type="button"
      key={row.id || `${row.title}-${row.createdAt}`}
      className={`${classes.notificationCard} ${!row.read ? classes.notificationCardUnread : ''} ${
        latestNotificationId && row.id === latestNotificationId ? classes.notificationCardNew : ''
      } ${row.type === 'admin_alert' || row.type === 'ai_flag' ? classes.notificationCardAdmin : ''}`}
      onClick={() => openNotification(row)}
    >
      {!row.read && <span className={classes.unreadDot} aria-hidden="true" />}
      <div className={classes.cardMain}>
        <div className={classes.cardTitleRow}>
          <span className={classes.itemTitle}>{row.title || 'Notification'}</span>
          {row.type === 'admin_alert' ? (
            <span className={classes.adminChip}>Admin</span>
          ) : null}
          {row.type === 'ai_flag' ? (
            <span className={classes.adminChip}>AI Flags</span>
          ) : null}
        </div>
        {row.body ? <span className={classes.itemBody}>{row.body}</span> : null}
        <span className={classes.itemTime}>{formatTime(row.createdAt || row.createdAtIso)}</span>
      </div>
    </button>
  ));

  return (
    <header className={classes.topbar}>
      <div className={classes.pageInfo}>
        <nav className={classes.breadcrumbs} aria-label="Breadcrumb">
          <ol className={classes.breadcrumbList}>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const isLink = Boolean(crumb.href) && !isLast;

              return (
                <li key={`${crumb.label}-${index}`} className={classes.breadcrumbItem}>
                  {index > 0 ? (
                    <ChevronRight
                      size={14}
                      className={classes.breadcrumbSep}
                      aria-hidden="true"
                    />
                  ) : null}
                  {isLink ? (
                    <Link to={crumb.href} className={classes.breadcrumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={isLast ? classes.breadcrumbCurrent : classes.breadcrumbText}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className={classes.actions}>
        <a
          href="https://discord.gg/uNstw74Tmk"
          target="_blank"
          rel="noopener noreferrer"
          className={classes.discordPill}
          title="Join our Discord community"
          aria-label="Join our Discord community"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <span className={classes.discordLabel}>Join Discord</span>
        </a>

        {showPersonaWarning ? (
          <button
            type="button"
            className={classes.personaWarning}
            onClick={() => navigate('/app/take-calls')}
            aria-label="Verify identity to take calls"
            title="Verify identity to take calls"
          >
            <span className={classes.personaWarningIcon} aria-hidden="true">⚠</span>
            <span className={classes.personaWarningText}>Verify identity to take calls</span>
          </button>
        ) : null}

        <div className={classes.inboxWrap} ref={inboxRef}>
          <button
            className={`${classes.iconBtn} ${isInboxOpen ? classes.iconBtnActive : ''} ${isBellAnimating ? classes.bellAnimated : ''}`}
            onClick={toggleInbox}
            title="Notifications"
            type="button"
            aria-expanded={isInboxOpen}
            aria-haspopup="dialog"
          >
            <Bell size={18} className={classes.bellIcon} />
            {unreadCount > 0 ? (
              <span className={`${classes.unreadBadge} ${isBellAnimating ? classes.badgeAnimated : ''}`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          <AnimatePresence>
            {isInboxOpen && (
              <motion.div
                className={classes.inboxPanel}
                role="dialog"
                aria-label="Notifications"
                {...inboxMotion}
              >
                <div className={classes.inboxHeader}>
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    className={classes.inlineBtn}
                    onClick={() => onMarkAllRead?.(
                      inboxTab === 'admin' && isAdmin
                        ? 'admin'
                        : inboxTab === 'ai_flags' && isAdmin
                          ? 'ai_flags'
                          : 'general',
                    )}
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
                    <button
                      type="button"
                      role="tab"
                      aria-selected={inboxTab === 'ai_flags'}
                      className={`${classes.inboxTab} ${inboxTab === 'ai_flags' ? classes.inboxTabActiveAdmin : ''}`}
                      onClick={() => setInboxTab('ai_flags')}
                    >
                      AI Flags
                      {aiFlagUnread > 0 ? (
                        <span className={`${classes.inboxTabBadge} ${classes.inboxTabBadgeAdmin}`}>
                          {aiFlagUnread > 99 ? '99+' : aiFlagUnread}
                        </span>
                      ) : null}
                    </button>
                  </div>
                ) : null}

                <div className={classes.inboxBody}>
                  {activeTabEmpty ? (
                    <div className={classes.emptyPanel}>
                      <Bell size={22} className={classes.emptyPanelIcon} aria-hidden="true" />
                      <p>
                        {inboxTab === 'admin'
                          ? 'No admin alerts right now.'
                          : inboxTab === 'ai_flags'
                            ? 'No AI flags yet.'
                            : 'No notifications yet.'}
                      </p>
                    </div>
                  ) : (
                    <div className={classes.inboxList}>
                      {renderInboxItems(activeItems)}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

        <button
          type="button"
          className={classes.iconBtn}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className={`${classes.statusBadge} ${isOnline ? classes.statusOnline : ''}`}>
          <span className={classes.statusDot} />
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      <NotificationDetailModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />
    </header>
  );
};

export default Topbar;
