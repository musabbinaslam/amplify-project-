import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Flag,
  AudioLines,
  Loader,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminActionModal } from './ContestReviewCard';
import AiFlagReviewCard from './AiFlagReviewCard';
import QaAiStatusBanner from './QaAiStatusBanner';
import { RecordingModal } from '../../pages/CallLogsPage';
import classes from './adminShared.module.css';

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { id: 'pending_review', label: 'Needs review' },
  { id: 'processing', label: 'Analyzing' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'clear', label: 'Clear' },
];

function outcomeToast(lastReview) {
  const status = lastReview?.status;
  const source = lastReview?.source;
  const summary = String(lastReview?.summary || '').trim();
  const violations = Number(lastReview?.violationCount || 0);

  if (source === 'billing') {
    toast.error(summary || 'Gemini credits depleted — analysis stopped.');
    return 'clear';
  }
  if (source === 'quota') {
    toast.error(summary || 'Gemini rate limit hit. Wait a minute, then retry.');
    return 'clear';
  }
  if (source === 'fallback' || source === 'no_recording' || source === 'recording_fetch_failed' || source === 'mock_call') {
    toast.error(summary || 'Analysis failed before Gemini could score the call.');
    return 'clear';
  }
  if (status === 'pending_review') {
    toast.success(
      violations > 0
        ? `Gemini finished — ${violations} possible violation${violations === 1 ? '' : 's'} need review.`
        : 'Gemini finished — flagged for review.',
    );
    return 'pending_review';
  }
  if (status === 'clear' && source === 'gemini_audio') {
    toast.success(summary ? `Gemini finished — clear. ${summary.slice(0, 120)}` : 'Gemini finished — no rule violations.');
    return 'clear';
  }
  if (status === 'clear') {
    toast(summary || `Gemini finished with status clear (${source || 'unknown'}).`);
    return 'clear';
  }
  toast.success(`Gemini finished — ${status || 'done'}.`);
  return status || 'pending_review';
}

function emptyCopy(statusFilter, { showLiveBar, emptyHint }) {
  if (showLiveBar) {
    return {
      title: 'Analysis in progress',
      body: 'Waiting for Gemini to finish. Results will appear here automatically.',
    };
  }
  if (statusFilter === 'pending_review') {
    return {
      title: 'No flags waiting',
      body: emptyHint || 'Eligible calls (buffer +10–15s) analyze automatically when they end.',
    };
  }
  if (statusFilter === 'processing') {
    return { title: 'Nothing analyzing', body: 'Live eligible calls show here while Gemini listens.' };
  }
  if (statusFilter === 'confirmed') {
    return { title: 'No confirmed flags', body: 'Confirmed violations will list here.' };
  }
  if (statusFilter === 'dismissed') {
    return { title: 'No dismissed flags', body: 'False positives you dismiss will list here.' };
  }
  if (statusFilter === 'clear') {
    return { title: 'No clear results', body: 'Calls Gemini marked clear appear here.' };
  }
  return { title: 'No flags', body: emptyHint };
}

