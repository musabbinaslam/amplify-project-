import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: '100%', height: '100%' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppShell;
