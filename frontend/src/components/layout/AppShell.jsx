import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Wrench } from 'lucide-react';
import { routeOutletMotion } from '../../motion/appMotion';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import useAuthStore from '../../store/authStore';
import useDialerStore from '../../store/useDialerStore';
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
  const reduceMotion = useReducedMotion();
  const outletMotion = useMemo(() => routeOutletMotion(reduceMotion), [reduceMotion]);
  const user = useAuthStore((s) => s.user);
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
    const socket = io(getApiBaseUrl());
    const registerSocket = () => {
      socket.emit('notification:register', { uid: user.uid });
    };
    if (socket.connected) registerSocket();
    socket.on('connect', registerSocket);
    socket.on('notification:new', (payload) => {
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
    socket.on('notification:updated', (payload) => {
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
    socket.on('notification:removed', (payload) => {
      if (!payload?.broadcastId) return;
      setNotifications((rows) => rows.filter((row) => row.broadcastId !== payload.broadcastId));
      setNotificationTick((n) => n + 1);
    });
    
    // Global listens for flag state changes (since Twilio socket is disconnected when flagged)
    socket.on('agent:flag_lifted', (data) => {
      useAuthStore.getState().setUserField('flagged', false);
      useAuthStore.getState().setUserField('flagReason', null);
      toast.success(data?.message || 'Your account has been resumed. You can now go live!', { duration: 6000 });
      toast.dismiss('account-flagged-toast');
    });
    
    socket.on('agent:flagged', (data) => {
      useAuthStore.getState().setUserField('flagged', true);
      useAuthStore.getState().setUserField('flagReason', data?.reason || null);
      toast.error(data?.message || 'Your account has been flagged. Contact admin@callsflow.io.', { duration: 5000, id: 'account-flagged-toast' });
    });

    // Suspicious drop pattern warning
    socket.on('agent:suspicious_warning', (data) => {
      useAuthStore.getState().setUserField('suspiciousWarningActive', true);
      toast.error(data?.message || 'Suspicious call drop pattern detected. Warning issued.', { duration: 10000, id: 'suspicious-warning-toast' });
    });

    socket.on('agent:suspicious_warning_cleared', (data) => {
      useAuthStore.getState().setUserField('suspiciousWarningActive', false);
      toast.dismiss('suspicious-warning-toast');
      toast.success(data?.message || 'Your warning has been cleared by an admin.', { duration: 5000 });
    });

    // Fallback when dialer socket is disconnected but UI still shows live
    socket.on('agent:forced_offline', (data) => {
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

    socket.on('wallet:updated', (payload) => {
      const balance = Number(payload?.balance);
      if (Number.isFinite(balance)) {
        window.dispatchEvent(new CustomEvent('wallet_updated', { detail: balance }));
      } else {
        window.dispatchEvent(new CustomEvent('wallet_updated'));
      }
    });
    socket.on('maintenance:update', (payload) => {
      setMaintenance(payload || null);
      if (payload?.active) {
        toast(payload.title || 'Maintenance update', { icon: '🛠️' });
      }
    });
    return () => {
      socket.emit('notification:unregister');
      socket.disconnect();
    };
  }, [user?.uid, user?.role]);

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
          <main className={classes.mainContent}>
            <motion.div
              key={location.pathname}
              style={{ width: '100%', height: '100%' }}
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
