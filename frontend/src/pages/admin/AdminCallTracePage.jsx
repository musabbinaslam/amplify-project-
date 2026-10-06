import { useMemo, useState } from 'react';
import {
  Search,
  Phone,
  Radio,
  Play,
  Clock,
  DollarSign,
  User,
  Hash,
  Activity,
  FileAudio,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { getAdminCallTrace } from '../../services/adminService';
import { ADMIN_CATEGORIES, ADMIN_MODULES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { RecordingModal } from '../../components/modals/RecordingModal';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../../motion/appMotion';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminCallTracePage.module.css';

const MODULE = ADMIN_MODULES.find((m) => m.id === 'call-trace');

const TYPE_META = {
  ping: { label: 'Ping', tone: 'cyan' },
  confirm: { label: 'Confirm', tone: 'amber' },
  incoming: { label: 'Incoming', tone: 'brand' },
  campaign_resolved: { label: 'Campaign', tone: 'brand' },
  active_snapshot: { label: 'Active', tone: 'cyan' },
  agent_leg_ended: { label: 'Agent leg', tone: 'red' },
  wrap_up: { label: 'Wrap-up', tone: 'red' },
  wallet: { label: 'Wallet', tone: 'amber' },
  billing: { label: 'Billing', tone: 'amber' },
};

function formatTime(at) {
  if (!at) return '—';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatDuration(sec) {
  const n = Number(sec) || 0;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function eventTitle(e) {
  if (e.type === 'ping') return e.available ? 'AVAILABLE (1)' : 'BUSY (0)';
  if (e.type === 'confirm') return e.detail || (e.available ? 'Accept' : 'Reject');
  if (e.type === 'incoming') return e.to ? `To ${e.to}` : 'Inbound call';
  if (e.type === 'campaign_resolved') return e.campaignId || 'Campaign resolved';
  if (e.type === 'billing') return e.detail || 'Billed';
  if (e.type === 'wallet') return e.detail || 'Wallet debit';
  if (e.type === 'wrap_up') return 'Disposition pending';
  if (e.type === 'agent_leg_ended') return e.detail || 'Leg ended';
  if (e.type === 'active_snapshot') return 'Routed / in call';
  return TYPE_META[e.type]?.label || e.type;
}

/* eslint-disable react/prop-types */
function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className={classes.copyBtn}
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          toast.error('Could not copy');
        }
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className={classes.statPill}>
      <Icon size={14} aria-hidden="true" />
      <div>
        <span className={classes.statLabel}>{label}</span>
        <strong className={classes.statValue}>{value}</strong>
      </div>
    </div>
  );
}

export default function AdminCallTracePage() {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState(null);
  const [playLog, setPlayLog] = useState(null);

  const runSearch = async (raw) => {
    const value = String(raw || q || '').trim();
    if (!value) {
      toast.error('Enter a phone number or CallSid');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const out = await getAdminCallTrace(value);
      setResult(out);
    } catch (err) {
      toast.error(err.message || 'Lookup failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const timeline = useMemo(
    () => [...(result?.timeline || [])].sort((a, b) => (a.at || 0) - (b.at || 0)),
    [result],
  );
  const logs = result?.callLogs || [];
  const live = result?.live;
  const agentMeta = result?.agentMeta || {};
  const query = result?.query || {};
  const hasResults = timeline.length > 0 || logs.length > 0 || Boolean(live);

  return (
    <AdminPageShell
      title={MODULE?.title || 'Call Trace'}
      description={MODULE?.description}
      icon={Search}
      category={ADMIN_CATEGORIES.operations}
    >
      <motion.form
        className={`glass ${shared.sectionCard} ${classes.searchCard}`}
        variants={presets.child}
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className={classes.searchIntro}>
          <h3>Look up a call path</h3>
          <p>Same story as PM2 grep — pings, route, wrap-up, billing — without SSH.</p>
        </div>
        <div className={classes.searchRow}>
          <div className={classes.inputWrap}>
            <Search size={16} className={classes.inputIcon} aria-hidden="true" />
            <input
              id="call-trace-q"
              className={classes.searchField}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="7133808988 or CA4948d2…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="submit" className={`${shared.primaryBtn} ${classes.searchBtn}`} disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={15} className={classes.spin} /> Searching
              </>
            ) : (
              'Search'
            )}
          </button>
        </div>
      </motion.form>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            className={classes.skeletonGrid}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_SMOOTH }}
          >
            <div className={`glass ${classes.skeletonBlock}`} />
            <div className={`glass ${classes.skeletonBlock}`} />
          </motion.div>
        ) : null}

        {!loading && searched && result && hasResults ? (
          <motion.div
            key="results"
            className={classes.results}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE_SMOOTH }}
          >
            <div className={classes.summaryRow}>
              <StatPill icon={Activity} label="Timeline events" value={timeline.length} />
              <StatPill icon={FileAudio} label="Call logs" value={logs.length} />
              <StatPill
                icon={Radio}
                label="Live"
                value={live ? 'In call' : 'Idle'}
              />
              <StatPill
                icon={Phone}
                label="Normalized"
                value={query.e164 || query.callSid || query.last10 || '—'}
              />
            </div>

            {live ? (
              <div className={`glass ${classes.liveBanner}`}>
                <span className={classes.liveDot} aria-hidden="true" />
                <div className={classes.liveCopy}>
                  <strong>Live right now</strong>
                  <span>
                    {agentMeta[live.agentId] || live.agentId || 'Agent'}
                    {live.campaignId ? ` · ${live.campaignId}` : ''}
                    {live.callSid ? ` · ${live.callSid}` : ''}
                  </span>
                </div>
                {live.callSid ? <CopyButton value={live.callSid} /> : null}
              </div>
            ) : null}

            <div className={classes.split}>
              <section className={`glass ${shared.sectionCard} ${classes.panel}`}>
                <div className={classes.panelHead}>
                  <h3>Timeline</h3>
                  <span className={classes.panelCount}>{timeline.length}</span>
                </div>
                {timeline.length === 0 ? (
                  <div className={classes.panelEmpty}>
                    No Redis events yet for this number. Pings/routes appear after this build is live on the API.
                    Call logs below still come from Firestore.
                  </div>
                ) : (
                  <ol className={classes.timeline}>
                    {timeline.map((e, idx) => {
                      const meta = TYPE_META[e.type] || { label: e.type, tone: 'muted' };
                      return (
                        <li key={e.id || `${e.type}-${e.at}-${idx}`} className={classes.event}>
                          <div className={classes.rail}>
                            <span className={`${classes.dot} ${classes[`dot_${meta.tone}`]}`} />
                            {idx < timeline.length - 1 ? <span className={classes.line} /> : null}
                          </div>
                          <div className={classes.eventCard}>
                            <div className={classes.eventTop}>
                              <span className={`${classes.badge} ${classes[`tone_${meta.tone}`]}`}>
                                {meta.label}
                              </span>
                              <time className={classes.eventTime}>{formatTime(e.at)}</time>
                            </div>
                            <p className={classes.eventTitle}>{eventTitle(e)}</p>
                            <div className={classes.eventMeta}>
                              {e.campaignId ? <span>{e.campaignId}</span> : null}
                              {e.state ? <span>{e.state}</span> : null}
                              {e.agencyId ? <span>{e.agencyId}</span> : null}
                              {e.agentId ? <span>{agentMeta[e.agentId] || e.agentId}</span> : null}
                              {e.reason ? <span>{e.reason}</span> : null}
                            </div>
                            {e.callSid ? (
                              <div className={classes.sidRow}>
                                <code className={classes.sid}>{e.callSid}</code>
                                <CopyButton value={e.callSid} />
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className={`glass ${shared.sectionCard} ${classes.panel}`}>
                <div className={classes.panelHead}>
                  <h3>Call logs</h3>
                  <span className={classes.panelCount}>{logs.length}</span>
                </div>
                {logs.length === 0 ? (
                  <div className={classes.panelEmpty}>No completed call logs matched this From / CallSid.</div>
                ) : (
                  <div className={classes.logList}>
                    {logs.map((log) => (
                      <article key={log.id} className={classes.logCard}>
                        <div className={classes.logTop}>
                          <div className={classes.logIdentity}>
                            <Phone size={15} aria-hidden="true" />
                            <div>
                              <strong className={classes.logPhone}>{log.from || '—'}</strong>
                              <span className={classes.logCampaign}>
                                {log.campaignLabel || log.campaign || 'Unknown campaign'}
                              </span>
                            </div>
                          </div>
                          <span className={`${classes.statusChip} ${log.isBillable ? classes.statusPaid : ''}`}>
                            {log.isBillable ? 'Billable' : log.status || '—'}
                          </span>
                        </div>

                        <div className={classes.metricGrid}>
                          <div className={classes.metric}>
                            <Clock size={13} />
                            <span>{formatDuration(log.duration)}</span>
                          </div>
                          <div className={classes.metric}>
                            <DollarSign size={13} />
                            <span>${Number(log.cost || 0).toFixed(2)}</span>
                          </div>
                          <div className={classes.metric}>
                            <User size={13} />
                            <span>{agentMeta[log.agentId] || log.agentId || '—'}</span>
                          </div>
                          {log.disposition ? (
                            <div className={classes.metric}>
                              <Hash size={13} />
                              <span>{log.disposition}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className={classes.logFoot}>
                          <span className={classes.logWhen}>{formatTime(log.createdAt)}</span>
                          {log.callSid ? (
                            <span className={classes.sidRow}>
                              <code className={classes.sid}>{log.callSid}</code>
                              <CopyButton value={log.callSid} />
                            </span>
                          ) : null}
                          {(log.recordingSid || log.recordingUrl) ? (
                            <button
                              type="button"
                              className={classes.playBtn}
                              onClick={() => setPlayLog(log)}
                            >
                              <Play size={14} /> Play
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        ) : null}

        {!loading && searched && result && !hasResults ? (
          <motion.div
            key="empty"
            className={`glass ${shared.sectionCard} ${classes.emptyCard}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Search size={22} />
            <h3>Nothing matched</h3>
            <p>
              No timeline events or call logs for{' '}
              <strong>{query.e164 || query.callSid || q}</strong>.
              Timeline data only exists for traffic after this API deploy.
            </p>
          </motion.div>
        ) : null}

        {!loading && !searched ? (
          <motion.div
            key="idle"
            className={`glass ${shared.sectionCard} ${classes.emptyCard}`}
            variants={presets.child}
          >
            <Activity size={22} />
            <h3>Trace a caller</h3>
            <p>
              Paste a 10-digit number, E.164 (+1…), or Twilio CallSid. You&apos;ll get the ping/route timeline
              plus matching completed call logs.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {playLog ? (
        <RecordingModal log={playLog} onClose={() => setPlayLog(null)} />
      ) : null}
    </AdminPageShell>
  );
}
