import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Lock, Plus, Trash2, X } from 'lucide-react';
import EditableText from './EditableText';
import { CTA_LINKS, CTA_TEXT_SUGGESTIONS, MAX_STEPS, isValidCtaUrl } from './copyModel';
import classes from './EmailEditor.module.css';

const CUSTOM_LINK = '__custom__';
const NEAR_LIMIT = 0.85;
const NAME_TOKENS = [
  { label: 'First name', value: '{firstName}' },
  { label: 'Full name', value: '{name}' },
];

const keepFocus = (e) => e.preventDefault();

/** One editable region plus the small pill that shows above it while it is focused. */
function Field({ id, value, max, tokens = false, focused, setFocused, fieldRefs, wrapClassName = '', ...rest }) {
  const active = focused === id;
  const near = Boolean(max) && value.length >= max * NEAR_LIMIT;
  return (
    <div className={`${classes.field} ${wrapClassName}`}>
      {active && (tokens || near) ? (
        <div className={classes.pill} onMouseDown={keepFocus}>
          {tokens ? NAME_TOKENS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={classes.pillBtn}
              tabIndex={-1}
              onClick={() => fieldRefs.current[id]?.insertText(t.value)}
            >
              <Plus size={11} />
              {t.label}
            </button>
          )) : null}
          {near ? <span className={classes.pillCount}>{value.length}/{max}</span> : null}
        </div>
      ) : null}
      <EditableText
        ref={(el) => { fieldRefs.current[id] = el; }}
        value={value}
        maxLength={max}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused((f) => (f === id ? null : f))}
        {...rest}
      />
    </div>
  );
}

Field.propTypes = {
  id: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  max: PropTypes.number,
  tokens: PropTypes.bool,
  focused: PropTypes.string,
  setFocused: PropTypes.func.isRequired,
  fieldRefs: PropTypes.shape({ current: PropTypes.object }).isRequired,
  wrapClassName: PropTypes.string,
};

