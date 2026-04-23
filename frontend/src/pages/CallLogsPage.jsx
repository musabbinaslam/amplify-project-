import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, DollarSign, Loader, Play, Pause, Pencil, SkipBack, SkipForward, Volume2, VolumeX, Download } from 'lucide-react';
import { apiFetch } from '../services/apiClient';
import { auth } from '../config/firebase';
import CustomSelect from '../components/ui/CustomSelect';
import PageLoader from '../components/ui/PageLoader';
import classes from './CallLogsPage.module.css';

const FILTER_OPTIONS = ['All', 'Inbound', 'Missed'];

function extractRecordingSid(recordingUrl) {
  const value = String(recordingUrl || '').trim();
  if (!value) return '';
  const match = value.match(/(RE[0-9a-fA-F]{32})/);
  if (match?.[1]) return match[1];
  // Fallback for non-standard values
  const cleanTail = value.split('?')[0].split('/').pop() || '';
  return cleanTail.replace(/\.(json|mp3)$/i, '');
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 0.75];

function formatClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatRecordingDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const RecordingModal = ({ log, onClose }) => {
  const recordingUrl = log?.recordingUrl;

  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadAudio = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        const recordingSid = extractRecordingSid(recordingUrl);
        if (!recordingSid) {
          throw new Error('Invalid recording SID');
        }
        const token = await auth?.currentUser?.getIdToken();
        const API_URL = import.meta.env.VITE_API_URL || '';
        const cleanApiUrl = API_URL.replace(/\/$/, '');
        const url = `${cleanApiUrl}/api/voice/recording/${recordingSid}?token=${encodeURIComponent(token)}`;
        if (isMounted) setStreamUrl(url);
      } catch (err) {
        console.error('Error loading audio:', err);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadAudio();
    return () => { isMounted = false; };
  }, [recordingUrl]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const seekTo = useCallback((secs) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(secs)) return;
    const clamped = Math.max(0, Math.min(secs, el.duration || 0));
    el.currentTime = clamped;
    setCurrent(clamped);
  }, []);

  const skip = useCallback((delta) => {
    const el = audioRef.current;
    if (!el) return;
    seekTo((el.currentTime || 0) + delta);
  }, [seekTo]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const changeVolume = useCallback((v) => {
    const n = Math.max(0, Math.min(1, Number(v) || 0));
    setVolume(n);
    if (audioRef.current) {
      audioRef.current.volume = n;
      if (n > 0 && muted) {
        audioRef.current.muted = false;
        setMuted(false);
      }
    }
  }, [muted]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skip(5);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, toggleMute, onClose]);

  const callerDisplay = log?.isBillable
    ? (log?.from || 'Unknown caller')
    : (log?.from ? 'Hidden caller' : 'Unknown caller');
  const campaignDisplay = log?.campaignLabel || log?.campaign || 'Call Recording';
  const dateDisplay = formatRecordingDate(log?.timestamp || log?.createdAt);

  const playedPct = total > 0 ? (current / total) * 100 : 0;
  const bufferedPct = total > 0 ? (buffered / total) * 100 : 0;

  return (
    <div
      className={classes.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recordingTitle"
    >
      <div className={classes.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={classes.recordingHeader}>
          <div className={classes.recordingHeaderMain}>
            <h3 id="recordingTitle" className={classes.recordingTitle}>{callerDisplay}</h3>
            <span className={classes.recordingCampaign}>{campaignDisplay}</span>
          </div>
          <div className={classes.recordingHeaderRight}>
            {dateDisplay && <span className={classes.recordingDate}>{dateDisplay}</span>}
            <button className={classes.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className={classes.recordingBody}>
          {loading ? (
            <div className={classes.loadingState}>
              <Loader size={18} className={classes.spinner} /> Loading recording...
            </div>
          ) : loadError || !streamUrl ? (
            <div className={classes.errorState}>
              Could not load playback. The recording may still be processing.
            </div>
          ) : (
            <>
              <audio
                ref={audioRef}
                src={streamUrl}
                preload="metadata"
                autoPlay
                style={{ display: 'none' }}
                onLoadedMetadata={(e) => setTotal(e.currentTarget.duration || 0)}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
                onProgress={(e) => {
                  const b = e.currentTarget.buffered;
                  if (b && b.length > 0) {
                    setBuffered(b.end(b.length - 1));
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  setCurrent(0);
                }}
                onVolumeChange={(e) => {
                  setVolume(e.currentTarget.volume);
                  setMuted(e.currentTarget.muted);
                }}
                onError={() => setLoadError(true)}
              />

              <div
                className={`${classes.eqRow} ${playing ? '' : classes.eqPaused}`}
                aria-hidden="true"
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={classes.eqBar}
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>

              <div
                className={classes.scrubber}
                style={{
                  '--played-pct': `${playedPct}%`,
                  '--buffered-pct': `${bufferedPct}%`,
                }}
              >
                <input
                  type="range"
                  className={classes.scrubberInput}
                  min={0}
                  max={Math.max(total, 0.0001)}
                  step={0.1}
                  value={Math.min(current, total || 0)}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={total || 0}
                  aria-valuenow={current}
                />
              </div>

              <div className={classes.timeRow}>
                <span>{formatClock(current)}</span>
                <span>{formatClock(total)}</span>
              </div>

              <div className={classes.controlsRow}>
                <button
                  type="button"
                  className={classes.skipBtn}
                  onClick={() => skip(-10)}
                  aria-label="Rewind 10 seconds"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className={classes.playBtn}
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
                </button>
                <button
                  type="button"
                  className={classes.skipBtn}
                  onClick={() => skip(10)}
                  aria-label="Forward 10 seconds"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              <div className={classes.footerRow}>
                <button
                  type="button"
                  className={classes.speedPill}
                  onClick={cycleSpeed}
                  aria-label={`Playback speed ${speed}x`}
                  title="Playback speed"
                >
                  {speed}x
                </button>

                <div className={classes.volumeWrap}>
                  <button
                    type="button"
                    className={classes.volumeBtn}
                    onClick={toggleMute}
                    aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
                  >
                    {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    className={classes.volumeInput}
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(e.target.value)}
                    aria-label="Volume"
                    style={{ '--volume-pct': `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>

                <a
                  className={classes.downloadBtn}
                  href={streamUrl}
                  download={`recording-${extractRecordingSid(recordingUrl) || 'call'}.mp3`}
                  aria-label="Download recording"
                  title="Download"
                >
                  <Download size={16} />
                </a>
              </div>
            </>
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
    // Avoid re-render jitter while user is interacting with the audio controls.
    if (activeRecording) return undefined;
    const interval = setInterval(() => fetchLogs(false), 15000);
    return () => clearInterval(interval);
  }, [dateFilter, startDate, endDate, activeRecording]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, dateFilter, startDate, endDate]);

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

  // Determine disposition for display.
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
    const sold = callLogs.filter((c) => c.disposition === 'sold').length;
    return { total, completed, missed, sold };
  }, [callLogs]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  if (initialLoading) return <PageLoader />;

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
                {paginatedLogs.map((log) => {
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
                        <div className={classes.statusCell}>
                          {log.disposition === 'sold' ? (
                            <span className={`${classes.dispBadge} ${classes.dispSold}`}>
                              <DollarSign size={12} /> SOLD {log.saleAmount ? `($${Number(log.saleAmount).toFixed(0)})` : ''}
                            </span>
                          ) : log.disposition === 'callback' ? (
                            <span className={`${classes.dispBadge} ${classes.dispAnswered}`}>Callback</span>
                          ) : log.disposition === 'not_interested' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Not Interested</span>
                          ) : log.disposition === 'no_answer' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>No Answer</span>
                          ) : log.status === 'missed' ? (
                            <span className={`${classes.dispBadge} ${classes.dispMissed}`}>Missed</span>
                          ) : (
                            <span className={`${classes.dispBadge} ${classes.dispAnswered}`}>{disposition}</span>
                          )}
                        </div>
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
                            onClick={() => setActiveRecording(log)}
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

            {filtered.length > 0 && (
              <div className={classes.pagination}>
                <button
                  className={classes.pageBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className={classes.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className={classes.pageBtn}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
                <div style={{ marginLeft: '1rem', width: '130px' }}>
                  <CustomSelect
                    options={[
                      { value: 10, label: '10 per page' },
                      { value: 20, label: '20 per page' }
                    ]}
                    value={itemsPerPage}
                    onChange={(val) => {
                      setItemsPerPage(Number(val));
                      setCurrentPage(1);
                    }}
                    menuAlign="top"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {activeRecording && (
        <RecordingModal 
          log={activeRecording} 
          onClose={() => setActiveRecording(null)} 
        />
      )}
    </div>
  );
};

export default CallLogsPage;

