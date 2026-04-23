import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useUIStore } from '../../store/uiStore';
import classes from './AppShell.module.css';

const AppShell = () => {
  const { isSidebarCollapsed } = useUIStore();
  const location = useLocation();

  return (
    <div className={classes.appContainer}>
      <div className={classes.mainLayout}>
        <Sidebar />
        <div className={`${classes.contentWrapper} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
          <Topbar />
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
