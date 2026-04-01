import React from 'react';
import { Search, Calendar, Phone, PhoneMissed, PhoneCall, Edit2 } from 'lucide-react';
import classes from './CallLogsPage.module.css';

const CallLogsPage = () => {
  return (
    <div className={classes.callLogs}>
      <div className={classes.header}>
        <h2>All Call Logs</h2>
        <div className={classes.headerActions}>
          <div className={classes.searchBox}>
            <Search size={16} />
            <input type="text" placeholder="Search by name or phone..." />
          </div>
        </div>
      </div>

      <div className={classes.filters}>
        <button className={classes.dateBtn}>
          <Calendar size={16} /> Date Range
        </button>
        <span className={classes.totalCalls}>0 calls</span>
      </div>

      <div className={classes.logsContainer}>
        <div className={classes.emptyState}>
          No calls yet
        </div>
      </div>
    </div>
  );
};

export default CallLogsPage;
