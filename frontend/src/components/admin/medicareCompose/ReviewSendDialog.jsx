import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, Monitor, Send, Smartphone, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  countMedicareCustomAudience,
  previewMedicareCustomEmail,
  sendMedicareCustomBroadcast,
} from '../../../services/adminService';
import { PREVIEW_NAME, fillTokens, toPayload } from './copyModel';
import classes from './ReviewSendDialog.module.css';

const OPEN = { duration: 0.25, ease: [0.22, 1, 0.36, 1] };
const CLOSE = { duration: 0.15, ease: [0.22, 1, 0.36, 1] };

function Dialog({ onClose, copy, target, running, onSent }) {
  const handPicked = target.mode === 'people';
  const [device, setDevice] = useState('desktop');
  const [preview, setPreview] = useState({ html: '', subject: '', errors: [] });
  const [previewState, setPreviewState] = useState('loading');
  const [count, setCount] = useState(handPicked ? target.people.length : null);
  const [countState, setCountState] = useState(handPicked ? 'ready' : 'loading');
  const [confirmText, setConfirmText] = useState('');
  const [sending, setSending] = useState(false);
  const countSeq = useRef(0);
  const payload = useRef(toPayload(copy)).current;

  useEffect(() => {
    let alive = true;
    previewMedicareCustomEmail(payload)
      .then((out) => {
        if (!alive) return;
        setPreview({ html: out?.html || '', subject: out?.subject || '', errors: Array.isArray(out?.errors) ? out.errors : [] });
        setPreviewState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setPreview({ html: '', subject: '', errors: [err.message || 'Could not load the preview'] });
        setPreviewState('error');
      });
    return () => { alive = false; };
  }, [payload]);

  // A group is counted again here so the number you confirm is the number right now.
  const loadCount = useCallback(async () => {
    const seq = ++countSeq.current;
    setCountState('loading');
    setConfirmText('');
    try {
      const out = await countMedicareCustomAudience(target.audience);
      if (seq !== countSeq.current) return;
      setCount(Number(out?.count) || 0);
      setCountState('ready');
    } catch {
      if (seq !== countSeq.current) return;
      setCount(null);
      setCountState('error');
    }
  }, [target.audience]);

  useEffect(() => {
    if (!handPicked) loadCount();
  }, [handPicked, loadCount]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const sendAll = async () => {
    setSending(true);
    try {
      const out = await sendMedicareCustomBroadcast(
        handPicked
          ? { copy: payload, userIds: target.people.map((p) => p.uid) }
          : { copy: payload, audience: target.audience },
      );
      toast.success(`Sending to ${out?.total || 0} Medicare target${out?.total === 1 ? '' : 's'}`);
      onSent();
    } catch (err) {
      toast.error(err.message || 'Send failed');
      setSending(false);
    }
  };

  const errors = preview.errors;
  const hasCount = countState === 'ready' && typeof count === 'number';
  const confirmPhrase = hasCount ? String(count) : '';
  const blocked = errors.length > 0 || previewState !== 'ready' || running || !hasCount || count === 0;
  const canSend = !blocked && !sending && confirmText.trim() === confirmPhrase;
  const people = `${count} ${count === 1 ? 'person' : 'people'}`;

  let sendNote = 'This sends real email and cannot be undone.';
  if (running) sendNote = 'Another custom send is still running. Wait for it to finish or cancel it from History.';
  else if (countState === 'error') sendNote = 'Could not count this group. Close this and try again.';
  else if (hasCount && count === 0) sendNote = 'Nobody is in this group right now.';

  return (
    <motion.div
      className={classes.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: OPEN }}
      exit={{ opacity: 0, transition: CLOSE }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <motion.div
        className={`glass ${classes.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Review and send"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1, transition: OPEN }}
        exit={{ opacity: 0, scale: 0.96, transition: CLOSE }}
      >
        <header className={classes.head}>
          <div>
            <h3 className={classes.title}>Review and send</h3>
            <p className={classes.subtitle}>This is exactly what agents receive, shown for “{PREVIEW_NAME}”.</p>
          </div>
          <button type="button" className={classes.closeBtn} onClick={onClose} disabled={sending} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={classes.body}>
          <section className={classes.previewPane}>
            <div className={classes.previewBar}>
              <div className={classes.subjectLine}>
                <span className={classes.subjectLabel}>Subject</span>
                <span className={classes.subjectValue}>{preview.subject || fillTokens(copy.subject)}</span>
              </div>
              <div className={classes.segmented} role="tablist" aria-label="Preview size">
                <button
                  type="button"
                  role="tab"
                  aria-selected={device === 'desktop'}
                  className={`${classes.segment} ${device === 'desktop' ? classes.segmentActive : ''}`}
                  onClick={() => setDevice('desktop')}
                >
                  <Monitor size={13} />
                  Desktop
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={device === 'mobile'}
                  className={`${classes.segment} ${device === 'mobile' ? classes.segmentActive : ''}`}
                  onClick={() => setDevice('mobile')}
                >
                  <Smartphone size={13} />
                  Mobile
                </button>
              </div>
            </div>
            <div className={classes.frameWrap}>
              {previewState === 'loading' ? (
                <div className={classes.frameState}><Loader2 size={20} className={classes.spin} /></div>
              ) : null}
              {previewState === 'error' ? (
                <div className={classes.frameState}>Preview unavailable</div>
              ) : null}
              {previewState === 'ready' ? (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className={`${classes.frame} ${device === 'mobile' ? classes.frameMobile : ''}`}
                />
              ) : null}
            </div>
          </section>

          <section className={classes.sendPane}>
            {errors.length ? (
              <div className={classes.errorBox} role="alert">
                <AlertTriangle size={15} />
                <ul>
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            ) : null}

            <div className={classes.block}>
              <h4 className={classes.blockTitle}>Sending to</h4>
              {handPicked ? (
                <>
                  <p className={classes.blockLead}><strong>{people}</strong> you picked</p>
                  <ul className={classes.peopleList}>
                    {target.people.map((p) => (
                      <li key={p.uid}>
                        <span className={classes.personName}>{p.name || p.email}</span>
                        {p.name ? <span className={classes.personEmail}>{p.email}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p className={classes.blockLead}>{target.audienceLabel}</p>
                  <p className={classes.stepNote}>
                    {countState === 'loading' ? <><Loader2 size={12} className={classes.spin} />Counting…</> : null}
                    {hasCount ? <><strong>{people}</strong> in this group right now.</> : null}
                    {countState === 'error' ? 'Could not count this group.' : null}
                  </p>
                </>
              )}
              <p className={classes.stepNote}>
                {target.includesPaid
                  ? 'Goes to these agents even if they have already paid. Only opted-out agents are skipped.'
                  : 'Anyone who has paid, converted or opted out since is skipped.'}
              </p>
            </div>

            <div className={classes.block}>
              <label className={classes.blockTitle} htmlFor="mc-confirm">
                {hasCount && count > 0 ? <>Type <strong>{confirmPhrase}</strong> to send</> : 'Send'}
              </label>
              <div className={classes.inline}>
                <input
                  id="mc-confirm"
                  className={`${classes.input} ${classes.confirmInput}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirmText}
                  placeholder={confirmPhrase}
                  onChange={(e) => setConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSend) sendAll();
                  }}
                  disabled={blocked || sending}
                />
                <button type="button" className={classes.primaryBtn} onClick={sendAll} disabled={!canSend}>
                  {sending ? <Loader2 size={14} className={classes.spin} /> : <Send size={14} />}
                  {hasCount && count > 0 ? `Send to ${count}` : 'Send'}
                </button>
              </div>
              <p className={`${classes.stepNote} ${running || countState === 'error' || (hasCount && count === 0) ? classes.warn : ''}`}>
                {sendNote}
              </p>
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}

const dialogProps = {
  onClose: PropTypes.func.isRequired,
  copy: PropTypes.shape({ subject: PropTypes.string, next: PropTypes.arrayOf(PropTypes.string) }).isRequired,
  target: PropTypes.shape({
    mode: PropTypes.oneOf(['group', 'people']).isRequired,
    audience: PropTypes.string,
    audienceLabel: PropTypes.string,
    includesPaid: PropTypes.bool,
    people: PropTypes.arrayOf(PropTypes.shape({ uid: PropTypes.string, name: PropTypes.string, email: PropTypes.string })),
  }).isRequired,
  running: PropTypes.bool,
  onSent: PropTypes.func.isRequired,
};

Dialog.propTypes = dialogProps;

/** The last stop: the real email, who it goes to, and a typed confirm. Mounted only while open so every open is fresh. */
export default function ReviewSendDialog({ open, ...rest }) {
  return <AnimatePresence>{open ? <Dialog key="review" {...rest} /> : null}</AnimatePresence>;
}

ReviewSendDialog.propTypes = { open: PropTypes.bool, ...dialogProps };
