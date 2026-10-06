/* eslint-disable react/prop-types */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Search, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, DollarSign, Loader, Play, Upload, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../services/apiClient';
import { queryKeys, useCallLogsQuery } from '../queries';
import { updateMyCallLogDisposition } from '../services/profileService';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../motion/appMotion';
import CustomSelect from '../components/ui/CustomSelect';
import PageSkeleton from '../components/ui/PageSkeleton';
import NumberPopIn from '../components/ui/NumberPopIn';
import SlidingTabs from '../components/ui/SlidingTabs';
import ShimmerText from '../components/ui/ShimmerText';
import { CallLogDispositionBadge, CallLogStatusBadge } from '../components/callLogs/CallLogStatusCells';
import { RecordingModal } from '../components/modals/RecordingModal';
import classes from './CallLogsPage.module.css';

const FILTER_OPTIONS = ['All', 'Inbound', 'Missed'];

/** Short table labels — matches Take Calls campaign titles (not pricing subtitles). */
const CAMPAIGN_SHORT_LABELS = {
  fe_inbounds_short: 'FE Inbounds Short',
  fe_tv_calls: 'FE TV Calls',
  medicare_transfers: 'Medicare Transfers',
  medicare_inbound_1: 'Medicare Inbounds (1)',
  medicare_inbound_2: 'Medicare Inbounds (2)',
  aca_transfers: 'ACA Transfers',
};

/** Longer descriptive labels shown on hover. */
const CAMPAIGN_FULL_LABELS = {
  fe_inbounds_short: 'FE Inbounds Short Duration',
  fe_tv_calls: 'High-intent Final Expense TV calls',
  medicare_transfers: 'Live transfer Medicare calls',
  medicare_inbound_1: 'High-intent Medicare inbound calls',
  medicare_inbound_2: 'Standard Medicare inbound calls',
  aca_transfers: 'Live transfer ACA health calls',
};

function getCampaignDisplayLabel(log) {
  const id = log?.campaign;
  if (id && CAMPAIGN_SHORT_LABELS[id]) return CAMPAIGN_SHORT_LABELS[id];
  return log?.campaignLabel || log?.campaign || '—';
}

function getCampaignFullLabel(log) {
  const stored = String(log?.campaignLabel || '').trim();
  const id = log?.campaign;
  const mapped = id ? CAMPAIGN_FULL_LABELS[id] : null;
  if (stored && stored !== CAMPAIGN_SHORT_LABELS[id]) return stored;
  if (mapped) return mapped;
  return stored || log?.campaign || '—';
}

function CampaignTagCell({ log }) {
  const display = getCampaignDisplayLabel(log);
  const full = getCampaignFullLabel(log);
  const showTooltip = full !== display && full !== '—';
  const anchorRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const openTooltip = useCallback(() => {
    if (!showTooltip || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const maxWidth = 280;
    const margin = 8;
    let left = rect.left;
    if (left + maxWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - maxWidth - margin);
    }
    setTooltip({
      text: full,
      left,
      top: rect.bottom + 6,
    });
  }, [full, showTooltip]);

  const closeTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    if (!tooltip) return undefined;
    const onScroll = () => setTooltip(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [tooltip]);

  return (
    <>
      <span className={classes.campaignTagWrap}>
        <span
          ref={anchorRef}
          className={`${classes.campaignTag}${showTooltip ? ` ${classes.campaignTagHoverable}` : ''}`}
          onMouseEnter={openTooltip}
          onMouseLeave={closeTooltip}
          onFocus={openTooltip}
          onBlur={closeTooltip}
        >
          {display}
        </span>
      </span>
      {tooltip && createPortal(
        <div
          className={classes.campaignTooltipFixed}
          style={{ left: tooltip.left, top: tooltip.top }}
          role="tooltip"
        >
          {tooltip.text}
        </div>,
        document.body,
      )}
    </>
  );
}

/* eslint-disable react/prop-types -- local stat card helper */
const StatCard = ({ label, value, icon: Icon, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.statIconBox}>
        <Icon size={18} />
      </div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>
        {typeof value === 'number' || typeof value === 'string' ? (
          <NumberPopIn value={value} />
        ) : (
          value
        )}
      </div>
    </motion.div>
  );
};

