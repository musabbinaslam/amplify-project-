import React, { useState, useMemo } from 'react';
import { Search, Calendar, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, ChevronDown } from 'lucide-react';
import classes from './CallLogsPage.module.css';

const MOCK_CALLS = [
  { id: 1, name: 'Martha Johnson', phone: '(305) 555-0142', type: 'inbound', status: 'completed', duration: '12:34', date: '2026-04-02 2:15 PM', script: 'Final Expense', disposition: 'Sold', score: 92 },
  { id: 2, name: 'Robert Williams', phone: '(713) 555-0198', type: 'outbound', status: 'completed', duration: '8:47', date: '2026-04-02 1:30 PM', script: 'Medicare', disposition: 'Callback', score: 78 },
  { id: 3, name: 'Linda Davis', phone: '(469) 555-0233', type: 'inbound', status: 'missed', duration: '0:00', date: '2026-04-02 12:45 PM', script: '—', disposition: 'No Answer', score: null },
  { id: 4, name: 'James Brown', phone: '(832) 555-0177', type: 'outbound', status: 'completed', duration: '18:22', date: '2026-04-01 4:10 PM', script: 'Final Expense', disposition: 'Sold', score: 95 },
  { id: 5, name: 'Patricia Garcia', phone: '(214) 555-0321', type: 'inbound', status: 'completed', duration: '6:15', date: '2026-04-01 3:00 PM', script: 'ACA', disposition: 'Not Interested', score: 65 },
  { id: 6, name: 'Michael Martinez', phone: '(972) 555-0456', type: 'outbound', status: 'completed', duration: '22:08', date: '2026-04-01 1:45 PM', script: 'Final Expense', disposition: 'Sold', score: 88 },
  { id: 7, name: 'Elizabeth Wilson', phone: '(281) 555-0589', type: 'inbound', status: 'missed', duration: '0:00', date: '2026-04-01 11:20 AM', script: '—', disposition: 'No Answer', score: null },
  { id: 8, name: 'David Anderson', phone: '(817) 555-0612', type: 'outbound', status: 'completed', duration: '14:55', date: '2026-03-31 3:30 PM', script: 'Medicare', disposition: 'Callback', score: 72 },
  { id: 9, name: 'Barbara Thomas', phone: '(210) 555-0744', type: 'inbound', status: 'completed', duration: '9:30', date: '2026-03-31 2:00 PM', script: 'Final Expense', disposition: 'Sold', score: 90 },
  { id: 10, name: 'Richard Taylor', phone: '(512) 555-0877', type: 'outbound', status: 'completed', duration: '3:12', date: '2026-03-31 11:15 AM', script: 'ACA', disposition: 'Not Interested', score: 58 },
  { id: 11, name: 'Susan Jackson', phone: '(903) 555-0933', type: 'inbound', status: 'completed', duration: '16:40', date: '2026-03-30 4:45 PM', script: 'Final Expense', disposition: 'Sold', score: 94 },
  { id: 12, name: 'Charles White', phone: '(254) 555-1001', type: 'outbound', status: 'missed', duration: '0:00', date: '2026-03-30 2:30 PM', script: '—', disposition: 'No Answer', score: null },
];

const TYPE_CONFIG = {
  inbound: { icon: PhoneIncoming, label: 'Inbound', cls: 'typeInbound' },
  outbound: { icon: PhoneOutgoing, label: 'Outbound', cls: 'typeOutbound' },
};

const DISPOSITION_CLS = {
  'Sold': 'dispSold',
  'Callback': 'dispCallback',
  'Not Interested': 'dispNotInterested',
  'No Answer': 'dispNoAnswer',
};

const FILTER_OPTIONS = ['All', 'Inbound', 'Outbound', 'Missed'];

const CallLogsPage = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const filtered = useMemo(() => {
    return MOCK_CALLS.filter((c) => {
      const q = search.toLowerCase();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesType =
        typeFilter === 'All' ||
        (typeFilter === 'Missed' ? c.status === 'missed' : c.type === typeFilter.toLowerCase());
      return matchesSearch && matchesType;
    });
  }, [search, typeFilter]);

  const stats = useMemo(() => {
    const total = MOCK_CALLS.length;
    const completed = MOCK_CALLS.filter((c) => c.status === 'completed').length;
    const missed = MOCK_CALLS.filter((c) => c.status === 'missed').length;
    const sold = MOCK_CALLS.filter((c) => c.disposition === 'Sold').length;
    return { total, completed, missed, sold };
  }, []);

  return (
    <div className={classes.callLogs}>
      <div className={classes.header}>
        <div>
          <h2>All Call Logs</h2>
          <p className={classes.subtitle}>Review and manage your recent calls</p>
        </div>
        <div className={classes.searchBox}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={classes.statsRow}>
        <div className={classes.statCard}>
          <Phone size={18} />
          <div>
            <span className={classes.statValue}>{stats.total}</span>
            <span className={classes.statLabel}>Total Calls</span>
          </div>
        </div>
        <div className={classes.statCard}>
          <PhoneIncoming size={18} />
          <div>
            <span className={classes.statValue}>{stats.completed}</span>
            <span className={classes.statLabel}>Completed</span>
          </div>
        </div>
        <div className={classes.statCard}>
          <PhoneMissed size={18} />
          <div>
            <span className={classes.statValue}>{stats.missed}</span>
            <span className={classes.statLabel}>Missed</span>
          </div>
        </div>
        <div className={classes.statCard}>
          <span className={classes.statIcon}>$</span>
          <div>
            <span className={classes.statValue}>{stats.sold}</span>
            <span className={classes.statLabel}>Sold</span>
          </div>
        </div>
      </div>

      <div className={classes.filters}>
        <div className={classes.filterTabs}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              className={`${classes.filterTab} ${typeFilter === opt ? classes.filterActive : ''}`}
              onClick={() => setTypeFilter(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
        <span className={classes.totalCalls}>{filtered.length} calls</span>
      </div>

      <div className={classes.tableWrap}>
        <table className={classes.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Script</th>
              <th>Duration</th>
              <th>Disposition</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((call) => {
              const typeCfg = TYPE_CONFIG[call.type];
              const TypeIcon = typeCfg.icon;
              return (
                <tr key={call.id} className={call.status === 'missed' ? classes.rowMissed : ''}>
                  <td className={classes.nameCell}>{call.name}</td>
                  <td className={classes.phoneCell}>{call.phone}</td>
                  <td>
                    <span className={`${classes.typeBadge} ${classes[typeCfg.cls]}`}>
                      <TypeIcon size={13} />
                      {typeCfg.label}
                    </span>
                  </td>
                  <td>{call.script}</td>
                  <td>
                    <span className={classes.duration}>
                      <Clock size={13} />
                      {call.duration}
                    </span>
                  </td>
                  <td>
                    <span className={`${classes.dispBadge} ${classes[DISPOSITION_CLS[call.disposition]] || ''}`}>
                      {call.disposition}
                    </span>
                  </td>
                  <td>
                    {call.score !== null ? (
                      <span className={`${classes.score} ${call.score >= 80 ? classes.scoreGood : call.score >= 60 ? classes.scoreOk : classes.scoreLow}`}>
                        {call.score}
                      </span>
                    ) : (
                      <span className={classes.scoreDash}>—</span>
                    )}
                  </td>
                  <td className={classes.dateCell}>{call.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={classes.emptyState}>No calls match your search</div>
        )}
      </div>
    </div>
  );
};

export default CallLogsPage;

