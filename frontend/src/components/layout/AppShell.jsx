import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AnnouncementBanner from './AnnouncementBanner';
import { useUIStore } from '../../store/uiStore';
import classes from './AppShell.module.css';

const AppShell = () => {
  const { isSidebarCollapsed } = useUIStore();

  return (
    <div className={classes.appContainer}>
      <AnnouncementBanner />
      <div className={classes.mainLayout}>
        <Sidebar />
        <div className={`${classes.contentWrapper} ${isSidebarCollapsed ? classes.collapsed : ''}`}>
          <Topbar />
          <main className={classes.mainContent}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppShell;