/* eslint-disable react/prop-types */
export default function QaReviewQueuePanel({
  listReviews,
  confirmReview,
  dismissReview,
  fetchStatus,
  startBackfill = null,
  reanalyzeReview = null,
  reanalyzeBatch = null,
  emptyHint = 'Pending AI flags will appear here.',
  aiFlagsEnabled = true,
}) {
  const [reviews, setReviews] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activeRecording, setActiveRecording] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [backfillLimit, setBackfillLimit] = useState(1);
  const [forceReanalyze, setForceReanalyze] = useState(false);
  const [catchUpOpen, setCatchUpOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [watch, setWatch] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const announcedRef = useRef(false);
  const catchUpRef = useRef(null);
  const statusFilterRef = useRef(statusFilter);
  const pageRef = useRef(page);
  statusFilterRef.current = statusFilter;
  pageRef.current = page;

  const aiOff = aiFlagsEnabled === false
    || pipelineStatus?.aiFlagsGeminiEnabled === false
    || pipelineStatus?.state === 'disabled';
  const analysisLocked = backfilling || Boolean(watch) || aiOff;

  const reviewKey = (row) => `${row.agentId}|${row.callLogId || row.id}`;

  const selectableReviews = reviews.filter((row) => {
    const status = row?.qaAudioReview?.status || row?.status;
    return status === 'clear' && (row.recordingSid || row.recordingUrl);
  });
  const selectionEnabled = Boolean(reanalyzeBatch) && statusFilter === 'clear';
  const selectedCount = selectedKeys.size;
  const allSelectableSelected = selectionEnabled
    && selectableReviews.length > 0
    && selectableReviews.every((row) => selectedKeys.has(reviewKey(row)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = total === 0 ? 0 : ((safePage - 1) * PAGE_SIZE) + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, total);

  const loadReviews = useCallback(async (status, pageNum = 1, { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const out = await listReviews(status, PAGE_SIZE, pageNum);
      const nextReviews = out.reviews || [];
      const nextTotal = Number(out.total ?? nextReviews.length) || 0;
      const nextPages = Math.max(1, Number(out.totalPages) || Math.ceil(nextTotal / PAGE_SIZE) || 1);
      const nextPage = Math.min(Math.max(1, Number(out.page) || pageNum), nextPages);
      setReviews(nextReviews);
      setTotal(nextTotal);
      setTotalPages(nextPages);
      setPage(nextPage);
      return nextReviews;
    } catch (e) {
      if (!quiet) toast.error(e.message || 'Failed to load AI flags');
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [listReviews]);

  useEffect(() => {
    loadReviews('pending_review', 1);
  }, [loadReviews]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!catchUpOpen) return undefined;
    const onPointer = (event) => {
      if (catchUpRef.current && !catchUpRef.current.contains(event.target)) {
        setCatchUpOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setCatchUpOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [catchUpOpen]);

  useEffect(() => {
    if (aiOff) setCatchUpOpen(false);
  }, [aiOff]);

  useEffect(() => {
    if (!watch) return undefined;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [watch]);

  useEffect(() => {
    if (!watch) return undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || announcedRef.current) return;

      let st = null;
      if (fetchStatus) {
        try {
          st = await fetchStatus();
          if (!cancelled) setPipelineStatus(st);
        } catch {
          st = null;
        }
      }

      const filter = statusFilterRef.current;
      await loadReviews(filter === 'processing' ? 'processing' : filter, pageRef.current, { quiet: true });
      if (cancelled || announcedRef.current) return;

      const analyzing = (st?.counts?.processing || 0) > 0;
      if (analyzing) return;

      if (Date.now() - watch.startedAt < 2500) return;

      if (st?.lastReview) {
        announcedRef.current = true;
        const nextFilter = outcomeToast(st.lastReview);
        setWatch(null);
        setStatusFilter(nextFilter);
        await loadReviews(nextFilter, 1, { quiet: true });
        return;
      }

      announcedRef.current = true;
      setWatch(null);
      setStatusFilter('clear');
      await loadReviews('clear', 1, { quiet: true });
      toast.success('Analysis finished. Check Clear or Needs review for the result.');
    };

    void tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watch, loadReviews, fetchStatus]);

  useEffect(() => {
    if (watch) return undefined;
    if (statusFilter !== 'processing' && !(pipelineStatus?.counts?.processing > 0)) return undefined;
    const id = window.setInterval(() => {
      void loadReviews(statusFilterRef.current, pageRef.current, { quiet: true });
    }, 3000);
    return () => window.clearInterval(id);
  }, [watch, statusFilter, pipelineStatus?.counts?.processing, loadReviews]);

  const openConfirm = (review) => {
    setActionNote('');
    setActionModal({
      type: 'confirm_qa_flag',
      context: { review, agentName: review.agentName || review.agentId },
    });
  };

  const openDismiss = (review) => {
    setActionNote('');
    setActionModal({
      type: 'dismiss_qa_flag',
      context: { review, agentName: review.agentName || review.agentId },
    });
  };

  const selectTab = (id) => {
    setStatusFilter(id);
    void loadReviews(id, 1);
  };

  const runBackfill = async () => {
    if (!startBackfill || analysisLocked) return;
    setBackfilling(true);
    try {
      const out = await startBackfill({
        limit: backfillLimit,
        force: forceReanalyze,
        fromClear: forceReanalyze,
      });
      if (out?.started) {
        announcedRef.current = false;
        setWatch({
          queued: out.queued || 1,
          startedAt: Date.now(),
          sampleDurationSec: out.sampleDurationSec,
        });
        setStatusFilter('processing');
        setCatchUpOpen(false);
        toast.success(out.message || `Queued ${out.queued} recording${out.queued === 1 ? '' : 's'}`);
        await loadReviews('processing', 1, { quiet: true });
      } else {
        toast(out?.message || 'No eligible recordings left to analyze');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to start analysis');
    } finally {
      setBackfilling(false);
    }
  };

  const runReanalyzeOne = async (review) => {
    if (!reanalyzeReview || analysisLocked) return;
    setBackfilling(true);
    try {
      const out = await reanalyzeReview(review.agentId, review.callLogId || review.id);
      if (out?.started) {
        announcedRef.current = false;
        setWatch({
          queued: 1,
          startedAt: Date.now(),
          sampleDurationSec: out.sampleDurationSec,
        });
        setSelectedKeys(new Set());
        setStatusFilter('processing');
        toast.success(out.message || 'Re-analyzing this call');
        await loadReviews('processing', 1, { quiet: true });
      } else {
        toast(out?.message || 'Could not re-analyze this call');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to re-analyze call');
    } finally {
      setBackfilling(false);
    }
  };

  const toggleSelected = (row) => {
    const key = reviewKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(selectableReviews.map(reviewKey)));
  };

  const runReanalyzeSelected = async () => {
    if (!reanalyzeBatch || analysisLocked || selectedCount < 1) return;
    const items = reviews
      .filter((row) => selectedKeys.has(reviewKey(row)))
      .map((row) => ({
        agentId: row.agentId,
        callLogId: row.callLogId || row.id,
      }));
    if (!items.length) {
      toast.error('Select at least one Clear call');
      return;
    }

    setBackfilling(true);
    try {
      const out = await reanalyzeBatch(items);
      if (out?.started) {
        announcedRef.current = false;
        setWatch({
          queued: out.queued || items.length,
          startedAt: Date.now(),
          sampleDurationSec: out.sampleDurationSec,
        });
        setSelectedKeys(new Set());
        setStatusFilter('processing');
        toast.success(out.message || `Re-analyzing ${items.length} calls`);
        await loadReviews('processing', 1, { quiet: true });
      } else {
        toast(out?.message || 'Could not re-analyze selected calls');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to re-analyze selected calls');
    } finally {
      setBackfilling(false);
    }
  };

  const submitActionModal = async () => {
    const trimmed = actionNote.trim();
    if (trimmed.length < 10) {
      toast.error('Note must be at least 10 characters');
      return;
    }
    if (!actionModal) return;
    const review = actionModal.context?.review;
    if (!review) return;

    setActionSubmitting(true);
    try {
      if (actionModal.type === 'confirm_qa_flag') {
        await confirmReview(review.agentId, review.callLogId || review.id, trimmed);
        toast.success('Flag confirmed — agent account flagged');
      } else {
        await dismissReview(review.agentId, review.callLogId || review.id, trimmed);
        toast.success('Flag dismissed');
      }
      setExpandedId(null);
      setActionModal(null);
      setActionNote('');
      void loadReviews(statusFilter, page);
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionSubmitting(false);
    }
  };

  const goToPage = (nextPage) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    if (clamped === page) return;
    setSelectedKeys(new Set());
    void loadReviews(statusFilter, clamped);
  };

  const analyzingCount = pipelineStatus?.counts?.processing
    ?? reviews.filter((r) => r?.qaAudioReview?.status === 'processing').length;
  const pendingCount = pipelineStatus?.counts?.pending ?? 0;
  const showLiveBar = Boolean(watch) || analyzingCount > 0;
  const elapsedSec = watch?.startedAt
    ? Math.max(0, Math.floor((nowTick - watch.startedAt) / 1000))
    : null;
  const empty = emptyCopy(statusFilter, { showLiveBar, emptyHint });

  const tabBadge = (id) => {
    if (id === 'pending_review') return pendingCount;
    if (id === 'processing') return analyzingCount;
    if (id === statusFilter) return total;
    return null;
  };

  return (
    <div className={classes.qaPage}>
      {fetchStatus ? (
        <QaAiStatusBanner
          fetchStatus={fetchStatus}
          pollMs={showLiveBar ? 2000 : 8000}
          onStatus={setPipelineStatus}
          reloadToken={aiFlagsEnabled ? 'on' : 'off'}
        />
      ) : null}

      <section className={`glass ${classes.qaQueueCard}`}>
        <div className={classes.qaToolbar}>
          <div className={classes.qaTabs} role="tablist" aria-label="Flag status">
            {STATUS_TABS.map((tab) => {
              const badge = tabBadge(tab.id);
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`${classes.qaTab} ${active ? classes.qaTabActive : ''}`}
                  onClick={() => selectTab(tab.id)}
                >
                  {tab.label}
                  {badge != null && badge > 0 ? (
                    <span className={classes.qaTabBadge}>{badge > 99 ? '99+' : badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className={classes.qaToolbarActions}>
            <button
              type="button"
              className={classes.qaIconBtn}
              onClick={() => loadReviews(statusFilter, page)}
              aria-label="Refresh flags"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? classes.spin : ''} />
            </button>
            {startBackfill ? (
              <div className={classes.qaCatchUpWrap} ref={catchUpRef}>
                <button
                  type="button"
                  className={`${classes.qaCatchUpBtn} ${catchUpOpen ? classes.qaCatchUpBtnOpen : ''}`}
                  aria-expanded={catchUpOpen}
                  disabled={aiOff}
                  title={aiOff ? 'Turn on AI Flags to analyze calls' : 'Analyze missed eligible recordings'}
                  onClick={() => { if (!aiOff) setCatchUpOpen((v) => !v); }}
                >
                  <AudioLines size={14} />
                  Catch up
                </button>
                {catchUpOpen ? (
                  <div className={classes.qaCatchUpPanel}>
                    <p className={classes.qaCatchUpHint}>
                      Only calls in each campaign’s buffer +10–15s window. New matching calls still run automatically.
                    </p>
                    <div className={classes.qaBackfillRow}>
                      <select
                        id="qa-backfill-limit"
                        className={classes.select}
                        value={backfillLimit}
                        disabled={analysisLocked}
                        onChange={(e) => setBackfillLimit(Number(e.target.value))}
                        aria-label="How many calls to analyze"
                      >
                        <option value={1}>1 call</option>
                        <option value={3}>3 calls</option>
                        <option value={10}>10 calls</option>
                      </select>
                      <label className={classes.qaForceLabel}>
                        <input
                          type="checkbox"
                          checked={forceReanalyze}
                          disabled={analysisLocked}
                          onChange={(e) => setForceReanalyze(e.target.checked)}
                        />
                        Include previously Clear
                      </label>
                      <button
                        type="button"
                        className={classes.primaryBtn}
                        disabled={analysisLocked}
                        onClick={runBackfill}
                      >
                        <AudioLines size={16} className={backfilling || watch ? classes.spin : ''} />
                        {backfilling ? 'Scanning…' : watch ? 'Analyzing…' : 'Run'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {showLiveBar ? (
          <div className={classes.qaLiveBar} role="status" aria-live="polite">
            <Loader size={16} className={classes.spin} />
            <div>
              <strong>
                {analyzingCount > 0
                  ? `Listening to ${analyzingCount} recording${analyzingCount === 1 ? '' : 's'}…`
                  : 'Finishing analysis…'}
              </strong>
              <p>
                This page refreshes automatically.
                {elapsedSec != null ? ` Running ${elapsedSec}s.` : ''}
              </p>
            </div>
          </div>
        ) : null}

        <div className={classes.qaQueueBody}>
          {loading && !reviews.length ? (
            <div className={classes.qaEmpty}>
              <Loader size={22} className={classes.spin} />
              <h4>Loading flags…</h4>
            </div>
          ) : !reviews.length ? (
            <div className={classes.qaEmpty}>
              <Flag size={26} className={classes.qaEmptyIcon} />
              <h4>{empty.title}</h4>
              <p>{empty.body}</p>
            </div>
          ) : (
            <>
              {selectionEnabled ? (
                <div className={classes.qaSelectBar}>
                  <label className={classes.qaForceLabel}>
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      disabled={analysisLocked || !selectableReviews.length}
                      onChange={toggleSelectAll}
                    />
                    {selectedCount > 0
                      ? `${selectedCount} selected`
                      : `Select all (${selectableReviews.length})`}
                  </label>
                  <button
                    type="button"
                    className={selectedCount > 0 ? classes.primaryBtn : classes.qaGhostBtn}
                    disabled={analysisLocked || selectedCount < 1}
                    onClick={runReanalyzeSelected}
                  >
                    <AudioLines size={15} className={backfilling || watch ? classes.spin : ''} />
                    Re-analyze
                    {selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </button>
                </div>
              ) : null}
              <div className={classes.contestList}>
                {reviews.map((row) => {
                  const key = reviewKey(row);
                  const canSelect = selectionEnabled
                    && (row?.qaAudioReview?.status || row?.status) === 'clear'
                    && Boolean(row.recordingSid || row.recordingUrl);
                  return (
                    <AiFlagReviewCard
                      key={key}
                      review={row}
                      selectable={canSelect}
                      selected={selectedKeys.has(key)}
                      onSelectToggle={() => toggleSelected(row)}
                      selectDisabled={analysisLocked}
                      expanded={expandedId === key || row?.qaAudioReview?.status === 'processing'}
                      onToggle={() => {
                        setExpandedId(expandedId === key ? null : key);
                      }}
                      onPlayRecording={() => setActiveRecording({
                        recordingUrl: row.recordingUrl,
                        recordingSid: row.recordingSid || null,
                        campaign: row.campaignLabel || row.campaign,
                        campaignLabel: row.campaignLabel || row.campaign,
                        duration: row.duration,
                        createdAt: row.createdAt,
                        isBillable: row.isBillable,
                      })}
                      onConfirm={() => openConfirm(row)}
                      onDismiss={() => openDismiss(row)}
                      onReanalyze={reanalyzeReview ? () => runReanalyzeOne(row) : null}
                      reanalyzeDisabled={analysisLocked}
                    />
                  );
                })}
              </div>
              {total > 0 ? (
                <div className={classes.pagination}>
                  <span className={classes.pageMeta}>
                    {total === 0
                      ? '0 flags'
                      : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
                  </span>
                  <div className={classes.pageBtns}>
                    <button
                      type="button"
                      className={classes.pageBtn}
                      disabled={safePage <= 1 || loading}
                      onClick={() => goToPage(safePage - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className={classes.pageIndicator}>
                      Page {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className={classes.pageBtn}
                      disabled={safePage >= totalPages || loading}
                      onClick={() => goToPage(safePage + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {activeRecording && (
        <RecordingModal log={activeRecording} onClose={() => setActiveRecording(null)} />
      )}

      <AdminActionModal
        modal={actionModal}
        note={actionNote}
        onNoteChange={setActionNote}
        submitting={actionSubmitting}
        onClose={() => {
          if (actionSubmitting) return;
          setActionModal(null);
          setActionNote('');
        }}
        onSubmit={submitActionModal}
      />
    </div>
  );
}
