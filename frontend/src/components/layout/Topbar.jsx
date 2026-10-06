import { useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Moon, Sun, Bell, ChevronRight, MessageSquare } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import useDialerStore from '../../store/useDialerStore';
import useSupportChatStore from '../../store/useSupportChatStore';
import useSupportDeskStore from '../../store/useSupportDeskStore';
import { dropdownPanelMotion } from '../../motion/appMotion';
import NotificationDetailModal from '../modals/NotificationDetailModal';
import { resolveRouteBreadcrumbs } from '../../utils/resolveRouteBreadcrumbs';
import NumberPopIn from '../ui/NumberPopIn';
import IconSwap from '../ui/IconSwap';
import NotificationBadge from '../ui/NotificationBadge';
import ShimmerText from '../ui/ShimmerText';
import SlidingTabs from '../ui/SlidingTabs';
import { useWalletQuery } from '../../queries';
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
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isBellAnimating, setIsBellAnimating] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [inboxTab, setInboxTab] = useState('general');
  const inboxRef = useRef(null);
  const { callState } = useDialerStore();
  const openSupportPopup = useSupportChatStore((s) => s.openPopup);
  const prepareUserChat = useSupportChatStore((s) => s.prepareUserChat);
  const markSupportRead = useSupportChatStore((s) => s.markRead);
  const supportUnread = useSupportChatStore((s) => s.unreadForUser);
  const deskUnread = useSupportDeskStore((s) => s.unreadTotal);
  const supportPopupOpen = useSupportChatStore((s) => s.popupOpen);
  const supportPopupMinimized = useSupportChatStore((s) => s.popupMinimized);
  const showPersonaWarning = Boolean(
    user && user.personaStatus !== 'verified' && user.role !== 'support' && user.role !== 'admin' && user.role !== 'qa',
  );
  const isSupportRole = user?.role === 'support';
  const isStaffViewer = user?.role === 'support' || user?.role === 'admin';
  const path = location.pathname.replace(/\/+$/, '');
  const onUserSupportPage = path === '/app/support' || path === '/app/support/email';
  const onSupportDesk = path.startsWith('/app/support-desk');
  const showSupportChat = Boolean(user) && !isSupportRole && !onSupportDesk;
  const supportChatActive = supportPopupOpen && !supportPopupMinimized;
  const bellUnread = Number(unreadCount || 0);

  const isOnline = callState !== 'offline' && callState !== 'error';
  const inboxMotion = dropdownPanelMotion(reduceMotion);

  const walletQuery = useWalletQuery({ enabled: Boolean(user) && user?.role !== 'support' });
  const balanceCents = walletQuery.data ? Number(walletQuery.data.balance) || 0 : null;

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

  useEffect(() => {
    if (!deskUnread) return;
    setIsBellAnimating(true);
    const timer = window.setTimeout(() => setIsBellAnimating(false), 1100);
    return () => window.clearTimeout(timer);
  }, [deskUnread]);

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
    if (isSupportRole && deskUnread > 0 && !onSupportDesk) {
      navigate('/app/support-desk/inbox');
      return;
    }
    if (isSupportRole && deskUnread > 0 && onSupportDesk && path !== '/app/support-desk/inbox') {
      navigate('/app/support-desk/inbox');
      return;
    }
    if (isInboxOpen) {
      closeInbox();
      return;
    }
    setInboxTab('general');
    setIsInboxOpen(true);
  };

  const openSupportChat = () => {
    if (onUserSupportPage) {
      navigate('/app/support');
      return;
    }
    openSupportPopup();
    prepareUserChat()
      .then(() => markSupportRead())
      .catch(() => {});
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
        {showSupportChat ? (
          <button
            type="button"
            className={`${classes.chatPill} ${supportChatActive ? classes.chatPillActive : ''}`}
            onClick={openSupportChat}
            title="Open support chat"
            aria-label="Open support chat"
            aria-pressed={supportChatActive}
          >
            <MessageSquare size={16} aria-hidden="true" />
            <span className={classes.chatPillLabel}>Support Chat</span>
            {supportUnread > 0 && !onUserSupportPage ? (
              <span className={classes.chatPillBadge}>
                {supportUnread > 99 ? '99+' : supportUnread}
              </span>
            ) : null}
          </button>
        ) : null}

        {showPersonaWarning ? (
          <button
            type="button"
            className={classes.personaWarning}
            onClick={() => navigate('/app/take-calls')}
            aria-label="Verify identity to take calls"
            title="Verify identity to take calls"
          >
            <span className={classes.personaWarningIcon} aria-hidden="true">⚠</span>
            <span className={classes.personaWarningText}>
              <ShimmerText text="Verify identity to take calls" />
            </span>
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
            <NotificationBadge count={bellUnread} />
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
                  <div className={classes.inboxTabsWrap}>
                    <SlidingTabs
                      tabs={[
                        {
                          key: 'general',
                          label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              Updates
                              {generalUnread > 0 ? (
                                <span className={classes.inboxTabBadge}>{generalUnread > 99 ? '99+' : generalUnread}</span>
                              ) : null}
                            </span>
                          ),
                        },
                        {
                          key: 'admin',
                          label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              Admin
                              {adminUnread > 0 ? (
                                <span className={`${classes.inboxTabBadge} ${classes.inboxTabBadgeAdmin}`}>
                                  {adminUnread > 99 ? '99+' : adminUnread}
                                </span>
                              ) : null}
                            </span>
                          ),
                        },
                        {
                          key: 'ai_flags',
                          label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              AI Flags
                              {aiFlagUnread > 0 ? (
                                <span className={`${classes.inboxTabBadge} ${classes.inboxTabBadgeAdmin}`}>
                                  {aiFlagUnread > 99 ? '99+' : aiFlagUnread}
                                </span>
                              ) : null}
                            </span>
                          ),
                        },
                      ]}
                      activeKey={inboxTab}
                      onChange={setInboxTab}
                      ariaLabel="Notification sections"
                    />
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

        {isSupportRole ? null : (
          <button
            type="button"
            className={classes.walletBox}
            onClick={() => navigate('/app/billing')}
            title="View billing"
          >
            <Wallet size={16} className={classes.walletIcon} />
            <span className={classes.balance}>
              {balanceCents === null ? '...' : <NumberPopIn value={formatBalance(balanceCents)} />}
            </span>
            {balanceCents !== null && balanceCents < 5000 && (
              <span className={classes.noCreditsBadge}>Low Credits</span>
            )}
          </button>
        )}

        <button
          type="button"
          className={classes.iconBtn}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <IconSwap
            state={theme === 'dark' ? 'a' : 'b'}
            iconA={<Sun size={18} />}
            iconB={<Moon size={18} />}
            ariaLabel={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          />
        </button>

        {isSupportRole ? null : (
          <div className={`${classes.statusBadge} ${isOnline ? classes.statusOnline : ''}`}>
            <span className={classes.statusDot} />
            {isOnline ? <ShimmerText text="Online" variant="brand" /> : 'Offline'}
          </div>
        )}
      </div>

      <NotificationDetailModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />
    </header>
  );
};

export default Topbar;
