import React, { useState, useEffect, useMemo } from 'react';
import { Search, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, DollarSign, Loader, Play } from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import { auth } from '../config/firebase';
import CustomSelect from '../components/ui/CustomSelect';
import classes from './CallLogsPage.module.css';

const FILTER_OPTIONS = ['All', 'Inbound', 'Missed'];

const RecordingModal = ({ recordingUrl, onClose }) => {
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAudio = async () => {
      try {
        setLoading(true);
        const recordingSid = recordingUrl.split('/').pop();
        const token = await auth?.currentUser?.getIdToken();
        const API_URL = import.meta.env.VITE_API_URL || '';
        const cleanApiUrl = API_URL.replace(/\/$/, '');
        const url = `${cleanApiUrl}/api/voice/recording/${recordingSid}?token=${encodeURIComponent(token)}`;
        if (isMounted) setStreamUrl(url);
      } catch (err) {
        console.error('Error loading audio:', err);
        if (isMounted) alert('Failed to load recording. It might still be processing on Twilio.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadAudio();
    return () => { isMounted = false; };
  }, [recordingUrl]);

  return (
    <div className={classes.modalOverlay} onClick={onClose}>
      <div className={classes.modalContent} onClick={e => e.stopPropagation()}>
        <div className={classes.modalHeader}>
          <h3>Call Recording</h3>
          <button className={classes.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div className={classes.modalBody}>
          {loading ? (
             <div className={classes.loadingState}><Loader size={18} className={classes.spinner} /> Loading recording...</div>
          ) : streamUrl ? (
             <audio className={classes.modalAudioPlayer} controls autoPlay src={streamUrl} />
          ) : (
             <div className={classes.errorState}>Could not load playback.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const CallLogsPage = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [callLogs, setCallLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRecordingUrl, setActiveRecordingUrl] = useState(null);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch real call logs from backend
  const fetchLogs = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      let queryUrl = '/api/voice/logs';
      let params = new URLSearchParams();
      
      const now = new Date();
      if (dateFilter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.append('startDate', startOfToday.toISOString());
      } else if (dateFilter === 'last_7') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        params.append('startDate', sevenDaysAgo.toISOString());
      } else if (dateFilter === 'last_30') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        params.append('startDate', thirtyDaysAgo.toISOString());
      } else if (dateFilter === 'custom') {
        if (startDate) params.append('startDate', new Date(startDate).toISOString());
        if (endDate) {
           const endObj = new Date(endDate);
           endObj.setDate(endObj.getDate() + 1);
           params.append('endDate', endObj.toISOString());
        }
      }
      
      const qs = params.toString();
      if (qs) queryUrl += `?${qs}`;

      const data = await apiFetch(queryUrl);
      setCallLogs(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching call logs:', err);
      setError('Failed to load call logs');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
    const interval = setInterval(() => fetchLogs(false), 15000);
    return () => clearInterval(interval);
  }, [dateFilter, startDate, endDate]);

  // Determine call type for display (inbound vs outbound vs transfer)
  const getCallType = (log) => {
    if (log.type === 'Transfer') return 'outbound';
    return 'inbound';
  };

  // Determine status for filtering
  const getCallStatus = (log) => {
    if (log.status === 'missed') return 'missed';
    return 'completed';
  };

  // Determine disposition for display
  const getDisposition = (log) => {
    if (log.isBillable) return 'Sold';
    if (log.status === 'missed') return 'Missed';
    if (log.status === 'completed' && log.duration > 0) return 'Answered';
    return 'No Answer';
  };

  // Format duration from seconds to mm:ss
  const formatDuration = (seconds) => {
    const secs = parseInt(seconds) || 0;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${remainSecs.toString().padStart(2, '0')}`;
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const filtered = useMemo(() => {
    return callLogs.filter((log) => {
      // 1. Search filter
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (log.from || '').toLowerCase().includes(q) ||
        (log.campaignLabel || '').toLowerCase().includes(q) ||
        (log.campaign || '').toLowerCase().includes(q);
        
      // 2. Type/Status filter
      const callType = getCallType(log);
      const callStatus = getCallStatus(log);
      const matchesType =
        typeFilter === 'All' ||
        (typeFilter === 'Missed' ? callStatus === 'missed' : callType === typeFilter.toLowerCase());

      return matchesSearch && matchesType;
    });
  }, [search, typeFilter, callLogs]);

  const stats = useMemo(() => {
    const total = callLogs.length;
    const completed = callLogs.filter((c) => c.status === 'completed').length;
    const missed = callLogs.filter((c) => c.status === 'missed').length;
    const sold = callLogs.filter((c) => c.isBillable).length;
    return { total, completed, missed, sold };
  }, [callLogs]);

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
            placeholder="Search by caller or campaign..."
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
        <div className={classes.filterGroup}>
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

          <div className={classes.dateSwitch}>
            <CustomSelect
              options={[
                { value: 'all_time', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'last_7', label: 'Last 7 Days' },
                { value: 'last_30', label: 'Last 30 Days' },
                { value: 'custom', label: 'Custom Range' }
              ]}
              value={dateFilter}
              onChange={setDateFilter}
            />
            
            {dateFilter === 'custom' && (
              <div className={classes.customDateInputs}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <span>-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <span className={classes.totalCalls}>{filtered.length} calls</span>
      </div>

      <div className={classes.tableWrap}>
        {loading ? (
          <div className={classes.emptyState}>
            <Loader size={20} className={classes.spinner} />
            Loading call logs...
          </div>
        ) : error ? (
          <div className={classes.emptyState}>{error}</div>
        ) : (
          <>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Caller</th>
                  <th>Type</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>Recording</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const callType = getCallType(log);
                  const disposition = getDisposition(log);
                  const isInbound = callType === 'inbound';
                  const TypeIcon = isInbound ? PhoneIncoming : PhoneOutgoing;
                  const typeCls = isInbound ? 'typeInbound' : 'typeOutbound';

                  return (
                    <tr key={log.id} className={log.status === 'missed' ? classes.rowMissed : ''}>
                      <td>
                        <span className={classes.campaignTag}>{log.campaignLabel || log.campaign || '—'}</span>
                      </td>
                      <td className={classes.phoneCell}>
                        {log.isBillable ? log.from : <span className={classes.hiddenPhone}>Hidden</span>}
                      </td>
                      <td>
                        <span className={`${classes.typeBadge} ${classes[typeCls]}`}>
                          <TypeIcon size={13} />
                          {isInbound ? 'Inbound' : 'Transfer'}
                        </span>
                      </td>
                      <td>
                        <span className={classes.duration}>
                          <Clock size={13} />
                          {formatDuration(log.duration)}
                        </span>
                      </td>
                      <td>
                        {log.isBillable ? (
                          <span className={`${classes.dispBadge} ${classes.dispSold}`}>
                            <DollarSign size={12} /> SALE (${log.cost})
                          </span>
                        ) : log.status === 'missed' ? (
                          <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Missed</span>
                        ) : (
                          <span className={`${classes.dispBadge} ${classes.dispAnswered}`}>{disposition}</span>
                        )}
                      </td>
                      <td>
                        {log.cost > 0 ? (
                          <span className={classes.costValue}>${log.cost}</span>
                        ) : (
                          <span className={classes.scoreDash}>—</span>
                        )}
                      </td>
                      <td className={classes.audioCell}>
                        {log.recordingUrl ? (
                          <button 
                            className={classes.loadAudioBtn} 
                            onClick={() => setActiveRecordingUrl(log.recordingUrl)}
                          >
                            <Play size={14} /> Play
                          </button>
                        ) : (
                          <span className={classes.scoreDash}>—</span>
                        )}
                      </td>
                      <td className={classes.dateCell}>{formatDate(log.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className={classes.emptyState}>
                {callLogs.length === 0
                  ? 'No call logs yet. Start taking calls to see your activity here.'
                  : 'No calls match your search'}
              </div>
            )}
          </>
        )}
      </div>

      {activeRecordingUrl && (
        <RecordingModal 
          recordingUrl={activeRecordingUrl} 
          onClose={() => setActiveRecordingUrl(null)} 
        />
      )}
    </div>
  );
};

export default CallLogsPage;

