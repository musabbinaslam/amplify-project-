import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { AnimatePresence, motion } from 'framer-motion';
import { History, RefreshCw, X } from 'lucide-react';
import shared from '../adminShared.module.css';
import classes from './HistoryDrawer.module.css';

const STATUS_LABELS = {
  running: 'Sending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  stalled: 'Stalled',
};

const OPEN = { duration: 0.4, ease: [0.22, 1, 0.36, 1] };
const CLOSE = { duration: 0.35, ease: [0.22, 1, 0.36, 1] };

function statusPillClass(status) {
  if (status === 'completed') return shared.dispSold;
  if (status === 'running') return shared.dispAnswered;
  if (status === 'failed' || status === 'stalled' || status === 'cancelled') return shared.dispMissed;
  return shared.dispPending;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function HistoryDrawer({ open, onClose, broadcasts, loading, audiences, onRefresh, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const audienceLabel = (key) => {
    if (key === 'selected') return 'Hand-picked people';
    return audiences.find((a) => a.key === key)?.label || key || '—';
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className={classes.overlay}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: OPEN }}
            exit={{ opacity: 0, transition: CLOSE }}
          />
          <motion.aside
            className={`glass ${classes.drawer}`}
            role="dialog"
            aria-modal="true"
            aria-label="Send history"
            initial={{ x: '100%' }}
            animate={{ x: 0, transition: OPEN }}
            exit={{ x: '100%', transition: CLOSE }}
          >
            <header className={classes.head}>
              <div className={classes.titleRow}>
                <History size={18} className={classes.titleIcon} />
                <div>
                  <h3 className={classes.title}>Send history</h3>
                  <p className={classes.sub}>Last 10 custom Medicare sends</p>
                </div>
              </div>
              <div className={classes.headActions}>
                <button type="button" className={classes.iconBtn} onClick={onRefresh} aria-label="Refresh">
                  <RefreshCw size={15} />
                </button>
                <button type="button" className={classes.iconBtn} onClick={onClose} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className={classes.list}>
              {loading && !broadcasts.length ? <p className={classes.muted}>Loading…</p> : null}
              {!loading && !broadcasts.length ? (
                <div className={classes.emptyState}>
                  <History size={24} />
                  <p>No custom sends yet. Your sends will show up here with live progress.</p>
                </div>
              ) : null}
              {broadcasts.map((b) => {
                const done = b.sent + b.skipped + b.failed;
                const pct = b.total ? Math.min(100, Math.round((done / b.total) * 100)) : 0;
                return (
                  <article key={b.id} className={classes.item}>
                    <div className={classes.itemTop}>
                      <strong className={classes.subject}>{b.subject || '—'}</strong>
                      <span className={`${shared.statusPill} ${statusPillClass(b.status)}`}>
                        {STATUS_LABELS[b.status] || b.status}
                      </span>
                    </div>
                    <div className={classes.meta}>
                      {audienceLabel(b.audience)} · {formatWhen(b.createdAt)}{b.createdBy ? ` · ${b.createdBy}` : ''}
                    </div>
                    <div className={classes.progress}>
                      <div className={classes.progressBar} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={classes.itemBottom}>
                      <span className={classes.stats}>
                        <b>{b.sent}</b> sent · {b.skipped} skipped · {b.failed} failed · {b.total} total
                      </span>
                      {b.status === 'running' && !b.cancelRequested ? (
                        <button type="button" className={classes.cancelBtn} onClick={() => onCancel(b.id)}>Cancel send</button>
                      ) : null}
                      {b.cancelRequested && b.status === 'running' ? <span className={classes.muted}>Stopping…</span> : null}
                    </div>
                    {b.errors?.length ? (
                      <details className={classes.errors}>
                        <summary>{b.errors.length} error{b.errors.length === 1 ? '' : 's'}</summary>
                        <ul>
                          {b.errors.map((e, i) => (
                             
                            <li key={i}><span>{e.email || '—'}</span> {e.error}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

HistoryDrawer.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  broadcasts: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  audiences: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.string })).isRequired,
  onRefresh: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