const CONTEST_CATEGORIES = [
  { id: 'disconnect', label: 'Call disconnected' },
  { id: 'server_outage', label: 'Server / platform outage' },
  { id: 'audio_quality', label: 'Audio / connection quality' },
  { id: 'other', label: 'Other' },
];

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_PROOF_TOTAL_BYTES = 12 * 1024 * 1024;
const CONTEST_MAX_AGE_HOURS = 24;
const CONTEST_MAX_AGE_MS = CONTEST_MAX_AGE_HOURS * 60 * 60 * 1000;
const CONTEST_WINDOW_LABEL = '24 hours';

function getCallOccurredMs(log) {
  const raw = log?.createdAt || log?.timestamp;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function isWithinContestWindow(log) {
  const occurredMs = getCallOccurredMs(log);
  if (occurredMs == null) return true;
  return Date.now() - occurredMs <= CONTEST_MAX_AGE_MS;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function compressImageForUpload(file, maxBytes = MAX_PROOF_BYTES) {
  if (!file.type?.startsWith('image/') || file.size <= maxBytes) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const maxDim = 1920;
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

    let quality = 0.88;
    let blob = null;
    while (quality >= 0.45) {
      // eslint-disable-next-line no-await-in-loop
      blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
      });
      if (blob && blob.size <= maxBytes) break;
      quality -= 0.1;
    }

    if (blob && blob.size <= maxBytes) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'proof';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareOneProofFile(file) {
  if (file.type?.startsWith('image/')) {
    const compressed = await compressImageForUpload(file);
    if (compressed) return compressed;
    if (file.size > MAX_PROOF_BYTES) {
      throw new Error(`"${file.name}" is too large (${formatBytes(file.size)}). Use a screenshot under ${formatBytes(MAX_PROOF_BYTES)} or a smaller image.`);
    }
    return file;
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error(`"${file.name}" is too large (${formatBytes(file.size)}). PDFs must be under ${formatBytes(MAX_PROOF_BYTES)}.`);
  }
  return file;
}

async function prepareProofFiles(files) {
  const out = await Promise.all(files.slice(0, 3).map((file) => prepareOneProofFile(file)));
  const total = out.reduce((s, f) => s + f.size, 0);
  if (total > MAX_PROOF_TOTAL_BYTES) {
    throw new Error(`Total attachment size is ${formatBytes(total)}. Combined files must be under ${formatBytes(MAX_PROOF_TOTAL_BYTES)}.`);
  }
  return out;
}

const ContestChargeModal = ({ log, onClose, onSubmitted }) => {
  const [category, setCategory] = useState('disconnect');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 3);
    setFiles(picked);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      toast.error('Please explain what happened (at least 10 characters).');
      return;
    }
    if (!isWithinContestWindow(log)) {
      toast.error(`Contests must be submitted within ${CONTEST_WINDOW_LABEL} of the call`);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('reason', trimmed);
      fd.append('category', category);
      if (files.length > 0) {
        const prepared = await prepareProofFiles(files);
        prepared.forEach((f) => fd.append('proof', f));
      }
      await apiFetch(`/api/voice/logs/${encodeURIComponent(log.id)}/contest`, {
        method: 'POST',
        body: fd,
      });
      toast.success('Contest submitted — our team will review it shortly.');
      onSubmitted?.(log.id);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to submit contest', { duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className={classes.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className={classes.contestModal}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div className={classes.contestModalHeader}>
          <h3>Contest call charge</h3>
          <button type="button" className={classes.contestCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </motion.div>
        <p className={classes.contestModalSub}>
          This call was billed at ${Number(log.cost || 0).toFixed(2)}. Contests must be submitted within {CONTEST_WINDOW_LABEL} of the call. Explain what happened (disconnect, outage, etc.). Screenshots or PDFs are optional but helpful. Large images are compressed automatically — max 5 MB per file. We already have the call recording when available.
        </p>
        <form onSubmit={handleSubmit} className={classes.contestForm}>
          <label className={classes.contestLabel}>
            Category
            <select
              className={classes.contestSelect}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CONTEST_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className={classes.contestLabel}>
            What happened?
            <textarea
              className={classes.contestTextarea}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the disconnect or issue..."
              required
            />
          </label>
          <label className={classes.contestLabel}>
            Proof <span className={classes.contestOptional}>(optional, up to 3 files)</span>
            <div className={classes.contestUploadBox}>
              <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} />
              <div className={classes.contestUploadInner}>
                <Upload size={24} className={classes.contestUploadIcon} aria-hidden />
                <span className={classes.contestUploadText}>
                  {files.length ? files.map((f) => f.name).join(', ') : 'PNG, JPG, or PDF (max 5 MB each)'}
                </span>
              </div>
            </div>
          </label>
          <div className={classes.contestActions}>
            <button type="button" className={classes.contestCancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={classes.contestSubmitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit contest'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

function BillingStatusCell({ log, onContest }) {
  if (log.refunded) {
    return <span className={`${classes.dispBadge} ${classes.contestCredited}`}>Credited</span>;
  }
  if (log.contestStatus === 'pending') {
    return <span className={`${classes.dispBadge} ${classes.contestPending}`}>Under review</span>;
  }
  if (log.contestStatus === 'denied') {
    return (
      <span className={`${classes.dispBadge} ${classes.contestDenied}`} title={log.contestDenyNote || 'Contest denied'}>
        <AlertCircle size={12} /> Denied
      </span>
    );
  }
  if (log.isBillable && Number(log.cost || 0) > 0) {
    if (!isWithinContestWindow(log)) {
      return (
        <span
          className={`${classes.dispBadge} ${classes.contestExpired}`}
          title={`Contests must be submitted within ${CONTEST_WINDOW_LABEL} of the call`}
        >
          Window closed
        </span>
      );
    }
    
    if (log.allowRefunds === false) {
      return <span className={classes.scoreDash}>—</span>;
    }

    return (
      <button type="button" className={classes.contestBtn} onClick={() => onContest(log)}>
        Contest charge
      </button>
    );
  }
  return <span className={classes.scoreDash}>—</span>;
}

const EMPTY_LOGS = [];

function buildLogsParams(dateFilter, startDate, endDate) {
  const now = new Date();
  if (dateFilter === 'today') {
    return { startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
  }
  if (dateFilter === 'last_7' || dateFilter === 'last_30') {
    const from = new Date();
    from.setDate(now.getDate() - (dateFilter === 'last_7' ? 7 : 30));
    return { startDate: from.toISOString() };
  }
  if (dateFilter === 'custom') {
    const params = {};
    if (startDate) params.startDate = new Date(startDate).toISOString();
    if (endDate) {
      const endObj = new Date(endDate);
      endObj.setDate(endObj.getDate() + 1);
      params.endDate = endObj.toISOString();
    }
    return params;
  }
  return {};
}

const CallLogsPage = () => {
  const presets = useSubtlePageMotion();
  const location = useLocation();
  const initialSearch = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get('search') || '';
    } catch {
      return '';
    }
  }, [location.search]);
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);
  const [typeFilter, setTypeFilter] = useState('All');
  const [activeRecording, setActiveRecording] = useState(null);
  const [contestLog, setContestLog] = useState(null);
  const [updatingDisposition, setUpdatingDisposition] = useState(null);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const logsParams = useMemo(
    () => buildLogsParams(dateFilter, startDate, endDate),
    [dateFilter, startDate, endDate],
  );
  // Pause background refresh while the recording player is open to avoid re-render jitter.
  const logsQuery = useCallLogsQuery(logsParams, {
    refetchInterval: activeRecording ? false : 30_000,
    refetchOnWindowFocus: !activeRecording,
  });
  const callLogs = logsQuery.data ?? EMPTY_LOGS;
  const initialLoading = logsQuery.isPending;
  const loading = logsQuery.isFetching && logsQuery.isPlaceholderData;
  const error = logsQuery.isError && !logsQuery.data ? 'Failed to load call logs' : null;

  const queryClient = useQueryClient();
  const patchLog = useCallback((logId, patch) => {
    queryClient.setQueryData(queryKeys.callLogs(logsParams), (prev) => (
      Array.isArray(prev) ? prev.map((row) => (row.id === logId ? { ...row, ...patch } : row)) : prev
    ));
  }, [queryClient, logsParams]);

  const handleDispositionUpdate = async (logId, newDisposition) => {
    setUpdatingDisposition(logId);
    try {
      await updateMyCallLogDisposition(logId, newDisposition);
      patchLog(logId, { disposition: newDisposition });
      toast.success('Disposition updated');
    } catch {
      toast.error('Failed to update disposition');
    } finally {
      setUpdatingDisposition(null);
    }
  };

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

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const handleContestSubmitted = (callLogId) => {
    patchLog(callLogId, { contestStatus: 'pending' });
  };

  if (initialLoading) return <PageSkeleton variant="table" rows={10} />;

  return (
    <>
    <motion.div
      className={classes.callLogs}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.header} variants={presets.child}>
        <div>
          <div className={classes.titleRow}>
            <h2>All Call Logs</h2>
            <span className={classes.liveBadge}>
              <span className={classes.liveDot} />
              <ShimmerText text="Live Sync" variant="brand" />
            </span>
          </div>
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
      </motion.div>

      <motion.div className={classes.statsRow} variants={presets.statsStrip}>
        <StatCard label="Total Calls" value={stats.total} icon={Phone} variants={presets.child} />
        <StatCard label="Completed" value={stats.completed} icon={PhoneIncoming} variants={presets.child} />
        <StatCard label="Missed" value={stats.missed} icon={PhoneMissed} variants={presets.child} />
        <StatCard label="Sold" value={stats.sold} icon={DollarSign} variants={presets.child} />
      </motion.div>

      <motion.div className={classes.filters} variants={presets.child}>
        <div className={classes.filterGroup}>
          <SlidingTabs
            tabs={FILTER_OPTIONS}
            activeKey={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Filter calls by type"
          />

          <div className={classes.dateSwitch}>
            <CustomSelect
              className={classes.dateSelect}
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
      </motion.div>

      <motion.div className={`glass ${classes.tableWrap}`} variants={presets.child}>
        {loading ? (
          <div className={classes.emptyState}>
            <Loader size={20} className={classes.spinner} />
            <ShimmerText text="Loading call logs…" />
          </div>
        ) : error ? (
          <div className={classes.emptyState}>{error}</div>
        ) : (
          <>
            <div className={classes.tableScroll}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th className={classes.colCampaign}>Campaign</th>
                  <th className={classes.colCaller}>Caller</th>
                  <th className={classes.colType}>Type</th>
                  <th className={classes.colDuration}>Duration</th>
                  <th className={classes.colStatus}>Status</th>
                  <th className={classes.colDisposition}>Disposition</th>
                  <th className={classes.colCost}>Cost</th>
                  <th className={classes.colBilling}>Billing</th>
                  <th className={classes.colRecording}>Recording</th>
                  <th className={classes.colDate}>Date</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => {
                  const callType = getCallType(log);
                  const isInbound = callType === 'inbound';
                  const TypeIcon = isInbound ? PhoneIncoming : PhoneOutgoing;
                  const typeCls = isInbound ? 'typeInbound' : 'typeOutbound';

                  return (
                    <tr key={log.id} className={log.status === 'missed' ? classes.rowMissed : ''}>
                      <td className={classes.colCampaign}>
                        <CampaignTagCell log={log} />
                      </td>
                      <td className={`${classes.phoneCell} ${classes.colCaller}`}>
                        {log.isBillable ? log.from : <span className={classes.hiddenPhone}>Hidden</span>}
                      </td>
                      <td className={classes.colType}>
                        <span className={`${classes.typeBadge} ${classes[typeCls]}`}>
                          <TypeIcon size={13} />
                          {isInbound ? 'Inbound' : 'Transfer'}
                        </span>
                      </td>
                      <td className={classes.colDuration}>
                        <span className={classes.duration}>
                          <Clock size={13} />
                          {formatDuration(log.duration)}
                        </span>
                      </td>
                      <td className={classes.colStatus}>
                        <div className={classes.statusCell}>
                          <CallLogStatusBadge log={log} />
                        </div>
                      </td>
                      <td className={classes.colDisposition}>
                        <div className={classes.statusCell}>
                          <CallLogDispositionBadge 
                            log={log} 
                            editable={true} 
                            loading={updatingDisposition === log.id}
                            onUpdate={handleDispositionUpdate}
                          />
                        </div>
                      </td>
                      <td className={classes.colCost}>
                        {log.cost > 0 ? (
                          <span className={classes.costValue}>
                            ${log.cost}
                            {log.refunded ? ' (credited)' : ''}
                          </span>
                        ) : (
                          <span className={classes.scoreDash}>—</span>
                        )}
                      </td>
                      <td className={classes.colBilling}>
                        <BillingStatusCell log={log} onContest={setContestLog} />
                      </td>
                      <td className={`${classes.audioCell} ${classes.colRecording}`}>
                        {(log.recordingSid || log.recordingUrl) ? (
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
                      <td className={`${classes.dateCell} ${classes.colDate}`}>{formatDate(log.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
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
      </motion.div>
    </motion.div>

      {activeRecording && (
        <RecordingModal
          log={activeRecording}
          onClose={() => setActiveRecording(null)}
        />
      )}
      {contestLog && (
        <ContestChargeModal
          log={contestLog}
          onClose={() => setContestLog(null)}
          onSubmitted={handleContestSubmitted}
        />
      )}
    </>
  );
};

export default CallLogsPage;

