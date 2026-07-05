import { Play, TrendingUp, Phone, Activity, Radio, CircleDollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { AdminDrilldownTrendChart } from '../admin/AdminCharts';
import shared from './opsShared.module.css';

/* eslint-disable react/prop-types */
export default function OpsDrilldownPanel({
  ops,
  reduceMotion,
  presets,
}) {
  const {
    selectedAgent,
    selectedAgentName,
    drilldownLoading,
    drilldown,
    drilldownSortField,
    setDrilldownSortField,
    drilldownSortOrder,
    setDrilldownSortOrder,
    drilldownDay,
    setDrilldownDay,
    filteredSortedDrilldownLogs,
    clearAgentSelection,
    setActiveRecording,
  } = ops;

  return (
    <motion.section className={`glass ${shared.card}`} variants={presets.child}>
      <div className={shared.drilldownHead}>
        <h3><TrendingUp size={18} /> Agent Drilldown</h3>
        {selectedAgent ? (
          <div className={shared.drilldownFilters}>
            <select className={shared.select} value={drilldownSortField} onChange={(e) => setDrilldownSortField(e.target.value)}>
              <option value="date">Sort: Date</option>
              <option value="duration">Sort: Duration</option>
            </select>
            <select className={shared.select} value={drilldownSortOrder} onChange={(e) => setDrilldownSortOrder(e.target.value)}>
              <option value="desc">{drilldownSortField === 'duration' ? 'Longest first' : 'Newest first'}</option>
              <option value="asc">{drilldownSortField === 'duration' ? 'Shortest first' : 'Oldest first'}</option>
            </select>
            <input type="date" className={shared.searchInput} value={drilldownDay} onChange={(e) => setDrilldownDay(e.target.value)} />
            {drilldownDay ? (
              <button type="button" className={shared.filterBtn} onClick={() => setDrilldownDay('')}>Clear day</button>
            ) : null}
            <span className={shared.drilldownPill}>Agent: {selectedAgentName}</span>
            <button type="button" className={shared.filterBtn} onClick={clearAgentSelection}>Reset</button>
          </div>
        ) : null}
      </div>

      {!selectedAgent ? (
        <p className={shared.muted}>Click an agent row to view trend, stats, and recent calls.</p>
      ) : drilldownLoading ? (
        <div className={shared.skeletonList}>
          <div className={shared.skeletonRow} />
          <div className={shared.skeletonRow} />
        </div>
      ) : !drilldown ? (
        <p className={shared.muted}>No drilldown data available.</p>
      ) : (
        <>
          <div className={shared.drilldownKpiGrid}>
            <div className={`glass ${shared.statCard}`}>
              <Phone size={16} className={shared.statIcon} />
              <span className={shared.statLabel}>Calls</span>
              <span className={shared.statValue}>{drilldown.summary?.calls ?? 0}</span>
            </div>
            <div className={`glass ${shared.statCard}`}>
              <Activity size={16} className={shared.statIcon} />
              <span className={shared.statLabel}>Answer Rate</span>
              <span className={shared.statValue}>{Math.round((drilldown.summary?.answerRate || 0) * 100)}%</span>
            </div>
            <div className={`glass ${shared.statCard}`}>
              <Radio size={16} className={shared.statIcon} />
              <span className={shared.statLabel}>Billable Rate</span>
              <span className={shared.statValue}>{Math.round((drilldown.summary?.billableRate || 0) * 100)}%</span>
            </div>
            <div className={`glass ${shared.statCard}`}>
              <CircleDollarSign size={16} className={shared.statIcon} />
              <span className={shared.statLabel}>Earnings</span>
              <span className={shared.statValue}>${(drilldown.summary?.totalCost || 0).toFixed(2)}</span>
            </div>
          </div>
          <div className={shared.drilldownChart}>
            <AdminDrilldownTrendChart data={drilldown.trend} loading={false} reduceMotion={reduceMotion} />
          </div>
          {filteredSortedDrilldownLogs.length > 0 ? (
            <div className={shared.tableWrap} style={{ marginTop: 16 }}>
              <h4 className={shared.muted} style={{ margin: '0 0 12px' }}>Recent calls</h4>
              <table className={shared.table}>
                <thead>
                  <tr>
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
                  {filteredSortedDrilldownLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.campaignLabel || log.campaign}</td>
                      <td>{log.duration}s</td>
                      <td>
                        {log.isBillable ? (
                          <span className={`${shared.statusPill} ${shared.statAvailable}`}>Sold</span>
                        ) : log.status === 'completed' ? (
                          <span className={`${shared.statusPill} ${shared.statInCall}`}>Answered</span>
                        ) : (
                          <span className={`${shared.statusPill} ${shared.statOffline}`}>Missed</span>
                        )}
                      </td>
                      <td>{log.disposition || <span className={shared.muted}>—</span>}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={shared.muted} style={{ marginTop: 16 }}>No calls in this period for the selected filters.</p>
          )}
        </>
      )}
    </motion.section>
  );
}
