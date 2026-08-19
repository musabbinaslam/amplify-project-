import { ChevronDown, Play, Loader } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import classes from './adminShared.module.css';

const EXPAND_TRANSITION = { duration: 0.32, ease: EASE_SMOOTH };

function statusClass(status) {
  if (status === 'pending_review' || status === 'processing') return classes.dispAnswered;
  if (status === 'confirmed') return classes.dispMissed;
  return classes.dispSold;
}

function statusLabel(status) {
  if (status === 'pending_review') return 'Pending';
  if (status === 'processing') return 'Analyzing';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'dismissed') return 'Dismissed';
  if (status === 'clear') return 'Clear';
  return status || '—';
}

function severityClass(severity) {
  if (severity === 'high') return classes.dispMissed;
  if (severity === 'medium') return classes.dispAnswered;
  return classes.dispSold;
}

function parseTranscriptTurns(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  // Prefer explicit newlines already present.
  if (/\n/.test(text) && /^(Agent|Customer|Caller|Prospect|User)\s*:/im.test(text)) {
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(Agent|Customer|Caller|Prospect|User)\s*:\s*(.*)$/i);
        if (!match) return { speaker: null, text: line };
        return { speaker: normalizeSpeaker(match[1]), text: match[2].trim() };
      })
      .filter((turn) => turn.text);
  }

  // Gemini often returns one paragraph: "Agent: … Agent: … Customer: …"
  const parts = text.split(/(?=\b(?:Agent|Customer|Caller|Prospect|User)\s*:)/i);
  const turns = [];
  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) continue;
    const match = chunk.match(/^(Agent|Customer|Caller|Prospect|User)\s*:\s*([\s\S]*)$/i);
    if (match) {
      const body = match[2].replace(/\s+/g, ' ').trim();
      if (body) turns.push({ speaker: normalizeSpeaker(match[1]), text: body });
    } else {
      turns.push({ speaker: null, text: chunk.replace(/\s+/g, ' ').trim() });
    }
  }
  return turns.filter((t) => t.text);
}

function normalizeSpeaker(label) {
  const key = String(label || '').trim().toLowerCase();
  if (key === 'agent') return 'Agent';
  if (key === 'customer' || key === 'caller' || key === 'prospect' || key === 'user') return 'Customer';
  return label;
}

function speakerTone(speaker) {
  if (speaker === 'Agent') return 'agent';
  if (speaker === 'Customer') return 'customer';
  return 'other';
}

