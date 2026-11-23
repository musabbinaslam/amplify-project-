import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Mail,
  MessageSquare,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import shared from '../adminShared.module.css';
import classes from './ApplicationsDesk.module.css';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const STATUS_LABEL = {
  pending: 'Pending',
  rejected: 'Rejected',
  suspended: 'Suspended',
  active: 'Approved',
};

function pillClass(status) {
  if (status === 'pending') return shared.dispPending;
  if (status === 'rejected') return shared.dispMissed;
  if (status === 'suspended') return shared.dispSold;
  return shared.dispAnswered;
}

function submittedMs(agency) {
  const t = Date.parse(agency?.application?.submittedAt || agency?.createdAt || '');
  return Number.isFinite(t) ? t : 0;
}

/** "3h ago" for anything in the last 30 days; empty once a plain date reads better. */
function timeAgo(ms, now = Date.now()) {
  if (!ms) return '';
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : '';
}

function shortDate(ms) {
  return ms ? new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

function fullDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function websiteHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function founderUidOf(agency) {
  return agency?.createdByUid || agency?.application?.founderUid || '';
}

/** A rejected application the founder cleared to re-apply; the backend refuses to approve it. */
function isRetired(agency) {
  return agency?.status === 'rejected' && String(agency.slug || '').startsWith('rejected-');
}

function StatusPill({ status }) {
  return (
    <span className={`${shared.statusPill} ${pillClass(status)} ${classes.pill}`}>
      {STATUS_LABEL[status] || 'Approved'}
    </span>
  );
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(`Could not copy the ${label}`);
    }
  };

  return (
    <button
      type="button"
      className={`${classes.copyBtn} ${copied ? classes.copyBtnDone : ''}`}
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? 'Copied' : `Copy ${label}`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Spec({ label, children }) {
  return (
    <div className={classes.spec}>
      <dt className={classes.specLabel}>{label}</dt>
      <dd className={classes.specValue}>
        {children || <span className={classes.specEmpty}>Not provided</span>}
      </dd>
    </div>
  );
}

function QueueRow({ agency, active, onOpen, index = 0 }) {
  const app = agency.application || {};
  const ms = submittedMs(agency);
  return (
    <li
      className={classes.rowItem}
      style={{ '--i': Math.min(index, 12) }}
    >
      <button
        type="button"
        data-row
        className={`${classes.row} ${active ? classes.rowActive : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onOpen(agency.id)}
      >
        <span className={classes.rowMain}>
          <span className={classes.rowName}>{agency.name || 'Unnamed agency'}</span>
          <span className={classes.rowSub}>
            <span className={classes.rowFounder}>
              {app.founderName || app.founderEmail || 'Applicant'}
            </span>
            {app.founderName && app.founderEmail ? (
              <span className={classes.rowEmail}>{app.founderEmail}</span>
            ) : null}
          </span>
        </span>
        <span className={classes.rowMeta}>
          {ms ? <time className={classes.rowTime} dateTime={new Date(ms).toISOString()}>{timeAgo(ms) || shortDate(ms)}</time> : null}
          <StatusPill status={agency.status} />
        </span>
        <ChevronRight size={16} className={classes.rowChevron} aria-hidden="true" />
      </button>
    </li>
  );
}

function SuccessCheck({ animate }) {
  return (
    <svg
      className={`${classes.successCheck} ${animate ? classes.successCheckAnimate : ''}`}
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10.25" pathLength="1" />
      <path d="M7.5 12.4l3.1 3.1 5.9-6.4" pathLength="1" />
    </svg>
  );
}

export default function ApplicationsDesk({
  applications,
  focused,
  busyId,
  messagingUid,
  celebrateId,
  onOpen,
  onBack,
  onApprove,
  onReject,
  onOpenAgency,
  onMessage,
}) {
  const [filter, setFilter] = useState(() => (focused?.status === 'rejected' ? 'rejected' : 'pending'));
  const [query, setQuery] = useState('');
  const [reasons, setReasons] = useState({});
  const listRef = useRef(null);

  const sorted = useMemo(
    () => [...applications].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return submittedMs(b) - submittedMs(a)
        || String(a.name || '').localeCompare(String(b.name || ''));
    }),
    [applications],
  );

  const counts = useMemo(() => {
    const pending = sorted.filter((a) => a.status === 'pending').length;
    return { pending, rejected: sorted.length - pending, all: sorted.length };
  }, [sorted]);

  const q = query.trim().toLowerCase();

  const queue = useMemo(() => {
    const visible = sorted.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (!q) return true;
      const app = a.application || {};
      return [a.name, app.founderName, app.founderEmail]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
    // Keep the open application in the queue even once its status leaves the filter
    // (e.g. just approved), so the reviewer never loses their place.
    if (focused && !q && !visible.some((a) => a.id === focused.id)) {
      return [focused, ...visible];
    }
    return visible;
  }, [sorted, filter, q, focused]);

  const nextPending = useMemo(
    () => sorted.find((a) => a.status === 'pending' && a.id !== focused?.id) || null,
    [sorted, focused?.id],
  );

  // New filter / search results start at the top of the capped scrollpane.
  useEffect(() => {
    const pane = listRef.current?.closest(`.${classes.listBody}, .${classes.queueList}`);
    if (pane) pane.scrollTop = 0;
  }, [filter, q]);

  const onListKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = Array.from(e.currentTarget.querySelectorAll('button[data-row]'));
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown'
      ? rows[Math.min(i + 1, rows.length - 1)]
      : rows[Math.max(i - 1, 0)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key !== 'ArrowDown') return;
    const first = listRef.current?.querySelector('button[data-row]');
    if (first) {
      e.preventDefault();
      first.focus();
    }
  };

  const controls = (
    <div className={classes.controls}>
      <div className={classes.filters} role="group" aria-label="Filter applications">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${shared.filterBtn} ${classes.filterBtn} ${filter === f.id ? shared.filterBtnActive : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className={classes.filterCount}>{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <div className={classes.search}>
        <Search size={15} className={classes.searchIcon} aria-hidden="true" />
        <input
          className={`${shared.input} ${classes.searchInput}`}
          type="search"
          placeholder="Search agency, founder, or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          aria-label="Search applications"
        />
      </div>
    </div>
  );

  const listKey = `${filter}:${q}`;

  let emptyState = null;
  if (!queue.length) {
    if (q) {
      emptyState = (
        <div key={listKey} className={classes.empty}>
          <h4>No matches</h4>
          <p>Nothing in {filter === 'all' ? 'applications' : `${filter} applications`} matches “{query.trim()}”.</p>
          <button type="button" className={shared.linkBtn} onClick={() => setQuery('')}>Clear search</button>
        </div>
      );
    } else if (!counts.all) {
      emptyState = (
        <div key={listKey} className={classes.empty}>
          <Building2 size={24} className={classes.emptyIcon} aria-hidden="true" />
          <h4>No applications yet</h4>
          <p>New agency signups land here for review.</p>
        </div>
      );
    } else if (filter === 'pending') {
      emptyState = (
        <div key={listKey} className={classes.empty}>
          <Check size={24} className={classes.emptyIcon} aria-hidden="true" />
          <h4>No pending applications</h4>
          <p>Every application has been reviewed.</p>
          {counts.rejected ? (
            <button type="button" className={shared.linkBtn} onClick={() => setFilter('rejected')}>
              View {counts.rejected} rejected
            </button>
          ) : null}
        </div>
      );
    } else {
      emptyState = (
        <div key={listKey} className={classes.empty}>
          <h4>No rejected applications</h4>
          <p>Applications you turn down stay here, so you can re-approve them later.</p>
        </div>
      );
    }
  }

  const list = emptyState || (
    <ul
      key={listKey}
      className={classes.rows}
      ref={listRef}
      onKeyDown={onListKeyDown}
    >
      {queue.map((agency, index) => (
        <QueueRow
          key={agency.id}
          agency={agency}
          active={agency.id === focused?.id}
          onOpen={onOpen}
          index={index}
        />
      ))}
    </ul>
  );

  const listFooter = queue.length > 6 ? (
    <div className={classes.listFooter}>
      {queue.length} applications · scroll for more
    </div>
  ) : null;

  if (!focused) {
    return (
      <div className={classes.root}>
        <div className={`glass ${classes.listStage}`}>
          {controls}
          <div className={classes.listBody}>
            {list}
            {listFooter}
          </div>
        </div>
      </div>
    );
  }

  const app = focused.application || {};
  const ms = submittedMs(focused);
  const busy = busyId === focused.id;
  const founderUid = founderUidOf(focused);
  const verticals = toList(app.verticals);
  const site = websiteHref(app.website);
  const reason = reasons[focused.id] || '';
  const isPending = focused.status === 'pending';
  const isRejected = focused.status === 'rejected';
  const isApproved = !isPending && !isRejected;
  const retired = isRetired(focused);
  const founderLabel = app.founderName || 'The founder';

  const contactActions = (
    <div className={classes.quietActions}>
      {app.founderEmail ? (
        <a className={classes.quietBtn} href={`mailto:${app.founderEmail}`}>
          <Mail size={15} aria-hidden="true" />
          Email
        </a>
      ) : null}
      {founderUid ? (
        <button
          type="button"
          className={classes.quietBtn}
          disabled={messagingUid === founderUid}
          onClick={() => onMessage(focused)}
        >
          <MessageSquare size={15} aria-hidden="true" />
          {messagingUid === founderUid ? 'Opening…' : 'Message'}
        </button>
      ) : null}
    </div>
  );

  const nextButton = nextPending ? (
    <button type="button" className={classes.nextBtn} onClick={() => onOpen(nextPending.id)}>
      Next pending
      <ArrowRight size={15} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div className={classes.root}>
      <div className={`glass ${classes.desk}`}>
        <aside className={classes.queue} aria-label="Applications queue">
          {controls}
          <div className={classes.queueScroll}>
            <div className={classes.queueList}>{list}</div>
          </div>
        </aside>

        <section
          key={focused.id}
          className={classes.review}
          aria-label={`Application from ${focused.name || 'agency'}`}
        >
          <header className={classes.reviewHead}>
            <button type="button" className={classes.back} onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" />
              All applications
            </button>
            <div className={classes.titleRow}>
              <h3 className={classes.title}>{focused.name || 'Unnamed agency'}</h3>
              <StatusPill status={focused.status} />
            </div>
            <p className={classes.submitted}>
              {ms ? (
                <>
                  Submitted {fullDate(ms)}
                  {timeAgo(ms) ? <span className={classes.submittedAgo}>{timeAgo(ms)}</span> : null}
                </>
              ) : 'Submission date not recorded'}
            </p>
          </header>

          <div className={classes.reviewBody}>
            <div className={classes.section}>
              <h4 className={classes.sectionTitle}>Contact</h4>
              <dl className={classes.specGrid}>
                <Spec label="Founder">{app.founderName}</Spec>
                <Spec label="Email">
                  {app.founderEmail ? (
                    <span className={classes.specInline}>
                      <a className={classes.specLink} href={`mailto:${app.founderEmail}`}>{app.founderEmail}</a>
                      <CopyButton value={app.founderEmail} label="email" />
                    </span>
                  ) : null}
                </Spec>
                <Spec label="Phone">
                  {app.phone ? (
                    <span className={classes.specInline}>
                      <a className={classes.specLink} href={`tel:${String(app.phone).replace(/[^\d+]/g, '')}`}>{app.phone}</a>
                      <CopyButton value={String(app.phone)} label="phone number" />
                    </span>
                  ) : null}
                </Spec>
                <Spec label="Website">
                  {site ? (
                    <a className={classes.specLink} href={site} target="_blank" rel="noopener noreferrer">
                      {String(app.website).replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                    </a>
                  ) : null}
                </Spec>
              </dl>
            </div>

            <div className={classes.section}>
              <h4 className={classes.sectionTitle}>Business fit</h4>
              <dl className={classes.specGrid}>
                <Spec label="Weekly spend">{app.weeklySpend}</Spec>
                <Spec label="Used inbound before">{app.usedInbound}</Spec>
                <Spec label="Verticals">
                  {verticals.length ? (
                    <span className={classes.chips}>
                      {verticals.map((v) => <span key={v} className={classes.chip}>{v}</span>)}
                    </span>
                  ) : null}
                </Spec>
                <Spec label="Heard about us">{app.hearAbout}</Spec>
              </dl>
            </div>

            {isRejected ? (
              <div className={classes.rejectedNote} role="note">
                <span className={classes.rejectedNoteLabel}>
                  Rejected{focused.reviewedAt ? ` ${fullDate(Date.parse(focused.reviewedAt))}` : ''}
                </span>
                <p>{focused.rejectReason || 'No reason was given.'}</p>
                {retired ? (
                  <p className={classes.rejectedNoteHint}>
                    The founder cleared this application to re-apply, so it can no longer be approved.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <footer className={classes.rail}>
            {isApproved ? (
              <div className={classes.success} role="status">
                <SuccessCheck animate={celebrateId === focused.id} />
                <div className={classes.successText}>
                  <strong>
                    {focused.status === 'suspended' ? 'Approved, currently suspended' : 'Approved'}
                  </strong>
                  <span>
                    {focused.status === 'suspended'
                      ? `${focused.name} was approved as an agency and is paused right now.`
                      : `${focused.name} is an active agency. ${founderLabel} has been notified and can invite agents.`}
                  </span>
                </div>
              </div>
            ) : null}

            {isPending ? (
              <div className={classes.reasonField}>
                <label htmlFor={`reject-reason-${focused.id}`}>
                  Reason if you reject
                  <span>Optional · the founder sees it</span>
                </label>
                <input
                  id={`reject-reason-${focused.id}`}
                  className={shared.input}
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [focused.id]: e.target.value }))}
                  placeholder="Missing license, incomplete info…"
                />
              </div>
            ) : null}

            <div className={classes.railActions}>
              {isApproved ? (
                <button type="button" className={shared.primaryBtn} onClick={() => onOpenAgency(focused.id)}>
                  Open agency
                </button>
              ) : null}
              {(isPending || (isRejected && !retired)) ? (
                <button
                  type="button"
                  className={shared.primaryBtn}
                  disabled={busy}
                  onClick={() => onApprove(focused)}
                >
                  <Check size={16} aria-hidden="true" />
                  {isRejected ? 'Re-approve' : 'Approve'}
                </button>
              ) : null}
              {isPending ? (
                <button
                  type="button"
                  className={`${shared.dangerBtn} ${classes.rejectBtn}`}
                  disabled={busy}
                  onClick={() => onReject(focused, reason.trim())}
                >
                  Reject
                </button>
              ) : null}
              {!isPending ? nextButton : null}
              {contactActions}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

const agencyShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string,
  status: PropTypes.string,
  slug: PropTypes.string,
  rejectReason: PropTypes.string,
  reviewedAt: PropTypes.string,
  createdByUid: PropTypes.string,
  application: PropTypes.object,
});

StatusPill.propTypes = { status: PropTypes.string };
CopyButton.propTypes = { value: PropTypes.string.isRequired, label: PropTypes.string.isRequired };
Spec.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };
QueueRow.propTypes = {
  agency: agencyShape.isRequired,
  active: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  index: PropTypes.number,
};
SuccessCheck.propTypes = { animate: PropTypes.bool };

ApplicationsDesk.propTypes = {
  applications: PropTypes.arrayOf(agencyShape).isRequired,
  focused: agencyShape,
  busyId: PropTypes.string,
  messagingUid: PropTypes.string,
  celebrateId: PropTypes.string,
  onOpen: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
  onOpenAgency: PropTypes.func.isRequired,
  onMessage: PropTypes.func.isRequired,
};
