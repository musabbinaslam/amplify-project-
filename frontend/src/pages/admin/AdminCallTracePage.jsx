import { useMemo, useState } from 'react';
import {
  Search,
  Phone,
  Radio,
  Play,
  Activity,
  FileAudio,
  Loader2,
  Copy,
  Check,
  DollarSign,
  Users,
  Wallet,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { getAdminCallTrace } from '../../services/adminService';
import { ADMIN_CATEGORIES, ADMIN_MODULES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { useForceChargeFlow } from '../../components/admin/ForceChargeFlow';
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

function shortSid(sid) {
  if (!sid) return '';
  const s = String(sid);
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function formatBalance(cents) {
  if (cents == null || !Number.isFinite(Number(cents))) return '—';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function resolveAgent(agentMeta, agentId) {
  if (!agentId) {
    return {
      name: '—',
      online: false,
      status: 'OFFLINE',
      statusLabel: 'Offline',
      balanceCents: null,
    };
  }
  const raw = agentMeta?.[agentId];
  if (!raw) {
    return {
      name: agentId,
      online: false,
      status: 'OFFLINE',
      statusLabel: 'Offline',
      balanceCents: null,
    };
  }
  if (typeof raw === 'string') {
    return {
      name: raw,
      online: false,
      status: 'OFFLINE',
      statusLabel: 'Offline',
      balanceCents: null,
    };
  }
  return {
    name: raw.name || agentId,
    online: Boolean(raw.online),
    status: raw.status || 'OFFLINE',
    statusLabel: raw.statusLabel || (raw.online ? 'Live' : 'Offline'),
    campaignId: raw.campaignId || null,
    balanceCents: Number.isFinite(Number(raw.balanceCents)) ? Number(raw.balanceCents) : null,
  };
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
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className={classes.copyBtn}
      title={label || 'Copy'}
      onClick={async (e) => {
        e.stopPropagation();
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

function agentInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function AgentLiveChip({ agent }) {
  const online = agent?.online;
  const tone = !online
    ? 'offline'
    : agent.status === 'IN_CALL' || agent.status === 'RINGING'
      ? 'busy'
      : agent.status === 'WRAP_UP'
        ? 'wrap'
        : 'live';
  return (
    <span className={`${classes.agentLiveChip} ${classes[`agentLive_${tone}`]}`} title={agent.statusLabel}>
      <span className={classes.agentLiveDot} aria-hidden="true" />
      {agent.statusLabel}
    </span>
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
  const showTimelineCol = timeline.length > 0;

  const tracedAgents = useMemo(() => {
    const ids = [
      ...logs.map((l) => l.agentId),
      live?.agentId,
      ...timeline.map((e) => e.agentId),
    ].filter(Boolean);
    const unique = [...new Set(ids)];
    return unique.map((id) => {
      const meta = resolveAgent(agentMeta, id);
      const callCount = logs.filter((l) => l.agentId === id).length;
      const recordingCount = logs.filter(
        (l) => l.agentId === id && (l.recordingSid || l.recordingUrl),
      ).length;
      return { id, ...meta, callCount, recordingCount };
    });
  }, [logs, live, timeline, agentMeta]);

  const { openForceCharge, actionLoading, forceChargeModals } = useForceChargeFlow({
    onSuccess: async () => {
      await runSearch(q);
    },
  });

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
        <div className={classes.searchRow}>
          <div className={classes.inputWrap}>
            <Search size={16} className={classes.inputIcon} aria-hidden="true" />
            <input
              id="call-trace-q"
              className={classes.searchField}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Phone or CallSid — e.g. 7133808988 or CA4948d2…"
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
            className={classes.skeletonBlock}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_SMOOTH }}
          />
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
              <StatPill icon={Activity} label="Timeline" value={timeline.length} />
              <StatPill icon={FileAudio} label="Call logs" value={logs.length} />
              <StatPill icon={Radio} label="Live" value={live ? 'In call' : 'Idle'} />
              <StatPill
                icon={Phone}
                label="Normalized"
                value={query.e164 || query.callSid || query.last10 || '—'}
              />
            </div>

            {tracedAgents.length > 0 ? (
              <section className={`glass ${shared.sectionCard} ${classes.agentsPanel}`}>
                <div className={classes.panelHead}>
                  <h3>
                    <Users size={16} aria-hidden="true" />
                    Agents on this trace
                  </h3>
                  <span className={classes.panelCount}>{tracedAgents.length}</span>
                </div>
                <div className={classes.agentsGrid}>
                  {tracedAgents.map((agent) => (
                    <article
                      key={agent.id}
                      className={`${classes.agentCard} ${agent.online ? classes.agentCardOnline : ''}`}
                    >
                      <div className={classes.agentCardHead}>
                        <div className={`${classes.agentAvatar} ${agent.online ? classes.agentAvatarOnline : ''}`}>
                          {agentInitials(agent.name)}
                        </div>
                        <div className={classes.agentCardIdentity}>
                          <strong title={agent.id}>{agent.name}</strong>
                          <span>{agent.id}</span>
                        </div>
                        <AgentLiveChip agent={agent} />
                      </div>

                      <div className={classes.agentStats}>
                        <div className={classes.agentStat}>
                          <Wallet size={14} aria-hidden="true" />
                          <div>
                            <span>Balance</span>
                            <strong>{formatBalance(agent.balanceCents)}</strong>
                          </div>
                        </div>
                        <div className={classes.agentStat}>
                          <FileAudio size={14} aria-hidden="true" />
                          <div>
                            <span>Logs</span>
                            <strong>{agent.callCount}</strong>
                          </div>
                        </div>
                        <div className={classes.agentStat}>
                          <Play size={14} aria-hidden="true" />
                          <div>
                            <span>Recordings</span>
                            <strong>{agent.recordingCount}</strong>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {live ? (
              <div className={`glass ${classes.liveBanner}`}>
                <span className={classes.liveDot} aria-hidden="true" />
                <div className={classes.liveCopy}>
                  <strong>Live right now</strong>
                  <span>
                    {resolveAgent(agentMeta, live.agentId).name || live.agentId || 'Agent'}
                    {live.campaignId ? ` · ${live.campaignId}` : ''}
                    {live.callSid ? ` · ${live.callSid}` : ''}
                  </span>
                </div>
                {live.callSid ? <CopyButton value={live.callSid} /> : null}
              </div>
            ) : null}

            {!showTimelineCol ? (
              <p className={classes.timelineHint}>
                No Redis timeline yet for this number — events fill in after live traffic hits this API build.
                Showing Firestore call logs.
              </p>
            ) : null}

            <div className={`${classes.split} ${showTimelineCol ? '' : classes.splitLogsOnly}`}>
              {showTimelineCol ? (
                <section className={`glass ${shared.sectionCard} ${classes.panel}`}>
                  <div className={classes.panelHead}>
                    <h3>Timeline</h3>
                    <span className={classes.panelCount}>{timeline.length}</span>
                  </div>
                  <ol className={classes.timeline}>
                    {timeline.map((e, idx) => {
                      const meta = TYPE_META[e.type] || { label: e.type, tone: 'muted' };
                      const bits = [
                        e.campaignId,
                        e.state,
                        e.agencyId,
                        e.agentId ? resolveAgent(agentMeta, e.agentId).name : null,
                        e.reason,
                      ].filter(Boolean);
                      return (
                        <li key={e.id || `${e.type}-${e.at}-${idx}`} className={classes.eventRow}>
                          <span className={`${classes.dot} ${classes[`dot_${meta.tone}`]}`} />
                          <span className={`${classes.badge} ${classes[`tone_${meta.tone}`]}`}>
                            {meta.label}
                          </span>
                          <span className={classes.eventTitle}>{eventTitle(e)}</span>
                          <span className={classes.eventBits} title={bits.join(' · ')}>
                            {bits.join(' · ') || '—'}
                          </span>
                          {e.callSid ? (
                            <span className={classes.sidInline}>
                              <code title={e.callSid}>{shortSid(e.callSid)}</code>
                              <CopyButton value={e.callSid} />
                            </span>
                          ) : (
                            <span />
                          )}
                          <time className={classes.eventTime}>{formatTime(e.at)}</time>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}

              <section className={`glass ${shared.sectionCard} ${classes.panel}`}>
                <div className={classes.panelHead}>
                  <h3>Call logs</h3>
                  <span className={classes.panelCount}>{logs.length}</span>
                </div>
                {logs.length === 0 ? (
                  <div className={classes.panelEmpty}>No completed call logs matched this From / CallSid.</div>
                ) : (
                  <div className={classes.logCards}>
                    {logs.map((log) => {
                      const hasRec = Boolean(log.recordingSid || log.recordingUrl);
                      const agent = resolveAgent(agentMeta, log.agentId);
                      const alreadyForceCharged = log.forceCharged === true;
                      const canForceCharge = Boolean(
                        log.agentId && log.campaign && !alreadyForceCharged && !log.isBillable,
                      );
                      const statusLabel = alreadyForceCharged
                        ? 'Force charged'
                        : log.isBillable
                          ? 'Billable'
                          : log.status || '—';
                      const statusClass = alreadyForceCharged
                        ? classes.statusForceCharged
                        : log.isBillable
                          ? classes.statusPaid
                          : '';
                      const displayCost = alreadyForceCharged && log.forceChargeCents != null
                        ? (Number(log.forceChargeCents) / 100).toFixed(2)
                        : Number(log.cost || 0).toFixed(2);
                      return (
                        <article key={log.id} className={classes.logCard}>
                          <div className={classes.logCardTop}>
                            <div className={classes.logCardLead}>
                              <h4 className={classes.logCardTitle}>
                                {log.campaignLabel || log.campaign || 'Call'}
                              </h4>
                              <time className={classes.logCardWhen}>{formatTime(log.createdAt)}</time>
                            </div>
                            <span className={`${classes.statusChip} ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className={classes.logCardMeta}>
                            <span><em>Dur</em> {formatDuration(log.duration)}</span>
                            <span><em>Cost</em> ${displayCost}</span>
                            <span><em>Agent</em> {agent.name}</span>
                            <span><em>Disposition</em> {log.disposition || '—'}</span>
                          </div>

                          {log.callSid ? (
                            <div className={classes.logCardSid}>
                              <code title={log.callSid}>{log.callSid}</code>
                              <CopyButton value={log.callSid} />
                            </div>
                          ) : null}

                          <div className={classes.logCardActions}>
                            {hasRec ? (
                              <button
                                type="button"
                                className={classes.playBtn}
                                onClick={() => setPlayLog(log)}
                              >
                                <Play size={13} />
                                Play recording
                              </button>
                            ) : (
                              <span className={classes.recordingNone}>No recording</span>
                            )}
                            {alreadyForceCharged ? (
                              <span className={classes.forceChargedBadge} title={log.forceChargedAt || undefined}>
                                <DollarSign size={13} />
                                Force charged
                              </span>
                            ) : canForceCharge ? (
                              <button
                                type="button"
                                className={`${shared.dangerBtn} ${classes.forceChargeBtn}`}
                                disabled={actionLoading}
                                onClick={() => openForceCharge({
                                  agentId: log.agentId,
                                  agentName: agent.name,
                                  flaggedLogs: [{
                                    campaign: log.campaign,
                                    campaignLabel: log.campaignLabel || log.campaign,
                                    callSid: log.callSid,
                                  }],
                                })}
                              >
                                <DollarSign size={14} />
                                Force charge
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
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

      {forceChargeModals}
    </AdminPageShell>
  );
}
