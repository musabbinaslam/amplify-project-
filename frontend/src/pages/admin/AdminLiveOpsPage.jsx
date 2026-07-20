import { useState, useEffect, useCallback } from 'react';
import { Radio, Users, Phone, CalendarDays, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  getAdminOverviewLite,
  getAdminLiveCalls,
  forceRemoveAgent,
} from '../../services/adminService';
import useAuthStore from '../../store/authStore';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import AdminStatCard from '../../components/admin/AdminStatCard';
import { getAgentName, getAgentId } from '../../components/admin/adminUtils';
import PageLoader from '../../components/ui/PageLoader';
import classes from '../../components/admin/adminShared.module.css';

export default function AdminLiveOpsPage() {
  const presets = useSubtlePageMotion();
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [liveCalls, setLiveCalls] = useState([]);

  const loadShell = useCallback(async () => {
    setLoading(true);
    try {
      const ov = await getAdminOverviewLite();
      setOverview(ov);
      setLiveCalls(Array.isArray(ov?.liveCalls) ? ov.liveCalls : []);
    } catch (e) {
      try {
        const live = await getAdminLiveCalls();
        setLiveCalls(Array.isArray(live?.rows) ? live.rows : []);
      } catch {
        // no-op
      }
      toast.error(e.message || 'Failed to load live operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUserRole?.();
    loadShell();
  }, [loadShell, refreshUserRole]);

  useEffect(() => {
    let timerId = null;
    const VISIBLE_MS = 30000;
    const HIDDEN_MS = 120000;

    const schedule = () => {
      if (timerId) window.clearTimeout(timerId);
      const ms = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS;
      timerId = window.setTimeout(async () => {
        await loadShell();
        schedule();
      }, ms);
    };

    const handleWake = () => {
      loadShell();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    return () => {
      if (timerId) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [loadShell]);

  if (loading && !overview) return <PageLoader />;

  const pool = overview?.pool || { available: [], ringing: [], busy: [] };
  const byCampaign = overview?.byCampaign || {};

  return (
    <AdminPageShell
      title="Live Operations"
      description="Monitor live calls, pool status, and online agents in real time."
      icon={Radio}
      category={ADMIN_CATEGORIES.operations}
    >
      <motion.div className={classes.statsRow} variants={presets.statsStrip}>
        <AdminStatCard label="Live agents" value={overview?.totalAgents ?? 0} icon={Users} variants={presets.child} loading={loading} />
        <AdminStatCard label="Available" value={(pool.available?.length ?? 0) + (pool.ringing?.length ?? 0)} icon={Radio} variants={presets.child} loading={loading} />
        <AdminStatCard label="Busy" value={pool.busy?.length ?? 0} icon={Phone} variants={presets.child} loading={loading} />
      </motion.div>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Live operations</h2>
        <div className={classes.liveCallsWrap}>
          <h3 className={classes.subTitle}><CalendarDays size={14} /> Live calls</h3>
          {loading ? (
            <div className={classes.skeletonList}>
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
              <div className={classes.skeletonRow} />
            </div>
          ) : liveCalls.length === 0 ? (
            <div className={classes.emptyPanel}>
              <Phone size={28} className={classes.emptyPanelIcon} />
              <h4>No active calls right now</h4>
              <p>Live calls will appear here when agents are on the phone.</p>
            </div>
          ) : (
            <div className={classes.liveCallList}>
              {liveCalls.map((row, idx) => (
                <div key={`${row.agentId}-${idx}`} className={classes.liveCallRow}>
                  <span className={classes.agentCell}>
                    <strong>{getAgentName(row)}</strong>
                    {getAgentName(row) !== getAgentId(row) ? (
                      <span className={classes.agentSubId}>{getAgentId(row)}</span>
                    ) : null}
                  </span>
                  <span className={classes.mono}>{row.callSid || '—'}</span>
                  <span>{row.campaignId}</span>
                  <span>{row.durationSec || 0}s</span>
                  <span className={classes.statusPill}>{row.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className={classes.metaRow}>
            <span className={classes.muted}>Source: {overview?.live?.source || 'n/a'}</span>
            <span className={classes.muted}>Rows: {overview?.live?.rowCount ?? liveCalls.length}</span>
            <span className={classes.muted}>
              Updated: {overview?.live?.generatedAt ? new Date(overview.live.generatedAt).toLocaleTimeString() : '—'}
            </span>
          </div>
        </div>
        <h3 className={classes.subTitle}>Agents by campaign</h3>
        <div className={classes.chipRow}>
          {Object.keys(byCampaign).length === 0 ? (
            <div className={classes.emptyPanel}>
              <Users size={28} className={classes.emptyPanelIcon} />
              <h4>No agents in pool</h4>
              <p>Agents will appear here when they go online.</p>
            </div>
          ) : (
            Object.entries(byCampaign).map(([id, n]) => (
              <span key={id} className={classes.chip}>
                {id}: <strong>{n}</strong>
              </span>
            ))
          )}
        </div>
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <h2 className={classes.cardTitle}>Active agents</h2>
        <div className={classes.tableWrap}>
          <div className={classes.tableScroll}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Campaign</th>
                  <th>Pool</th>
                  <th>Status</th>
                  <th>Licensed States</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <tr><td colSpan={6} className={classes.muted}>Loading…</td></tr>
                    <tr><td colSpan={6}><div className={classes.skeletonRow} /></td></tr>
                  </>
                ) : (overview?.agents || []).length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className={classes.emptyPanel}>
                        <Users size={28} className={classes.emptyPanelIcon} />
                        <h4>No agents online</h4>
                        <p>Online agents will appear in this table.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  overview.agents.map((a) => (
                    <tr key={a.id}>
                      <td className={classes.agentCell}>
                        <strong>{getAgentName(a)}</strong>
                        {getAgentName(a) !== getAgentId(a) ? (
                          <span className={classes.agentSubId}>{getAgentId(a)}</span>
                        ) : null}
                        {a.phone ? (
                          <a href={`tel:${a.phone}`} className={classes.agentPhone}>
                            {a.phone}
                          </a>
                        ) : (
                          <span className={classes.agentPhone} style={{ opacity: 0.5 }}>No phone</span>
                        )}
                      </td>
                      <td>{a.campaignId}</td>
                      <td><span className={classes.statusPill}>{{ available: 'Available', busy: 'In Call', ringing: 'Ringing', wrap_up: 'Wrap Up', unknown: 'Unknown' }[a.pool] || a.pool}</span></td>
                      <td><span className={classes.statusPill}>{{ AVAILABLE: 'Available', IN_CALL: 'In Call', RINGING: 'Ringing', WRAP_UP: 'Wrap Up', UNKNOWN: 'Unknown' }[a.status] || a.status}</span></td>
                      <td>{Array.isArray(a.licensedStates) && a.licensedStates.length > 0 ? a.licensedStates.join(', ') : 'None'}</td>
                      <td className={classes.actions}>
                        <button
                          type="button"
                          className={classes.dangerBtn}
                          style={{ padding: '4px 8px' }}
                          title="Force remove agent from pool"
                          onClick={async () => {
                            const agentId = a.id;
                            if (!window.confirm(`FORCE remove ${getAgentName(a)} (${agentId})?`)) return;
                            try {
                              const out = await forceRemoveAgent(agentId);
                              if (out.success) {
                                toast.success('Agent removed');
                                await loadShell();
                              }
                            } catch (err) {
                              toast.error(err.message || 'Error');
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.section>
    </AdminPageShell>
  );
}