const EmailEditor = forwardRef(function EmailEditor({ copy, setCopy, limits }, ref) {
  const fieldRefs = useRef({});
  const ctaWrapRef = useRef(null);
  const pendingFocus = useRef(null);
  const copyRef = useRef(copy);
  copyRef.current = copy;
  const [focused, setFocused] = useState(null);
  const [ctaOn, setCtaOn] = useState(() => Boolean(copy.cta));
  const [ctaOpen, setCtaOpen] = useState(false);
  const [linkCustom, setLinkCustom] = useState(() => !CTA_LINKS.some((l) => l.value === copy.ctaUrl));

  const set = (key) => (value) => setCopy((c) => ({ ...c, [key]: value }));
  const lim = (key) => limits?.[key] || undefined;
  const shared = { focused, setFocused, fieldRefs };
  const missingSubject = !copy.subject.trim();
  const missingHeadline = !copy.headline.trim();
  const missingMessage = !copy.intro.trim() && !copy.body.trim();

  useImperativeHandle(ref, () => ({
    focusField: (key) => {
      if (key === 'cta') {
        setCtaOn(true);
        setCtaOpen(true);
      }
      fieldRefs.current[key]?.focus({ scroll: true });
    },
  }));

  // Focus fields that only exist after the state change that created them.
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const target = fieldRefs.current[key];
    if (!target) return;
    pendingFocus.current = null;
    target.focus();
  });

  const closeCta = () => {
    setCtaOpen(false);
    if (!copyRef.current.cta.trim()) setCtaOn(false);
  };

  useEffect(() => {
    if (!ctaOpen) return undefined;
    const onDown = (e) => {
      if (!ctaWrapRef.current?.contains(e.target)) closeCta();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ctaOpen]);

  const addCta = () => {
    setCopy((c) => ({ ...c, cta: c.cta || CTA_TEXT_SUGGESTIONS[0], ctaUrl: c.ctaUrl || CTA_LINKS[0].value }));
    setCtaOn(true);
    setCtaOpen(true);
    pendingFocus.current = 'cta';
  };

  const removeCta = () => {
    setCopy((c) => ({ ...c, cta: '' }));
    setCtaOn(false);
    setCtaOpen(false);
  };

  const linkValue = linkCustom || !CTA_LINKS.some((l) => l.value === copy.ctaUrl) ? CUSTOM_LINK : copy.ctaUrl;
  const linkValid = isValidCtaUrl(copy.ctaUrl);

  const onLinkSelect = (value) => {
    if (value === CUSTOM_LINK) {
      setLinkCustom(true);
      if (CTA_LINKS.some((l) => l.value === copy.ctaUrl)) set('ctaUrl')('https://');
      return;
    }
    setLinkCustom(false);
    set('ctaUrl')(value);
  };

  const steps = copy.next;
  const stepsFull = steps.length >= MAX_STEPS;

  const addStep = (afterIndex) => {
    if (copyRef.current.next.length >= MAX_STEPS) return;
    const at = afterIndex == null ? copyRef.current.next.length : afterIndex + 1;
    setCopy((c) => ({ ...c, next: [...c.next.slice(0, at), '', ...c.next.slice(at)] }));
    pendingFocus.current = `step-${at}`;
  };

  const removeStep = (index, { refocus = false } = {}) => {
    const remaining = copyRef.current.next.length - 1;
    setCopy((c) => ({ ...c, next: c.next.filter((_, j) => j !== index) }));
    pendingFocus.current = refocus && remaining > 0 ? `step-${Math.max(0, index - 1)}` : null;
  };

  const setStep = (index) => (value) => setCopy((c) => ({
    ...c,
    next: c.next.map((s, j) => (j === index ? value : s)),
  }));

  return (
    <div className={classes.column}>
      <section className={classes.inbox} aria-label="Inbox line">
        <div className={classes.inboxRow}>
          <span className={classes.inboxLabel}>Subject</span>
          <Field
            {...shared}
            id="subject"
            wrapClassName={classes.inboxField}
            className={classes.subjectText}
            value={copy.subject}
            onChange={set('subject')}
            max={lim('subject')}
            placeholder="Add a subject line"
            invalid={missingSubject}
            tokens
          />
        </div>
        <div className={classes.inboxRow}>
          <span className={classes.inboxLabel}>Preview text</span>
          <Field
            {...shared}
            id="preheader"
            wrapClassName={classes.inboxField}
            className={classes.previewText}
            value={copy.preheader}
            onChange={set('preheader')}
            max={lim('preheader')}
            placeholder="Add the line shown next to the subject (optional)"
            tokens
          />
        </div>
      </section>

      <section className={classes.email} aria-label="Email">
        <div className={classes.inner}>
          <div className={classes.brand} aria-hidden="true">
            <span className={classes.logo}><span className={classes.logoPlay} /></span>
            <span className={classes.brandName}>CALLSFLOW</span>
          </div>

          <div className={classes.card}>
            <div className={classes.header}>
              <Field
                {...shared}
                id="eyebrow"
                wrapClassName={classes.eyebrowWrap}
                className={classes.eyebrow}
                value={copy.eyebrow}
                onChange={set('eyebrow')}
                max={lim('eyebrow')}
                placeholder="Add a small label (optional)"
              />
              <Field
                {...shared}
                id="headline"
                wrapClassName={classes.headlineWrap}
                className={classes.headline}
                value={copy.headline}
                onChange={set('headline')}
                max={lim('headline')}
                placeholder="Write a headline"
                invalid={missingHeadline}
                tokens
              />
              <Field
                {...shared}
                id="sub"
                className={classes.sub}
                value={copy.sub}
                onChange={set('sub')}
                max={lim('sub')}
                placeholder="Add a line under the headline (optional)"
                multiline
                tokens
              />
            </div>

            <div className={classes.content}>
              <Field
                {...shared}
                id="intro"
                wrapClassName={classes.introWrap}
                value={copy.intro}
                onChange={set('intro')}
                max={lim('intro')}
                placeholder="Write your opening line…"
                invalid={missingMessage}
                multiline
                tokens
              />
              <Field
                {...shared}
                id="body"
                wrapClassName={classes.bodyWrap}
                className={classes.body}
                value={copy.body}
                onChange={set('body')}
                max={lim('body')}
                placeholder="Write your message… Leave a blank line between paragraphs."
                invalid={missingMessage}
                multiline
                tokens
              />

              <div
                ref={ctaWrapRef}
                className={classes.ctaWrap}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && ctaOpen) {
                    e.stopPropagation();
                    closeCta();
                  }
                }}
                onBlur={(e) => {
                  if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) closeCta();
                }}
              >
                {ctaOn ? (
                  <>
                    <div className={`${classes.cta} ${ctaOpen ? classes.ctaOpen : ''}`}>
                      <EditableText
                        ref={(el) => { fieldRefs.current.cta = el; }}
                        value={copy.cta}
                        onChange={set('cta')}
                        maxLength={lim('cta')}
                        placeholder="Button text"
                        ariaLabel="Button text"
                        onFocus={() => setCtaOpen(true)}
                      />
                    </div>
                    {ctaOpen ? (
                      <div className={classes.popover} tabIndex={-1} role="group" aria-label="Button settings">
                        <p className={classes.popLabel}>Quick labels</p>
                        <div className={classes.chips}>
                          {CTA_TEXT_SUGGESTIONS.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`${classes.chip} ${copy.cta === t ? classes.chipActive : ''}`}
                              onMouseDown={keepFocus}
                              onClick={() => set('cta')(t)}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <label className={classes.popLabel} htmlFor="mc-cta-link">Goes to</label>
                        <select
                          id="mc-cta-link"
                          className={classes.popSelect}
                          value={linkValue}
                          onChange={(e) => onLinkSelect(e.target.value)}
                        >
                          {CTA_LINKS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                          <option value={CUSTOM_LINK}>Custom link…</option>
                        </select>
                        {linkValue === CUSTOM_LINK ? (
                          <>
                            <input
                              className={`${classes.popInput} ${linkValid ? '' : classes.popInputError}`}
                              value={copy.ctaUrl}
                              placeholder="https://… or /app/…"
                              aria-label="Custom button link"
                              aria-invalid={!linkValid}
                              onChange={(e) => set('ctaUrl')(e.target.value)}
                            />
                            {!linkValid ? (
                              <p className={classes.popError}>Use a full https:// link or an app path like /app/billing.</p>
                            ) : null}
                          </>
                        ) : null}
                        <button type="button" className={classes.popRemove} onMouseDown={keepFocus} onClick={removeCta}>
                          <Trash2 size={13} />
                          Remove button
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <button type="button" className={classes.addChip} onClick={addCta}>
                    <Plus size={14} />
                    Add button
                  </button>
                )}
              </div>
            </div>

            <div className={classes.stepsWrap}>
              {steps.length ? (
                <div className={classes.stepsBox}>
                  <Field
                    {...shared}
                    id="nextTitle"
                    wrapClassName={classes.stepsTitleWrap}
                    className={classes.stepsTitle}
                    value={copy.nextTitle}
                    onChange={set('nextTitle')}
                    max={lim('nextTitle')}
                    placeholder="Next steps"
                  />
                  <ul className={classes.steps}>
                    {steps.map((step, i) => (
                      // Steps have no identity beyond their position.
                       
                      <li key={i} className={classes.step}>
                        <Field
                          {...shared}
                          id={`step-${i}`}
                          value={step}
                          onChange={setStep(i)}
                          max={lim('nextItem')}
                          placeholder="Describe this step"
                          ariaLabel={`Step ${i + 1}`}
                          onEnter={() => addStep(i)}
                          onBackspaceEmpty={() => removeStep(i, { refocus: true })}
                          tokens
                        />
                        <button
                          type="button"
                          className={classes.stepRemove}
                          onClick={() => removeStep(i)}
                          aria-label={`Remove step ${i + 1}`}
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={classes.stepsActions}>
                    <button type="button" className={classes.addStep} onClick={() => addStep()} disabled={stepsFull}>
                      <Plus size={13} />
                      {stepsFull ? `${MAX_STEPS} steps max` : 'Add step'}
                    </button>
                    <button type="button" className={classes.removeBox} onClick={() => setCopy((c) => ({ ...c, next: [] }))}>
                      Remove box
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={classes.addChip} onClick={() => addStep()}>
                  <Plus size={14} />
                  Add steps box
                </button>
              )}
            </div>

            <div className={classes.footer}>
              <span className={classes.lockNote}>
                <Lock size={11} />
                Always included
              </span>
              Need help? Reply to this email and our team will assist you. To stop these Medicare updates, reply with STOP.
              <br />
              <strong>— The CallsFlow Team</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
});

EmailEditor.propTypes = {
  copy: PropTypes.shape({
    subject: PropTypes.string,
    preheader: PropTypes.string,
    eyebrow: PropTypes.string,
    headline: PropTypes.string,
    sub: PropTypes.string,
    intro: PropTypes.string,
    body: PropTypes.string,
    cta: PropTypes.string,
    ctaUrl: PropTypes.string,
    nextTitle: PropTypes.string,
    next: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  setCopy: PropTypes.func.isRequired,
  limits: PropTypes.object,
};

export default EmailEditor;