function TranscriptBlock({ transcript }) {
  const turns = parseTranscriptTurns(transcript);
  if (!turns.length) {
    return <pre className={classes.qaTranscript}>{transcript}</pre>;
  }

  return (
    <div className={classes.qaTranscriptList}>
      {turns.map((turn, idx) => (
        <div
          key={`${turn.speaker || 'line'}-${idx}`}
          className={`${classes.qaTurn} ${classes[`qaTurn_${speakerTone(turn.speaker)}`] || ''}`}
        >
          {turn.speaker ? (
            <span className={classes.qaTurnSpeaker}>{turn.speaker}</span>
          ) : null}
          <p className={classes.qaTurnText}>{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable react/prop-types */
export default function AiFlagReviewCard({
  review: r,
  expanded,
  onToggle,
  onPlayRecording,
  onConfirm,
  onDismiss,
  onReanalyze = null,
  reanalyzeDisabled = false,
  selectable = false,
  selected = false,
  onSelectToggle = null,
  selectDisabled = false,
}) {
  const reduceMotion = useReducedMotion();
  const expandTransition = reduceMotion ? { duration: 0 } : EXPAND_TRANSITION;
  const expandMotion = reduceMotion
    ? {}
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
      };

  const qa = r?.qaAudioReview || {};
  const status = qa.status || r.status;
  const isPending = status === 'pending_review';
  const isClear = status === 'clear';
  const canReanalyze = isClear && typeof onReanalyze === 'function' && (r.recordingSid || r.recordingUrl);
  const violations = Array.isArray(qa.violations) ? qa.violations : [];
  const generatedAt = qa.generatedAt || r.createdAt;

  return (
    <article className={`glass ${classes.contestCard} ${expanded ? classes.contestCardExpanded : ''} ${selected ? classes.qaCardSelected : ''}`}>
      <div className={classes.contestCardSummaryRow}>
        {selectable ? (
          <label className={classes.qaCardSelect} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              disabled={selectDisabled}
              onChange={onSelectToggle}
              aria-label={`Select call for ${r.agentName || r.agentId}`}
            />
          </label>
        ) : null}
        <button type="button" className={classes.contestCardSummary} onClick={onToggle}>
          <div className={classes.contestCardSummaryMain}>
            <div className={classes.contestCardIdentity}>
              <span className={classes.contestCardName}>{r.agentName || r.agentId}</span>
              <span className={classes.contestCardMeta}>
                {r.campaignLabel || r.campaign}
                <span className={classes.contestCardDot}>·</span>
                {r.duration != null ? `${r.duration}s` : '—'}
                <span className={classes.contestCardDot}>·</span>
                {violations.length} violation{violations.length === 1 ? '' : 's'}
                {r.agentFlagged ? (
                  <>
                    <span className={classes.contestCardDot}>·</span>
                    Agent flagged
                  </>
                ) : null}
              </span>
            </div>
            <div className={classes.contestCardSummaryAside}>
              <span className={classes.contestCardWhen}>
                {generatedAt ? new Date(generatedAt).toLocaleString() : '—'}
              </span>
              <span className={`${classes.statusPill} ${statusClass(status)}`}>{statusLabel(status)}</span>
              <ChevronDown size={18} className={classes.contestCardChevron} />
            </div>
          </div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="qa-flag-detail"
            className={classes.contestCardExpandWrap}
            {...expandMotion}
            transition={expandTransition}
          >
            <div className={classes.contestCardBody}>
              <div className={classes.contestReviewGrid}>
                <section className={classes.contestReviewMain}>
                  <h4 className={classes.contestReviewHeading}>AI summary</h4>
                  {status === 'processing' ? (
                    <p className={classes.qaAnalyzingCopy}>
                      <Loader size={14} className={classes.spin} />
                      Gemini is downloading the recording and checking your compliance rules. This usually takes a few seconds for short calls.
                    </p>
                  ) : (
                    <p className={classes.contestReviewReason}>{qa.summary || '—'}</p>
                  )}

                  <h4 className={classes.contestReviewHeading}>Violations</h4>
                  {status === 'processing' ? (
                    <p className={classes.muted}>Waiting for Gemini…</p>
                  ) : !violations.length ? (
                    <p className={classes.muted}>No rule violations recorded.</p>
                  ) : (
                    <ul className={classes.qaViolationList}>
                      {violations.map((v, idx) => (
                        <li key={`${v.ruleId || 'rule'}-${idx}`} className={classes.qaViolationItem}>
                          <div className={classes.qaViolationTop}>
                            <strong>{v.ruleName || v.ruleId || 'Rule'}</strong>
                            <span className={`${classes.statusPill} ${severityClass(v.severity)}`}>
                              {v.severity || 'medium'}
                            </span>
                          </div>
                          {v.quote ? <p className={classes.qaQuote}>“{v.quote}”</p> : null}
                          <span className={classes.muted}>
                            {v.timestampSec != null ? `${v.timestampSec}s` : 'No timestamp'}
                            {v.confidence != null ? ` · ${Math.round(Number(v.confidence) * 100)}% confidence` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h4 className={classes.contestReviewHeading}>Transcript</h4>
                  {status === 'processing' ? (
                    <p className={classes.muted}>Transcript appears when analysis finishes.</p>
                  ) : qa.transcript ? (
                    <TranscriptBlock transcript={qa.transcript} />
                  ) : (
                    <p className={classes.muted}>No transcript available.</p>
                  )}

                  {qa.review?.note && !isPending ? (
                    <>
                      <h4 className={classes.contestReviewHeading}>Reviewer note</h4>
                      <p className={classes.contestReviewReason}>{qa.review.note}</p>
                    </>
                  ) : null}
                </section>

                <aside className={classes.contestReviewSide}>
                  <h4 className={classes.contestReviewHeading}>Call details</h4>
                  <dl className={classes.contestFacts}>
                    <div>
                      <dt>Agent</dt>
                      <dd>{r.agentName || r.agentId}</dd>
                    </div>
                    <div>
                      <dt>Campaign</dt>
                      <dd>{r.campaignLabel || r.campaign}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{r.duration}s</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{qa.model || '—'}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{qa.source || '—'}</dd>
                    </div>
                    <div>
                      <dt>Call log</dt>
                      <dd className={classes.contestFactMono}>{String(r.callLogId || r.id || '').slice(0, 12)}…</dd>
                    </div>
                  </dl>

                  <div className={classes.contestRecordingBlock}>
                    <h4 className={classes.contestReviewHeading}>Recording</h4>
                    {(r.recordingSid || r.recordingUrl) ? (
                      <button type="button" className={classes.contestRecordingBtn} onClick={onPlayRecording}>
                        <Play size={14} /> Play recording
                      </button>
                    ) : (
                      <p className={classes.muted}>No recording available</p>
                    )}
                  </div>

                  {isPending ? (
                    <div className={classes.contestActionStack}>
                      <button type="button" className={classes.dangerBtn} onClick={onConfirm}>
                        Confirm & flag agent
                      </button>
                      <button type="button" className={classes.primaryBtn} onClick={onDismiss}>
                        Dismiss false positive
                      </button>
                    </div>
                  ) : null}

                  {canReanalyze ? (
                    <div className={classes.contestActionStack}>
                      <button
                        type="button"
                        className={classes.primaryBtn}
                        disabled={reanalyzeDisabled}
                        onClick={onReanalyze}
                      >
                        Re-analyze this call
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
