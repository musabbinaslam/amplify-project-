import { useState, useEffect } from 'react';
import { FileText, Play, ChevronDown, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import { auth } from '../../config/firebase';
import { getApiBaseUrl } from '../../config/apiBase';
import classes from './adminShared.module.css';

export async function fetchContestProofBlob(url) {
  if (!url) throw new Error('No proof URL');
  if (!url.startsWith('/api/')) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not load proof file');
    return res.blob();
  }
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${getApiBaseUrl()}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not load proof file');
  return res.blob();
}

export async function openContestProofUrl(url) {
  if (!url) return;
  try {
    const blob = await fetchContestProofBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (e) {
    toast.error(e.message || 'Failed to open proof');
  }
}

function isImageProof(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(file?.name || '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/.test(name);
}

function ContestProofImage({ url, name, onOpen }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await fetchContestProofBlob(url);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (loading) {
    return (
      <div className={classes.contestProofPreviewPlaceholder} aria-busy="true">
        Loading preview…
      </div>
    );
  }

  if (error || !src) {
    return (
      <button type="button" className={classes.contestProofChip} onClick={() => onOpen(url)}>
        <FileText size={14} />
        <span>{name || 'Proof file'}</span>
      </button>
    );
  }

  return (
    <figure className={classes.contestProofFigure}>
      <button
        type="button"
        className={classes.contestProofImageBtn}
        onClick={() => onOpen(url)}
        title="Open full size"
      >
        <img src={src} alt={name || 'Contest proof'} className={classes.contestProofImage} />
      </button>
      {name ? <figcaption className={classes.contestProofCaption}>{name}</figcaption> : null}
    </figure>
  );
}

function formatContestCategory(category) {
  if (!category) return '—';
  return String(category).replace(/_/g, ' ');
}

const CONTEST_EXPAND_TRANSITION = { duration: 0.32, ease: EASE_SMOOTH };

const ACTION_MODAL_CONFIG = {
  approve_contest: {
    title: 'Approve & credit',
    confirmLabel: 'Approve & credit',
    confirmClass: 'primaryBtn',
    label: 'Approval note',
    placeholder: 'Why is this call being credited? (visible on billing history)',
  },
  deny_contest: {
    title: 'Deny contest',
    confirmLabel: 'Deny contest',
    confirmClass: 'dangerBtn',
    label: 'Denial reason',
    placeholder: 'Explain to the agent why this contest was denied',
  },
  refund_call: {
    title: 'Refund call charge',
    confirmLabel: 'Confirm refund',
    confirmClass: 'primaryBtn',
    label: 'Refund reason',
    placeholder: 'Why is this call being credited? (visible on billing history)',
  },
};

/* eslint-disable react/prop-types */
export function AdminActionModal({ modal, note, onNoteChange, submitting, onClose, onSubmit }) {
  if (!modal) return null;
  const cfg = ACTION_MODAL_CONFIG[modal.type];
  const { agentName, amount } = modal.context || {};

  let subtitle = '';
  if (modal.type === 'approve_contest') {
    subtitle = `Credit $${amount} to ${agentName}. Minimum 10 characters.`;
  } else if (modal.type === 'deny_contest') {
    subtitle = `The agent (${agentName}) will see this on their call log.`;
  } else if (modal.type === 'refund_call') {
    subtitle = `Credit $${amount} to ${agentName}. Minimum 10 characters.`;
  }

  return (
    <motion.div
      className={classes.modalOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className={`glass ${classes.modalBox}`}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={classes.modalHeader}>
          <h3>{cfg.title}</h3>
          <button type="button" className={classes.modalCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={classes.modalSub}>{subtitle}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className={classes.modalLabelStack}>
            {cfg.label}
            <textarea
              className={classes.modalTextarea}
              rows={4}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={cfg.placeholder}
              autoFocus
              required
            />
          </label>
          <div className={classes.modalActions}>
            <button type="button" className={classes.modalCancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={classes[cfg.confirmClass]} disabled={submitting}>
              {submitting ? 'Saving…' : cfg.confirmLabel}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function ContestReviewCard({
  contest: c,
  expanded,
  onToggle,
  onOpenProof,
  onPlayRecording,
  onApprove,
  onDeny,
}) {
  const reduceMotion = useReducedMotion();
  const expandTransition = reduceMotion ? { duration: 0 } : CONTEST_EXPAND_TRANSITION;
  const expandMotion = reduceMotion
    ? {}
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
      };

  const isPending = c.status === 'pending';
  const statusClass =
    c.status === 'pending' ? classes.dispAnswered : c.status === 'approved' ? classes.dispSold : classes.dispMissed;

  return (
    <article className={`glass ${classes.contestCard} ${expanded ? classes.contestCardExpanded : ''}`}>
      <button type="button" className={classes.contestCardSummary} onClick={onToggle}>
        <div className={classes.contestCardSummaryMain}>
          <div className={classes.contestCardIdentity}>
            <span className={classes.contestCardName}>{c.agentName || c.agentId}</span>
            <span className={classes.contestCardMeta}>
              {c.campaignLabel || c.campaign}
              <span className={classes.contestCardDot}>·</span>
              ${Number(c.cost || 0).toFixed(2)}
              <span className={classes.contestCardDot}>·</span>
              {formatContestCategory(c.category)}
            </span>
          </div>
          <div className={classes.contestCardSummaryAside}>
            <span className={classes.contestCardWhen}>
              {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}
            </span>
            <span className={`${classes.statusPill} ${statusClass}`}>{c.status}</span>
            <ChevronDown size={18} className={classes.contestCardChevron} />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="contest-detail"
            className={classes.contestCardExpandWrap}
            {...expandMotion}
            transition={expandTransition}
          >
            <div className={classes.contestCardBody}>
              <div className={classes.contestReviewGrid}>
                <section className={classes.contestReviewMain}>
                  <h4 className={classes.contestReviewHeading}>Agent explanation</h4>
                  <p className={classes.contestReviewReason}>{c.agentReason || '—'}</p>

                  <h4 className={classes.contestReviewHeading}>Proof</h4>
                  {c.proofFiles?.length > 0 ? (
                    <div className={classes.contestProofSection}>
                      {c.proofFiles.some(isImageProof) ? (
                        <div className={classes.contestProofGallery}>
                          {c.proofFiles.filter(isImageProof).map((f) => (
                            <ContestProofImage
                              key={f.proofId || f.url || f.name}
                              url={f.url}
                              name={f.name}
                              onOpen={onOpenProof}
                            />
                          ))}
                        </div>
                      ) : null}
                      {c.proofFiles.filter((f) => !isImageProof(f)).length > 0 ? (
                        <div className={classes.contestProofList}>
                          {c.proofFiles.filter((f) => !isImageProof(f)).map((f) => (
                            <button
                              key={f.storagePath || f.url || f.proofId}
                              type="button"
                              className={classes.contestProofChip}
                              onClick={() => onOpenProof(f.url)}
                            >
                              <FileText size={14} />
                              <span>{f.name || 'Proof file'}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className={classes.muted}>No proof files attached.</p>
                  )}

                  {c.adminNote && !isPending ? (
                    <>
                      <h4 className={classes.contestReviewHeading}>Admin note</h4>
                      <p className={classes.contestReviewReason}>{c.adminNote}</p>
                    </>
                  ) : null}
                </section>

                <aside className={classes.contestReviewSide}>
                  <h4 className={classes.contestReviewHeading}>Call details</h4>
                  <dl className={classes.contestFacts}>
                    <div>
                      <dt>Agent</dt>
                      <dd>{c.agentName || c.agentId}</dd>
                    </div>
                    <div>
                      <dt>Campaign</dt>
                      <dd>{c.campaignLabel || c.campaign}</dd>
                    </div>
                    <div>
                      <dt>Charge</dt>
                      <dd className={classes.contestFactAmount}>${Number(c.cost || 0).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{c.duration}s</dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{formatContestCategory(c.category)}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}</dd>
                    </div>
                    <div>
                      <dt>Call log</dt>
                      <dd className={classes.contestFactMono}>{c.callLogId?.slice(0, 12)}…</dd>
                    </div>
                  </dl>

                  <div className={classes.contestRecordingBlock}>
                    <h4 className={classes.contestReviewHeading}>Recording</h4>
                    {c.recordingUrl ? (
                      <button type="button" className={classes.contestRecordingBtn} onClick={onPlayRecording}>
                        <Play size={14} /> Play recording
                      </button>
                    ) : (
                      <p className={classes.muted}>No recording available</p>
                    )}
                  </div>

                  {isPending ? (
                    <div className={classes.contestActionStack}>
                      <button type="button" className={classes.primaryBtn} onClick={onApprove}>
                        Approve & credit ${Number(c.cost || 0).toFixed(2)}
                      </button>
                      <button type="button" className={classes.dangerBtn} onClick={onDeny}>
                        Deny contest
                      </button>
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
