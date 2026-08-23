import { ChevronDown, Play, Loader } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import classes from './adminShared.module.css';

const EXPAND_TRANSITION = { duration: 0.32, ease: EASE_SMOOTH };

function statusClass(status) {
  if (status === 'pending_review' || status === 'processing') return classes.qaChipPending;
  if (status === 'confirmed') return classes.qaChipConfirmed;
  if (status === 'dismissed') return classes.qaChipDismissed;
  return classes.qaChipClear;
}

function statusLabel(status) {
  if (status === 'pending_review') return 'Needs review';
  if (status === 'processing') return 'Analyzing';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'dismissed') return 'Dismissed';
  if (status === 'clear') return 'Clear';
  return status || '—';
}

function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return '—';
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function prettySource(source) {
  if (source === 'gemini_audio') return 'Gemini';
  if (source === 'billing') return 'Billing';
  if (source === 'quota') return 'Rate limit';
  if (!source) return '—';
  return String(source).replace(/_/g, ' ');
}

function severityClass(severity) {
  if (severity === 'high') return classes.qaChipConfirmed;
  if (severity === 'medium') return classes.qaChipPending;
  return classes.qaChipClear;
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
    <article className={`${classes.qaCard} ${expanded ? classes.qaCardExpanded : ''} ${selected ? classes.qaCardSelected : ''}`}>
      <div className={classes.qaCardRow}>
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
        ) : (
          <span className={classes.qaCardSelectSpacer} aria-hidden="true" />
        )}
        <button type="button" className={classes.qaCardSummary} onClick={onToggle}>
          <div className={classes.qaCardIdentity}>
            <span className={classes.qaCardName}>{r.agentName || r.agentId}</span>
            <span className={classes.qaCardMeta}>
              <span>{r.campaignLabel || r.campaign || '—'}</span>
              <span className={classes.qaCardDot} aria-hidden="true">·</span>
              <span>{r.duration != null ? formatDuration(r.duration) : '—'}</span>
              <span className={classes.qaCardDot} aria-hidden="true">·</span>
              <span>
                {violations.length === 0
                  ? 'No violations'
                  : `${violations.length} violation${violations.length === 1 ? '' : 's'}`}
              </span>
              {r.agentFlagged ? (
                <>
                  <span className={classes.qaCardDot} aria-hidden="true">·</span>
                  <span>Agent flagged</span>
                </>
              ) : null}
            </span>
          </div>
          <span className={classes.qaCardWhen}>{formatWhen(generatedAt)}</span>
          <span className={`${classes.qaChip} ${statusClass(status)}`}>{statusLabel(status)}</span>
          <ChevronDown size={16} className={classes.qaCardChevron} />
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
            <div className={classes.qaDetail}>
              <div className={classes.qaDetailGrid}>
                <section className={classes.qaDetailMain}>
                  <div className={classes.qaDetailBlock}>
                    <h4 className={classes.qaDetailHeading}>Summary</h4>
                    {status === 'processing' ? (
                      <p className={classes.qaAnalyzingCopy}>
                        <Loader size={14} className={classes.spin} />
                        Gemini is downloading the recording and checking your compliance rules.
                      </p>
                    ) : (
                      <p className={classes.qaDetailCopy}>{qa.summary || '—'}</p>
                    )}
                  </div>

                  <div className={classes.qaDetailBlock}>
                    <h4 className={classes.qaDetailHeading}>Violations</h4>
                    {status === 'processing' ? (
                      <p className={classes.qaDetailMuted}>Waiting for Gemini…</p>
                    ) : !violations.length ? (
                      <p className={classes.qaDetailMuted}>No rule violations recorded.</p>
                    ) : (
                      <ul className={classes.qaViolationList}>
                        {violations.map((v, idx) => (
                          <li key={`${v.ruleId || 'rule'}-${idx}`} className={classes.qaViolationItem}>
                            <div className={classes.qaViolationTop}>
                              <strong>{v.ruleName || v.ruleId || 'Rule'}</strong>
                              <span className={`${classes.qaChip} ${severityClass(v.severity)}`}>
                                {v.severity || 'medium'}
                              </span>
                            </div>
                            {v.quote ? <p className={classes.qaQuote}>“{v.quote}”</p> : null}
                            <span className={classes.qaDetailMuted}>
                              {v.timestampSec != null ? `${v.timestampSec}s` : 'No timestamp'}
                              {v.confidence != null ? ` · ${Math.round(Number(v.confidence) * 100)}% confidence` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className={classes.qaDetailBlock}>
                    <h4 className={classes.qaDetailHeading}>Transcript</h4>
                    {status === 'processing' ? (
                      <p className={classes.qaDetailMuted}>Transcript appears when analysis finishes.</p>
                    ) : qa.transcript ? (
                      <TranscriptBlock transcript={qa.transcript} />
                    ) : (
                      <p className={classes.qaDetailMuted}>No transcript available.</p>
                    )}
                  </div>

                  {qa.review?.note && !isPending ? (
                    <div className={classes.qaDetailBlock}>
                      <h4 className={classes.qaDetailHeading}>Reviewer note</h4>
                      <p className={classes.qaDetailCopy}>{qa.review.note}</p>
                    </div>
                  ) : null}
                </section>

                <aside className={classes.qaDetailSide}>
                  <h4 className={classes.qaDetailHeading}>Call details</h4>
                  <dl className={classes.qaFacts}>
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
                      <dd>{r.duration != null ? formatDuration(r.duration) : '—'}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{qa.model || '—'}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{prettySource(qa.source)}</dd>
                    </div>
                  </dl>

                  <div className={classes.qaDetailActions}>
                    {(r.recordingSid || r.recordingUrl) ? (
                      <button type="button" className={classes.qaSideBtn} onClick={onPlayRecording}>
                        <Play size={14} /> Play recording
                      </button>
                    ) : (
                      <p className={classes.qaDetailMuted}>No recording available</p>
                    )}

                    {isPending ? (
                      <>
                        <button type="button" className={classes.dangerBtn} onClick={onConfirm}>
                          Confirm — flag agent
                        </button>
                        <button type="button" className={classes.qaSideBtn} onClick={onDismiss}>
                          Dismiss
                        </button>
                      </>
                    ) : null}

                    {canReanalyze ? (
                      <button
                        type="button"
                        className={classes.qaSideBtn}
                        disabled={reanalyzeDisabled}
                        onClick={onReanalyze}
                      >
                        Re-analyze
                      </button>
                    ) : null}
                  </div>
                </aside>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
