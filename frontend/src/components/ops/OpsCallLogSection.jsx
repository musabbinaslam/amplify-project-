import { ChevronLeft, ChevronRight, Play, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { CallLogDispositionBadge, CallLogStatusBadge } from '../callLogs/CallLogStatusCells';
import shared from './opsShared.module.css';

/* eslint-disable react/prop-types */
export default function OpsCallLogSection({ ops, presets }) {
  const {
    agents,
    logsLoading,
    filteredLogs,
    pagedLogs,
    logAgentFilter,
    setLogAgentFilter,
    logSearch,
    setLogSearch,
    logPage,
    setLogPage,
    logPageSafe,
    logTotalPages,
    setActiveRecording,
  } = ops;

  return (
    <motion.section className={`glass ${shared.card}`} variants={presets.child}>
      <div className={shared.sectionHeader}>
        <h3><Radio size={18} /> Call Log</h3>
        <div className={shared.filterRow}>
          <select className={shared.select} value={logAgentFilter} onChange={(e) => setLogAgentFilter(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.agentName || a.id}</option>
            ))}
          </select>
          <input
            className={shared.searchInput}
            placeholder="Search campaign / disposition"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
          />
        </div>
      </div>
      <div className={shared.tableWrap}>
        <table className={shared.table}>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Campaign</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Disposition</th>
              <th>Cost</th>
              <th>Recording</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logsLoading ? (
              <tr><td colSpan={8} className={shared.muted}>Loading call logs…</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={8} className={shared.empty}>{logSearch ? 'No calls match your search.' : 'No calls in this period yet.'}</td></tr>
            ) : (
              pagedLogs.map((log) => (
                <tr key={log.id}>
                  <td className={shared.agentCell}><strong>{log.agentName || log.agentId}</strong></td>
                  <td>{log.campaignLabel || log.campaign}</td>
                  <td>{log.duration}s</td>
                  <td>
                    <CallLogStatusBadge log={log} />
                  </td>
                  <td>
                    <CallLogDispositionBadge log={log} />
                  </td>
                  <td>{log.cost > 0 ? `$${log.cost.toFixed(2)}` : '—'}</td>
                  <td>
                    {(log.recordingSid || log.recordingUrl) ? (
                      <button type="button" className={shared.playBtn} onClick={() => setActiveRecording(log)}>
                        <Play size={12} /> Play
                      </button>
                    ) : (
                      <span className={shared.muted}>—</span>
                    )}
                  </td>
                  <td className={shared.muted}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!logsLoading && filteredLogs.length > 0 ? (
        <div className={shared.pagination}>
          <span className={shared.muted}>
            {((logPageSafe - 1) * 15) + 1}–{Math.min(logPageSafe * 15, filteredLogs.length)} of {filteredLogs.length}
          </span>
          <div className={shared.pageBtns}>
            <button type="button" className={shared.pageBtn} onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPageSafe <= 1}>
              <ChevronLeft size={16} />
            </button>
            <span className={shared.pageIndicator}>Page {logPageSafe} of {logTotalPages}</span>
            <button type="button" className={shared.pageBtn} onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))} disabled={logPageSafe >= logTotalPages}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </motion.section>
  );
}
