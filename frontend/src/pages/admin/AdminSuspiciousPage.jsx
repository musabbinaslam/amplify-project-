import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, RefreshCw, ShieldOff, DollarSign, Play, User } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listSuspiciousAgents,
  dismissSuspiciousAgent,
  forceChargeSuspiciousAgent,
} from '../../services/adminService';
import AdminPageShell from '../../components/admin/AdminPageShell';
import classes from '../../components/admin/adminShared.module.css';

function formatDuration(s) {
  const sec = Number(s || 0);
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function RecordingPlayer({ url }) {
  const [open, setOpen] = useState(false);
  if (!url) return <span className={classes.muted}>No recording</span>;
  return (
    <>
      <button className={classes.btnSmall} onClick={() => setOpen(true)}>
        <Play size={12} /> Play
      </button>
      {open && (
        <div className={classes.modalOverlay} onClick={() => setOpen(false)}>
          <div className={classes.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Recording</h3>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={url} style={{ width: '100%' }} autoPlay />
            <button className={classes.btn} onClick={() => setOpen(false)} style={{ marginTop: 16 }}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function AgentCard({ agent, onDismiss, onForceCharge, loading }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`glass ${classes.sectionCard}`} style={{ marginBottom: 16 }}>
      <div 
        className={classes.cardHead} 
        style={{ marginBottom: 0, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <User size={18} style={{ color: 'var(--brand-text)' }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{agent.agentName}</span>
            {agent.email && <span style={{ color: 'var(--text-tertiary)' }}>— {agent.email}</span>}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--accent-red)', fontWeight: 600 }}>
              {agent.suspiciousDropCount} near-buffer drops today
            </span>
            <span>
              {agent.todayCallTotal} total calls today
            </span>
            {agent.suspiciousDropDate && (
              <span>Date: {agent.suspiciousDropDate}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <button
            style={{ 
              background: 'color-mix(in srgb, var(--accent-green) 15%, transparent)', 
              color: 'var(--accent-green)', 
              border: '1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
            onClick={() => onDismiss(agent.agentId)}
            disabled={loading}
          >
            <ShieldOff size={14} /> Dismiss
          </button>
          <button
            style={{ 
              background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', 
              color: 'var(--accent-red)', 
              border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
            onClick={() => onForceCharge(agent)}
            disabled={loading}
          >
            <DollarSign size={14} /> Force Charge
          </button>
        </div>
      </div>

      {expanded && agent.flaggedLogs && agent.flaggedLogs.length > 0 && (
        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p style={{ 
            fontSize: 12, 
            color: 'var(--text-secondary)', 
            marginBottom: 12, 
            fontWeight: 600, 
            textTransform: 'uppercase', 
            letterSpacing: '0.06em' 
          }}>
            Flagged Calls
          </p>
          <div className={classes.tableWrap}>
            <div className={classes.tableScroll}>
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th>Call SID</th>
                    <th>Caller</th>
                    <th>Duration</th>
                    <th>Campaign</th>
                    <th>Time</th>
                    <th style={{ textAlign: 'right' }}>Recording</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.flaggedLogs.map((log) => (
                    <tr key={log.id || log.callSid}>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.callSid}</td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.from || 'Hidden'}</td>
                      <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{formatDuration(log.duration)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{log.campaignLabel || log.campaign || '—'}</td>
                      <td style={{ color: 'var(--text-tertiary)' }}>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <RecordingPlayer url={log.recordingUrl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSuspiciousPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [forceChargeModal, setForceChargeModal] = useState(null); // { agent }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSuspiciousAgents();
      setAgents(res.agents || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load suspicious agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDismiss = async (agentId) => {
    setActionLoading(true);
    try {
      await dismissSuspiciousAgent(agentId);
      toast.success('Warning dismissed — agent notified.');
      setAgents((prev) => prev.filter((a) => a.agentId !== agentId));
    } catch (e) {
      toast.error(e.message || 'Failed to dismiss');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceCharge = async () => {
    if (!forceChargeModal) return;
    const { agent } = forceChargeModal;
    const campaignId = agent.flaggedLogs?.[0]?.campaign || null;
    setActionLoading(true);
    try {
      const res = await forceChargeSuspiciousAgent(agent.agentId, campaignId);
      const amount = res.amountCents ? `$${(res.amountCents / 100).toFixed(2)}` : 'the penalty';
      toast.success(`Force charged ${agent.agentName} ${amount}.`);
      setAgents((prev) => prev.filter((a) => a.agentId !== agent.agentId));
      setForceChargeModal(null);
    } catch (e) {
      toast.error(e.message || 'Failed to force charge');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminPageShell
      icon={AlertTriangle}
      title="Suspicious Drop Patterns"
      description="Agents who dropped 3+ calls within 5 seconds of the billing buffer today. Review the call recordings and take action."
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className={classes.btn} onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? classes.spin : ''} />
          Refresh
        </button>
      </div>
      {loading ? (
        <div className={classes.emptyState}>Loading…</div>
      ) : agents.length === 0 ? (
        <div className={classes.emptyState}>
          <AlertTriangle size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <p>No suspicious patterns detected today.</p>
        </div>
      ) : (
        <div>
          <p className={classes.muted} style={{ marginBottom: 16 }}>
            {agents.length} agent{agents.length !== 1 ? 's' : ''} pending review
          </p>
          {agents.map((agent) => (
            <AgentCard
              key={agent.agentId}
              agent={agent}
              loading={actionLoading}
              onDismiss={handleDismiss}
              onForceCharge={(a) => setForceChargeModal({ agent: a })}
            />
          ))}
        </div>
      )}

      {/* Force charge confirmation modal */}
      {forceChargeModal && (
        <div className={classes.modalOverlay} onClick={() => setForceChargeModal(null)}>
          <div className={`glass ${classes.modalBox}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className={classes.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-red)' }}>
                <AlertTriangle size={18} /> Confirm Force Charge
              </h3>
            </div>
            
            <div className={classes.modalSub} style={{ marginBottom: 24, fontSize: 14, color: 'var(--text-secondary)' }}>
              You are about to deduct <strong style={{ color: 'var(--text-primary)' }}>1 call charge</strong> from{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{forceChargeModal.agent.agentName}</strong>'s wallet for the campaign{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{forceChargeModal.agent.flaggedLogs?.[0]?.campaignLabel || 'detected from their call'}</strong>.
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
                The agent will be notified, their warning will be cleared, and their strike counter will reset.
              </p>
            </div>

            <div className={classes.modalActions}>
              <button className={classes.modalCancelBtn} onClick={() => setForceChargeModal(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                style={{ 
                  background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', 
                  color: 'var(--accent-red)', 
                  border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
                onClick={handleForceCharge}
                disabled={actionLoading}
              >
                {actionLoading ? 'Charging…' : 'Confirm Force Charge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
