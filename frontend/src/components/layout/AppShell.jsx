import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { routeOutletMotion } from '../../motion/appMotion';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import useAuthStore from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { getApiBaseUrl } from '../../config/apiBase';
import {
  getMaintenanceState,
  getMyNotifications,
  getMyAdminNotifications,
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
  const [maintenance, setMaintenance] = useState(null);
  const [notificationTick, setNotificationTick] = useState(0);
  const [latestNotificationId, setLatestNotificationId] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const isAdmin = user?.role === 'admin';
  const unreadCount = useMemo(
    () => (
      notifications.filter((row) => !row.read).length
      + (isAdmin ? adminNotifications.filter((row) => !row.read).length : 0)
    ),
    [notifications, adminNotifications, isAdmin],
  );

  const loadInbox = useCallback(async () => {
    try {
      const out = await getMyNotifications({ limit: 30, scope: 'general' });
      setNotifications(Array.isArray(out?.rows) ? out.rows : []);
      if (user?.role === 'admin') {
        const adminOut = await getMyAdminNotifications({ limit: 20 });
        setAdminNotifications(Array.isArray(adminOut?.rows) ? adminOut.rows : []);
      } else {
        setAdminNotifications([]);
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
    socket.on('connect', () => {
      socket.emit('notification:register', { uid: user.uid });
    });
    socket.on('notification:new', (payload) => {
      if (!payload) return;
      if (payload.type === 'admin_alert') {
        if (user?.role !== 'admin') return;
        setAdminNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 40));
      } else {
        setNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 60));
      }
      setLatestNotificationId(payload.id || null);
      setNotificationTick((n) => n + 1);
      const toastIcon = payload.type === 'admin_alert'
        ? '🛡️'
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
      startLabel: formatAbsolute(maintenance.startsAt),
      endLabel: formatAbsolute(maintenance.endsAt),
      downtimeLabel: formatDuration(maintenance.startsAt, maintenance.endsAt),
      countdownLabel: isActive ? 'Ends in' : 'Starts in',
      countdownValue: formatCountdown(countdownTarget),
      active: isActive,
    };
  }, [maintenance, nowTs]);

  return (
    <div className={`${classes.appContainer} appAmbient`}>
      <div className={classes.mainLayout}>
        <Sidebar />
        <div className={`${classes.contentWrapper} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
          {maintenanceView ? (
            <div className={classes.maintenanceBanner}>
              <div className={classes.maintenanceMain}>
                <strong>{maintenanceView.title}</strong>
              </div>
              <div className={classes.maintenanceMeta}>
                <span><b>Start:</b> {maintenanceView.startLabel}</span>
                <span><b>End:</b> {maintenanceView.endLabel}</span>
                <span><b>Downtime:</b> {maintenanceView.downtimeLabel}</span>
              </div>
              <div className={`${classes.maintenanceTimer} ${maintenanceView.active ? classes.activeTimer : ''}`}>
                <span>{maintenanceView.countdownLabel}</span>
                <strong>{maintenanceView.countdownValue}</strong>
              </div>
            </div>
          ) : null}
          <Topbar
            notifications={notifications}
            adminNotifications={adminNotifications}
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
  );
};

export default AppShell;
