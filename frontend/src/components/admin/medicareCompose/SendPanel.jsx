import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Loader2, RefreshCw, Search, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  countMedicareCustomAudience,
  listMedicareCustomRecipients,
  sendMedicareCustomTestEmail,
} from '../../../services/adminService';
import { PREVIEW_NAME, toPayload } from './copyModel';
import classes from './SendPanel.module.css';

const STATUS_LABELS = {
  queued: 'Queued',
  pending: 'Pending',
  email1_sent: 'Email 1 sent',
  email2_sent: 'Email 2 sent',
  exhausted: 'Exhausted',
  converted: 'Converted',
};
const MAX_ROWS = 200;

function matches(person, query) {
  if (!query) return true;
  const haystack = `${person.name || ''} ${person.email || ''} ${STATUS_LABELS[person.status] || ''}`.toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

/** The right-hand column: who the email goes to, a test send, and the way into the final review. */
export default function SendPanel({
  copy,
  audiences,
  mode,
  onModeChange,
  audience,
  onAudienceChange,
  selected,
  onSelectedChange,
  defaultTestTo,
  testName,
  running,
  validate,
  onReview,
}) {
  const [count, setCount] = useState(null);
  const [countState, setCountState] = useState('loading');
  const [people, setPeople] = useState([]);
  const [peopleState, setPeopleState] = useState('idle');
  const [peopleError, setPeopleError] = useState('');
  const [query, setQuery] = useState('');
  const [testTo, setTestTo] = useState(defaultTestTo || '');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(null);
  const countSeq = useRef(0);
  const testTouched = useRef(false);

  // The signed-in admin can arrive after first paint; prefill until they type their own address.
  useEffect(() => {
    if (!testTouched.current && defaultTestTo) setTestTo(defaultTestTo);
  }, [defaultTestTo]);

  useEffect(() => {
    if (mode !== 'group' || !audience) return;
    const seq = ++countSeq.current;
    setCountState('loading');
    countMedicareCustomAudience(audience)
      .then((out) => {
        if (seq !== countSeq.current) return;
        setCount(Number(out?.count) || 0);
        setCountState('ready');
      })
      .catch(() => {
        if (seq !== countSeq.current) return;
        setCountState('error');
      });
  }, [mode, audience]);

  const loadPeople = useCallback(async () => {
    setPeopleState('loading');
    try {
      const out = await listMedicareCustomRecipients();
      const items = Array.isArray(out?.items) ? out.items : [];
      setPeople(items);
      setPeopleState('ready');
      // Drop anyone who paid or opted out since they were picked.
      const alive = new Set(items.map((p) => p.uid));
      onSelectedChange((prev) => prev.filter((p) => alive.has(p.uid)));
    } catch (err) {
      setPeopleError(err?.message || '');
      setPeopleState('error');
    }
  }, [onSelectedChange]);

  useEffect(() => {
    if (mode === 'people' && peopleState === 'idle') loadPeople();
  }, [mode, peopleState, loadPeople]);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.uid)), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => matches(p, q));
  }, [people, query]);
  const shown = filtered.slice(0, MAX_ROWS);
  const allShownSelected = shown.length > 0 && shown.every((p) => selectedIds.has(p.uid));

  const toggle = (person) => {
    onSelectedChange((prev) => (
      prev.some((p) => p.uid === person.uid)
        ? prev.filter((p) => p.uid !== person.uid)
        : [...prev, person]
    ));
  };

  const toggleShown = () => {
    const shownIds = new Set(shown.map((p) => p.uid));
    onSelectedChange((prev) => {
      if (allShownSelected) return prev.filter((p) => !shownIds.has(p.uid));
      const have = new Set(prev.map((p) => p.uid));
      return [...prev, ...shown.filter((p) => !have.has(p.uid))];
    });
  };

  const sendTest = async () => {
    if (!validate()) return;
    setTesting(true);
    try {
      const out = await sendMedicareCustomTestEmail({
        copy: toPayload(copy),
        to: testTo.trim(),
        name: testName || PREVIEW_NAME,
      });
      setTested({ to: out?.to || testTo.trim(), at: new Date() });
      toast.success(`Test sent to ${out?.to || testTo.trim()}`);
    } catch (err) {
      toast.error(err.message || 'Test send failed');
    } finally {
      setTesting(false);
    }
  };

  const includesPaid = mode === 'people' || audiences.find((a) => a.key === audience)?.includesPaid === true;
  const testReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  return (
    <div className={classes.panel}>
      <section className={classes.section}>
        <h3 className={classes.heading}>Send to</h3>
        <div className={classes.segmented} role="radiogroup" aria-label="Who gets this email">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'group'}
            className={`${classes.segment} ${mode === 'group' ? classes.segmentActive : ''}`}
            onClick={() => onModeChange('group')}
          >
            A group
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'people'}
            className={`${classes.segment} ${mode === 'people' ? classes.segmentActive : ''}`}
            onClick={() => onModeChange('people')}
          >
            Specific people
          </button>
        </div>

        {mode === 'group' ? (
          <>
            <select
              className={classes.select}
              value={audience}
              onChange={(e) => onAudienceChange(e.target.value)}
              aria-label="Medicare group"
            >
              {audiences.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <p className={classes.note} aria-live="polite">
              {countState === 'loading' ? <><Loader2 size={12} className={classes.spin} />Counting…</> : null}
              {countState === 'ready' ? <><strong>{count} {count === 1 ? 'person' : 'people'}</strong> in this group right now.</> : null}
              {countState === 'error' ? 'Could not count this group.' : null}
            </p>
          </>
        ) : (
          <>
            <div className={classes.searchWrap}>
              <Search size={14} className={classes.searchIcon} />
              <input
                className={`${classes.input} ${classes.searchInput}`}
                type="search"
                value={query}
                placeholder="Search by name or email"
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search Medicare targets"
              />
            </div>

            <div className={classes.list} role="group" aria-label="Medicare targets">
              {peopleState === 'loading' || peopleState === 'idle' ? (
                <p className={classes.listState}><Loader2 size={14} className={classes.spin} />Loading Medicare targets…</p>
              ) : null}
              {peopleState === 'error' ? (
                <p className={classes.listState}>
                  Could not load the list{peopleError ? `: ${peopleError}` : '.'}
                  <button type="button" className={classes.linkBtn} onClick={loadPeople}>Try again</button>
                </p>
              ) : null}
              {peopleState === 'ready' && !people.length ? (
                <p className={classes.listState}>No Medicare targets right now.</p>
              ) : null}
              {peopleState === 'ready' && people.length > 0 && !shown.length ? (
                <p className={classes.listState}>Nobody matches “{query.trim()}”.</p>
              ) : null}
              {peopleState === 'ready' ? shown.map((person) => {
                const checked = selectedIds.has(person.uid);
                return (
                  <label key={person.uid} className={`${classes.row} ${checked ? classes.rowChecked : ''}`}>
                    <input
                      type="checkbox"
                      className={classes.checkbox}
                      checked={checked}
                      onChange={() => toggle(person)}
                    />
                    <span className={classes.box} aria-hidden="true">{checked ? <Check size={11} strokeWidth={3.2} /> : null}</span>
                    <span className={classes.who}>
                      <span className={classes.name}>{person.name || person.email}</span>
                      {person.name ? <span className={classes.email}>{person.email}</span> : null}
                    </span>
                    <span className={classes.status}>{STATUS_LABELS[person.status] || person.status}</span>
                  </label>
                );
              }) : null}
              {peopleState === 'ready' && filtered.length > shown.length ? (
                <p className={classes.listState}>Showing {shown.length} of {filtered.length}. Search to narrow it down.</p>
              ) : null}
            </div>

            <div className={classes.listFoot}>
              <span className={classes.note} aria-live="polite">
                <strong>{selected.length} selected</strong>
                {peopleState === 'ready' ? ` of ${people.length}` : ''}
              </span>
              <span className={classes.listActions}>
                {peopleState === 'ready' && shown.length > 0 ? (
                  <button type="button" className={classes.linkBtn} onClick={toggleShown}>
                    {allShownSelected ? 'Unselect' : 'Select'} {query.trim() ? `these ${shown.length}` : 'all'}
                  </button>
                ) : null}
                {selected.length > 0 ? (
                  <button type="button" className={classes.linkBtn} onClick={() => onSelectedChange([])}>
                    <X size={11} />Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  className={classes.iconBtn}
                  onClick={loadPeople}
                  disabled={peopleState === 'loading'}
                  aria-label="Reload the list"
                >
                  <RefreshCw size={12} className={peopleState === 'loading' ? classes.spin : ''} />
                </button>
              </span>
            </div>
          </>
        )}
        <p className={classes.fine}>
          {includesPaid
            ? 'Includes agents who already paid. Only opted-out agents are left out.'
            : 'Paid, converted and opted-out agents are skipped.'}
        </p>
      </section>

      <section className={classes.section}>
        <h3 className={classes.heading}>Send a test first</h3>
        <div className={classes.inline}>
          <input
            className={classes.input}
            type="email"
            value={testTo}
            placeholder="any@email.com"
            onChange={(e) => {
              testTouched.current = true;
              setTestTo(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && testReady && !testing) sendTest();
            }}
            aria-label="Test email address"
          />
          <button type="button" className={classes.secondaryBtn} onClick={sendTest} disabled={testing || !testReady}>
            {testing ? <Loader2 size={14} className={classes.spin} /> : null}
            Send test
          </button>
        </div>
        {tested ? (
          <p className={`${classes.note} ${classes.ok}`}>
            <Check size={13} />
            Sent to {tested.to} at {tested.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        ) : (
          <p className={classes.fine}>Goes only to that address, marked [TEST] in the subject.</p>
        )}
      </section>

      <section className={classes.section}>
        <button type="button" className={classes.primaryBtn} onClick={onReview}>
          <Send size={15} />
          Review &amp; send
        </button>
        <p className={`${classes.fine} ${running ? classes.warn : ''}`}>
          {running
            ? 'Another custom send is still running. You can review, but not send until it finishes.'
            : 'Nothing is sent until you confirm on the next step.'}
        </p>
      </section>
    </div>
  );
}

SendPanel.propTypes = {
  copy: PropTypes.shape({ subject: PropTypes.string, next: PropTypes.arrayOf(PropTypes.string) }).isRequired,
  audiences: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string,
    label: PropTypes.string,
    includesPaid: PropTypes.bool,
  })).isRequired,
  mode: PropTypes.oneOf(['group', 'people']).isRequired,
  onModeChange: PropTypes.func.isRequired,
  audience: PropTypes.string.isRequired,
  onAudienceChange: PropTypes.func.isRequired,
  selected: PropTypes.arrayOf(PropTypes.shape({ uid: PropTypes.string, name: PropTypes.string, email: PropTypes.string })).isRequired,
  onSelectedChange: PropTypes.func.isRequired,
  defaultTestTo: PropTypes.string,
  testName: PropTypes.string,
  running: PropTypes.bool,
  validate: PropTypes.func.isRequired,
  onReview: PropTypes.func.isRequired,
};
