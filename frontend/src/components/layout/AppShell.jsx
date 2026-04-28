import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import classes from './AppShell.module.css';

const AppShell = () => {
  const { isSidebarCollapsed } = useUIStore();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [notifications, setNotifications] = useState([]);
  const [maintenance, setMaintenance] = useState(null);
  const unreadCount = useMemo(
    () => notifications.filter((row) => !row.read).length,
    [notifications],
  );

  const loadInbox = useCallback(async () => {
    try {
      const out = await getMyNotifications({ limit: 40 });
      setNotifications(Array.isArray(out?.rows) ? out.rows : []);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  }, []);

  const loadMaintenance = useCallback(async () => {
    try {
      const out = await getMaintenanceState();
      setMaintenance(out?.maintenance || null);
    } catch (err) {
      console.error('Failed to load maintenance state', err);
    }
  }, []);

  const handleMarkRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((rows) => rows.map((item) => (
        item.id === id ? { ...item, read: true, readAtIso: new Date().toISOString() } : item
      )));
    } catch (err) {
      if (err?.status === 404) {
        // If an old/stale notification ID no longer exists, avoid blocking UX.
        setNotifications((rows) => rows.map((item) => (
          item.id === id ? { ...item, read: true, readAtIso: new Date().toISOString() } : item
        )));
        return;
      }
      toast.error(err?.message || 'Could not mark notification as read');
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((rows) => rows.map((item) => ({ ...item, read: true, readAtIso: new Date().toISOString() })));
    } catch (err) {
      toast.error(err?.message || 'Could not mark all as read');
    }
  }, []);

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
      setNotifications((rows) => [{ ...payload, read: false }, ...rows].slice(0, 80));
      toast(payload.title || 'New notification', { icon: '🔔' });
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
  }, [user?.uid]);

  return (
    <div className={classes.appContainer}>
      <div className={classes.mainLayout}>
        <Sidebar />
        <div className={`${classes.contentWrapper} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
          {maintenance?.active ? (
            <div className={classes.maintenanceBanner}>
              <strong>{maintenance.title || 'Maintenance update'}</strong>
              <span>{maintenance.message || 'Scheduled maintenance in progress.'}</span>
            </div>
          ) : null}
          <Topbar
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
          />
          <main className={classes.mainContent}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ width: '100%', height: '100%' }}
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
