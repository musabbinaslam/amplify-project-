import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Wrench } from 'lucide-react';
import { routeOutletMotion } from '../../motion/appMotion';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import useAuthStore from '../../store/authStore';
import useDialerStore from '../../store/useDialerStore';
import useSupportChatStore, { deskUnreadFromConversation } from '../../store/useSupportChatStore';
import { useUIStore } from '../../store/uiStore';
import { getApiBaseUrl } from '../../config/apiBase';
import {
  getMaintenanceState,
  getMyNotifications,
  getMyAdminNotifications,
  getMyAiFlagNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import classes from './AppShell.module.css';

const AppShell = () => {
  const { isSidebarCollapsed } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const outletMotion = useMemo(() => routeOutletMotion(reduceMotion), [reduceMotion]);
  const user = useAuthStore((s) => s.user);
  const getIdToken = useAuthStore((s) => s.getIdToken);
  const [notifications, setNotifications] = useState([]);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [aiFlagNotifications, setAiFlagNotifications] = useState([]);
  const [maintenance, setMaintenance] = useState(null);
  const [notificationTick, setNotificationTick] = useState(0);
  const [latestNotificationId, setLatestNotificationId] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(
    () => (
      notifications.filter((row) => !row.read).length
      + (isAdmin ? adminNotifications.filter((row) => !row.read).length : 0)
      + (isAdmin ? aiFlagNotifications.filter((row) => !row.read).length : 0)
    ),
    [notifications, adminNotifications, aiFlagNotifications, isAdmin],
  );

  const loadInbox = useCallback(async () => {
    try {
      const out = await getMyNotifications({ limit: 30, scope: 'general' });
      setNotifications(Array.isArray(out?.rows) ? out.rows : []);
      if (user?.role === 'admin') {
        const [adminOut, aiFlagsOut] = await Promise.all([
          getMyAdminNotifications({ limit: 20 }),
          getMyAiFlagNotifications({ limit: 20 }),
        ]);
        setAdminNotifications(Array.isArray(adminOut?.rows) ? adminOut.rows : []);
        setAiFlagNotifications(Array.isArray(aiFlagsOut?.rows) ? aiFlagsOut.rows : []);
      } else {
        setAdminNotifications([]);
        setAiFlagNotifications([]);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  }, [user?.role]);

  const loadMaintenance = useCallback(async () => {
    try {
      const out = await getMaintenanceState();
      setMaintenance(out?.maintenance || null);
    } catch (err) {
      console.error('Failed to load maintenance state', err);
    }
  }, []);

  const markReadInState = useCallback((id) => {
    const patch = (item) => (
      item.id === id ? { ...item, read: true, readAtIso: new Date().toISOString() } : item
    );
    setNotifications((rows) => rows.map(patch));
    setAdminNotifications((rows) => rows.map(patch));
    setAiFlagNotifications((rows) => rows.map(patch));
  }, []);

  const handleMarkRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      markReadInState(id);
    } catch (err) {
      if (err?.status === 404) {
        markReadInState(id);
        return;
      }
      toast.error(err?.message || 'Could not mark notification as read');
    }
  }, [markReadInState]);

  const handleMarkAllRead = useCallback(async (scope = 'general') => {
    try {
      if (scope === 'general') {
        await markAllNotificationsRead({ scope: 'general' });
        setNotifications((rows) => rows.map((item) => ({ ...item, read: true, readAtIso: new Date().toISOString() })));
      }
      if (scope === 'admin' && isAdmin) {
        await markAllNotificationsRead({ scope: 'admin' });
        setAdminNotifications((rows) => rows.map((item) => ({ ...item, read: true, readAtIso: new Date().toISOString() })));
      }
      if (scope === 'ai_flags' && isAdmin) {
        await markAllNotificationsRead({ scope: 'ai_flags' });
        setAiFlagNotifications((rows) => rows.map((item) => ({ ...item, read: true, readAtIso: new Date().toISOString() })));
      }
    } catch (err) {
      toast.error(err?.message || 'Could not mark all as read');
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!user?.uid) return;
    loadInbox();
    loadMaintenance();
  }, [user?.uid, loadInbox, loadMaintenance]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    let cancelled = false;
    let socketInstance = null;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      socketInstance = io(getApiBaseUrl());
      const registerSocket = () => {
        socketInstance.emit('notification:register', { uid: user.uid });
      };
      if (socketInstance.connected) registerSocket();
      socketInstance.on('connect', registerSocket);
      socketInstance.on('notification:new', (payload) => {
        if (!payload) return;
        if (payload.type === 'admin_alert') {
          if (user?.role !== 'admin') return;
          setAdminNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 40));
        } else if (payload.type === 'ai_flag') {
          if (user?.role !== 'admin') return;
          setAiFlagNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 40));
        } else {
          setNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 60));
        }
        setLatestNotificationId(payload.id || null);
        setNotificationTick((n) => n + 1);
        const toastIcon = payload.type === 'admin_alert'
          ? '🛡️'
          : payload.type === 'ai_flag'
            ? '🚩'
            : payload.type === 'contest_credited'
              ? '💰'
              : '🔔';
        toast(payload.title || 'New notification', { icon: toastIcon });
        if (payload.type === 'contest_credited') {
          const balance = Number(payload.walletBalanceCents);
          if (Number.isFinite(balance)) {
            window.dispatchEvent(new CustomEvent('wallet_updated', { detail: balance }));
          } else {
            window.dispatchEvent(new CustomEvent('wallet_updated'));
          }
          window.dispatchEvent(new CustomEvent('contest:resolved', { detail: payload }));
        }
      });
      socketInstance.on('notification:updated', (payload) => {
        if (!payload?.broadcastId) return;
        const patch = (row) => (
          row.broadcastId === payload.broadcastId
            ? {
              ...row,
              title: payload.title ?? row.title,
              body: payload.body ?? row.body,
              priority: payload.priority ?? row.priority,
              expiresAt: payload.expiresAt ?? row.expiresAt,
            }
            : row
        );
        setNotifications((rows) => rows.map(patch));
        setNotificationTick((n) => n + 1);
      });
      socketInstance.on('notification:removed', (payload) => {
        if (!payload?.broadcastId) return;
        setNotifications((rows) => rows.filter((row) => row.broadcastId !== payload.broadcastId));
        setNotificationTick((n) => n + 1);
      });

      // Global listens for flag state changes (since Twilio socket is disconnected when flagged)
      socketInstance.on('agent:flag_lifted', (data) => {
        useAuthStore.getState().setUserField('flagged', false);
        useAuthStore.getState().setUserField('flagReason', null);
        toast.success(data?.message || 'Your account has been resumed. You can now go live!', { duration: 6000 });
        toast.dismiss('account-flagged-toast');
      });

      socketInstance.on('agent:flagged', (data) => {
        useAuthStore.getState().setUserField('flagged', true);
        useAuthStore.getState().setUserField('flagReason', data?.reason || null);
        toast.error(data?.message || 'Your account has been flagged. Contact admin@callsflow.io.', { duration: 5000, id: 'account-flagged-toast' });
      });

      // Suspicious drop pattern warning
      socketInstance.on('agent:suspicious_warning', (data) => {
        useAuthStore.getState().setUserField('suspiciousWarningActive', true);
        toast.error(data?.message || 'Suspicious call drop pattern detected. Warning issued.', { duration: 10000, id: 'suspicious-warning-toast' });
      });

      socketInstance.on('agent:suspicious_warning_cleared', (data) => {
        useAuthStore.getState().setUserField('suspiciousWarningActive', false);
        toast.dismiss('suspicious-warning-toast');
        toast.success(data?.message || 'Your warning has been cleared by an admin.', { duration: 5000 });
      });

      socketInstance.on('agent:forced_offline', (data) => {
        const dialerStore = useDialerStore.getState();
        if (dialerStore.socket?.connected) return;
        if (dialerStore.callState === 'offline' || dialerStore.callState === 'error') return;
        if (typeof dialerStore.goOffline === 'function') {
          dialerStore.goOffline();
        }
        toast.error(
          data?.message || 'You have been taken offline. Please go live again when ready.',
          { duration: Infinity, id: 'forced-offline-toast' }
        );
      });

      socketInstance.on('wallet:updated', (payload) => {
        const balance = Number(payload?.balance);
        if (Number.isFinite(balance)) {
          window.dispatchEvent(new CustomEvent('wallet_updated', { detail: balance }));
        } else {
          window.dispatchEvent(new CustomEvent('wallet_updated'));
        }
      });
      socketInstance.on('maintenance:update', (payload) => {
        setMaintenance(payload || null);
        if (payload?.active) {
          toast(payload.title || 'Maintenance update', { icon: '🛠️' });
        }
      });
    });

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.emit('notification:unregister');
        socketInstance.disconnect();
      }
    };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const isSupportOnly = user.role === 'support';
    const isStaffViewer = user.role === 'support' || user.role === 'admin';
    const store = useSupportChatStore.getState();
    store.setUid(user.uid);
    let cancelled = false;
    (async () => {
      try {
        await store.connect(getIdToken, { isStaffViewer });
        if (!cancelled && !isSupportOnly) {
          await store.loadMine();
        }
        if (!cancelled && isStaffViewer) {
          const { listSupportDeskConversations } = await import('../../services/supportLiveService');
          const out = await listSupportDeskConversations({ status: 'inbox' });
          if (!cancelled) {
            const rows = (out?.rows || []).map((row) => ({
              ...row,
              unreadForSupport: Math.max(
                Number(row.unreadForSupport || 0),
                deskUnreadFromConversation(row),
              ),
            }));
            store.syncDeskUnreadFromRows(rows);
          }
        }
      } catch {
        /* boot soft-fail; popup open path retries */
      }
    })();
    if (!isSupportOnly) {
      import('../../services/supportLiveService').then(({ warmSupportMediaToken }) => {
        warmSupportMediaToken();
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
      useSupportChatStore.getState().disconnect();
    };
  }, [user?.uid, user?.role, getIdToken]);

  // Staff desk badges must work on Analytics too (Inbox page may be unmounted).
  useEffect(() => {
    const isStaffViewer = user?.role === 'support' || user?.role === 'admin';
    if (!isStaffViewer || !user?.uid) return undefined;

    let cancelled = false;
    let detachSocket = null;

    const refreshFromApi = async () => {
      try {
        const { listSupportDeskConversations } = await import('../../services/supportLiveService');
        const out = await listSupportDeskConversations({ status: 'inbox' });
        if (cancelled) return;
        const state = useSupportChatStore.getState();
        const prev = state.deskUnreadById || {};
        const activeId = state._activeDeskConversationId
          ? String(state._activeDeskConversationId)
          : null;
        const rows = (out?.rows || []).map((row) => {
          if (activeId && String(row.id) === activeId) {
            return { ...row, unreadForSupport: 0, clearUnread: true };
          }
          const serverUnread = Math.max(
            Number(row.unreadForSupport || 0),
            deskUnreadFromConversation(row),
          );
          // Once server says read, drop sticky client count for that thread.
          if (serverUnread <= 0) {
            return { ...row, unreadForSupport: 0, clearUnread: true };
          }
          return {
            ...row,
            unreadForSupport: Math.max(
              serverUnread,
              Number(prev[row.id] || prev[String(row.id)] || 0),
            ),
          };
        });
        state.syncDeskUnreadFromRows(rows);
      } catch {
        /* ignore */
      }
    };

    const onMessage = (payload = {}) => {
      const conversation = payload?.conversation;
      const message = payload?.message;
      if (!conversation?.id) return;
      useSupportChatStore.getState().applyDeskInboxUpdate(conversation, {
        fromUserMessage: Boolean(message?.id),
        silent: false,
        messageId: message?.id || null,
      });
    };
    const onInbox = (conversation) => {
      if (!conversation?.id) return;
      useSupportChatStore.getState().applyDeskInboxUpdate(conversation, { silent: true });
    };

    const attach = (socket) => {
      if (!socket) return null;
      socket.on('support:message:new', onMessage);
      socket.on('support:inbox:updated', onInbox);
      return () => {
        socket.off('support:message:new', onMessage);
        socket.off('support:inbox:updated', onInbox);
      };
    };

    detachSocket = attach(useSupportChatStore.getState()._socket);
    let prevSocket = useSupportChatStore.getState()._socket;
    const unsub = useSupportChatStore.subscribe((state) => {
      if (state._socket === prevSocket) return;
      prevSocket = state._socket;
      if (typeof detachSocket === 'function') detachSocket();
      detachSocket = attach(state._socket);
    });

    // Ensure staff socket exists even after HMR wiped the store.
    useSupportChatStore.getState().connect(getIdToken, { isStaffViewer: true })
      .then((socket) => {
        if (cancelled) return;
        if (!detachSocket) detachSocket = attach(socket);
        refreshFromApi();
      })
      .catch(() => {});

    const interval = window.setInterval(refreshFromApi, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshFromApi();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (typeof detachSocket === 'function') detachSocket();
      unsub();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.uid, user?.role, getIdToken]);

  useEffect(() => {
    const isStaffViewer = user?.role === 'support' || user?.role === 'admin';
    if (!isStaffViewer) return undefined;
    const baseTitle = typeof document !== 'undefined' ? document.title : 'CallsFlow';
    const assetUrl = (path) => {
      if (typeof window === 'undefined') return path;
      return new URL(path, window.location.origin).href;
    };
    const onUserMessage = (event) => {
      const detail = event?.detail || {};
      const name = detail.conversation?.userName || detail.conversation?.userEmail || 'User';
      const preview = String(detail.preview || 'New message').slice(0, 72);
      const unreadTotal = Number(useSupportChatStore.getState().deskUnreadTotal || detail.unread || 1);
      const initial = String(name).charAt(0).toUpperCase() || '?';
      const toastId = `support-desk-${detail.conversation?.id || 'msg'}`;

      toast.custom(
        (t) => (
          <button
            type="button"
            className={`${classes.supportToast} ${t.visible ? classes.supportToastIn : classes.supportToastOut}`}
            onClick={() => {
              toast.dismiss(t.id);
              navigate('/app/support-desk/inbox');
            }}
          >
            <span className={classes.supportToastAvatar} aria-hidden="true">{initial}</span>
            <span className={classes.supportToastBody}>
              <span className={classes.supportToastName}>{name}</span>
              <span className={classes.supportToastPreview}>{preview}</span>
            </span>
            <span className={classes.supportToastBadge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
          </button>
        ),
        { duration: 4500, id: toastId },
      );

      if (typeof document !== 'undefined') {
        document.title = `(${unreadTotal}) ${name}`;
        window.setTimeout(() => {
          if (document.title.startsWith('(')) document.title = baseTitle;
        }, 5000);
      }

      // OS notifications only when the tab is in the background (Safari chrome can't be styled).
      if (typeof Notification !== 'undefined' && typeof document !== 'undefined' && document.hidden) {
        const fire = async () => {
          let permission = Notification.permission;
          if (permission === 'default') permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
          const notif = new Notification(name, {
            body: preview,
            icon: assetUrl('/logo.png'),
            badge: assetUrl('/favicon.svg'),
            tag: toastId,
            renotify: true,
          });
          notif.onclick = () => {
            window.focus();
            navigate('/app/support-desk/inbox');
            notif.close();
          };
        };
        fire().catch(() => {});
      }
    };
    window.addEventListener('support-desk:user-message', onUserMessage);
    return () => {
      window.removeEventListener('support-desk:user-message', onUserMessage);
      if (typeof document !== 'undefined' && document.title.startsWith('(')) {
        document.title = baseTitle;
      }
    };
  }, [user?.role, navigate]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const onDeskMedia = location.pathname.startsWith('/app/support-desk/inbox')
      || location.pathname.startsWith('/app/support');
    if (!onDeskMedia) return undefined;
    import('../../services/supportLiveService').then(({ warmSupportMediaToken }) => {
      warmSupportMediaToken();
    }).catch(() => {});
    return undefined;
  }, [user?.uid, location.pathname]);

  useEffect(() => {
    if (user?.role === 'support' && !location.pathname.startsWith('/app/support-desk')) {
      navigate('/app/support-desk/analytics', { replace: true });
    }
  }, [user?.role, location.pathname, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const maintenanceView = useMemo(() => {
    if (!maintenance) return null;
    const startMs = maintenance.startsAt ? new Date(maintenance.startsAt).getTime() : null;
    const endMs = maintenance.endsAt ? new Date(maintenance.endsAt).getTime() : null;
    const isUpcoming = !maintenance.active && startMs && startMs > nowTs;
    const isActive = Boolean(maintenance.active);
    if (!isActive && !isUpcoming) return null;

    const formatAbsolute = (value) => {
      if (!value) return 'TBD';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return 'TBD';
      return dt.toLocaleString();
    };

    const formatDuration = (startValue, endValue) => {
      if (!startValue || !endValue) return 'TBD';
      const diff = new Date(endValue).getTime() - new Date(startValue).getTime();
      if (!Number.isFinite(diff) || diff <= 0) return 'TBD';
      const mins = Math.floor(diff / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h && m) return `${h}h ${m}m`;
      if (h) return `${h}h`;
      return `${m}m`;
    };

    const formatCountdown = (targetMs) => {
      if (!targetMs || targetMs <= nowTs) return '00:00:00';
      const remaining = Math.floor((targetMs - nowTs) / 1000);
      const h = String(Math.floor(remaining / 3600)).padStart(2, '0');
      const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      return `${h}:${m}:${s}`;
    };

    const countdownTarget = isActive ? endMs : startMs;
    return {
      title: maintenance.title || 'Scheduled Maintenance',
      message: maintenance.message?.trim() || '',
      startLabel: formatAbsolute(maintenance.startsAt),
      endLabel: formatAbsolute(maintenance.endsAt),
      downtimeLabel: formatDuration(maintenance.startsAt, maintenance.endsAt),
      countdownLabel: isActive ? 'Ends in' : 'Starts in',
      countdownValue: formatCountdown(countdownTarget),
      active: isActive,
    };
  }, [maintenance, nowTs]);

  return (
    <div className={`${classes.appShell} appAmbient`}>
      <div className={classes.appContainer}>
      <div className={classes.mainLayout}>
        <Sidebar />
        <div className={`${classes.contentWrapper} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
          {maintenanceView ? (
            <div
              className={`${classes.maintenanceBanner} ${maintenanceView.active ? classes.maintenanceActive : classes.maintenanceUpcoming}`}
              role="alert"
              aria-live="polite"
            >
              <div className={classes.maintenanceIcon} aria-hidden="true">
                <Wrench size={18} />
              </div>
              <div className={classes.maintenanceMain}>
                <div className={classes.maintenanceHeadline}>
                  <span className={classes.maintenanceEyebrow}>
                    {maintenanceView.active ? 'Maintenance active' : 'Scheduled maintenance'}
                  </span>
                  <strong>{maintenanceView.title}</strong>
                </div>
                {maintenanceView.message ? (
                  <p className={classes.maintenanceMessage}>{maintenanceView.message}</p>
                ) : null}
              </div>
              <div className={classes.maintenanceMeta}>
                <div className={classes.maintenanceMetaItem}>
                  <span className={classes.maintenanceMetaLabel}>Start</span>
                  <span className={classes.maintenanceMetaValue}>{maintenanceView.startLabel}</span>
                </div>
                <div className={classes.maintenanceMetaItem}>
                  <span className={classes.maintenanceMetaLabel}>End</span>
                  <span className={classes.maintenanceMetaValue}>{maintenanceView.endLabel}</span>
                </div>
                <div className={classes.maintenanceMetaItem}>
                  <span className={classes.maintenanceMetaLabel}>Downtime</span>
                  <span className={classes.maintenanceMetaValue}>{maintenanceView.downtimeLabel}</span>
                </div>
              </div>
              <div className={classes.maintenanceTimer}>
                <span className={classes.maintenanceTimerLabel}>{maintenanceView.countdownLabel}</span>
                <strong className={classes.maintenanceTimerValue}>{maintenanceView.countdownValue}</strong>
              </div>
            </div>
          ) : null}
          <Topbar
            notifications={notifications}
            adminNotifications={adminNotifications}
            aiFlagNotifications={aiFlagNotifications}
            isAdmin={isAdmin}
            unreadCount={unreadCount}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            notificationTick={notificationTick}
            latestNotificationId={latestNotificationId}
          />
          <main className={`${classes.mainContent} ${['/app/support-desk/inbox', '/app/support', '/app/support/email'].includes(location.pathname.replace(/\/+$/, '')) ? classes.mainContentFlush : ''}`}>
            <motion.div
              key={location.pathname}
              style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              {...outletMotion}
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </div>
    </div>
  );
};

export default AppShell;
