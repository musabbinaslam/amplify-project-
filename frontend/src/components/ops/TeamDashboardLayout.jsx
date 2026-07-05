import {
  Users, Phone, Radio, CircleDollarSign, RefreshCw, Search,
  ChevronLeft, ChevronRight, AlertTriangle, Activity,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import PageLoader from '../ui/PageLoader';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { RecordingModal } from '../../pages/CallLogsPage';
import { useOpsDashboard } from '../../hooks/useOpsDashboard';
import {
  OpsCallTrendChart,
  OpsCampaignMixChart,
  OpsBillableGauge,
} from './OpsCharts';
import chartClasses from './OpsCharts.module.css';
import OpsDrilldownPanel from './OpsDrilldownPanel';
import OpsCallLogSection from './OpsCallLogSection';
import TeamRosterPanel from './TeamRosterPanel';
import OpsLiveAgentGrid from './OpsLiveAgentGrid';
import { RANGE_LABELS, LOW_BILLABLE_THRESHOLD } from './opsUtils';
import shared from './opsShared.module.css';
import team from './TeamDashboard.module.css';

export default function TeamDashboardLayout() {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const ops = useOpsDashboard('team');

  if (ops.initialLoading) return <PageLoader />;

  const s = ops.summary;

  return (
    <motion.div className={shared.page} variants={presets.root} initial="hidden" animate="visible">
      <motion.div className={shared.header} variants={presets.child}>
        <div className={shared.iconBox}><Users size={24} /></div>
        <div>
          <h1 className={shared.title}>{ops.teamName || 'Team Dashboard'}</h1>
          <p className={shared.subtitle}>
            {ops.teamName
              ? `Analytics for ${ops.teamName}. Managers can add or remove agents from their roster.`
              : 'Analytics and performance for your assigned agents. Managers can also build their own team roster.'}
          </p>
        </div>
        <div className={shared.headerActions}>
          <div className={shared.filterRow}>
            {Object.keys(RANGE_LABELS).map((key) => (
              <button
                key={key}
                type="button"
                className={`${shared.filterBtn} ${ops.rangePreset === key ? shared.filterBtnActive : ''}`}
                onClick={() => ops.setRangePreset(key)}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>
          <button type="button" className={shared.refreshBtn} onClick={ops.loadAll}>
            <RefreshCw size={16} className={ops.analyticsLoading ? shared.spin : ''} />
            Refresh
          </button>
        </div>
      </motion.div>

      <motion.div className={shared.kpiGrid} variants={presets.statsStrip}>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Users size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Team Size</span>
          <span className={shared.statValue}>{ops.agents.length}</span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Radio size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Online Now</span>
          <span className={shared.statValue}>{ops.onlineCount}</span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Phone size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Total Calls</span>
          <span className={shared.statValue}>
            {ops.analyticsLoading ? <span className={shared.skeletonNum} /> : s.totalCalls}
          </span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <CircleDollarSign size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Earnings</span>
          <span className={shared.statValue}>
            {ops.analyticsLoading ? <span className={shared.skeletonNumWide} /> : `$${(s.totalCost || 0).toFixed(2)}`}
          </span>
        </motion.div>
      </motion.div>

      <TeamRosterPanel agentCount={ops.agents.length} onUpdated={ops.loadAll} />

      <motion.div className={team.chartsRow} variants={presets.child}>
        <div className={`glass ${chartClasses.chartCard} ${team.chartsMain}`}>
          <OpsCallTrendChart
            data={ops.byDay}
            loading={ops.analyticsLoading}
            reduceMotion={reduceMotion}
            totalCalls={s.totalCalls}
          />
        </div>
        <div className={team.chartsSide}>
          <div className={`glass ${chartClasses.chartCard}`}>
            <OpsCampaignMixChart
              data={ops.campaigns}
              loading={ops.analyticsLoading}
              reduceMotion={reduceMotion}
            />
          </div>
          <div className={`glass ${chartClasses.chartCard}`}>
            <OpsLiveAgentGrid
              agents={ops.agents}
              liveCallByAgent={ops.liveCallByAgent}
              selectedAgent={ops.selectedAgent}
              onSelectAgent={ops.selectAgent}
              loading={ops.loadingAgents}
              title="Live now"
              emptyMessage="No agents assigned yet."
              compact
            />
          </div>
        </div>
      </motion.div>

      <motion.div className={team.perfBand} variants={presets.child}>
        <div className={`glass ${team.statTile}`}>
          <OpsBillableGauge
            rate={s.billableRate}
            sub={`${s.billableCalls || 0} billable of ${s.totalCalls || 0}`}
            reduceMotion={reduceMotion}
          />
        </div>
        <div className={`glass ${team.statTile}`}>
          <Activity size={18} className={shared.statIcon} />
          <span className={team.statTileLabel}>Answer Rate</span>
          <span className={team.statTileValue}>{Math.round((s.answerRate || 0) * 100)}%</span>
          <span className={team.statTileSub}>{s.answeredCalls || 0} answered calls</span>
        </div>
        <div className={`glass ${team.statTile}`}>
          <CircleDollarSign size={18} className={shared.statIcon} />
          <span className={team.statTileLabel}>Total Spend</span>
          <span className={team.statTileValue}>${(s.totalCost || 0).toFixed(2)}</span>
          <span className={team.statTileSub}>{RANGE_LABELS[ops.rangePreset]}</span>
        </div>
      </motion.div>

      <motion.section className={`glass ${shared.card}`} variants={presets.child}>
        <div className={shared.sectionHeader}>
          <h3><Phone size={18} /> Performance</h3>
        </div>
        <div className={shared.toolbar}>
          <div className={shared.searchWrap}>
            <Search size={15} className={shared.searchIcon} />
            <input className={shared.searchInput} placeholder="Search agent" value={ops.perfSearch} onChange={(e) => ops.setPerfSearch(e.target.value)} />
          </div>
          <div className={shared.filterRow}>
            <select className={shared.select} value={ops.perfSort} onChange={(e) => ops.setPerfSort(e.target.value)}>
              <option value="calls">Sort: Calls</option>
              <option value="billable">Sort: Billable</option>
              <option value="rate">Sort: Rate</option>
              <option value="earnings">Sort: Earnings</option>
              <option value="name">Sort: Name</option>
            </select>
            <select className={shared.select} value={ops.perfSortDir} onChange={(e) => ops.setPerfSortDir(e.target.value)}>
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </div>
        </div>
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Calls</th>
                <th>Billable</th>
                <th>Rate</th>
                <th>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {ops.analyticsLoading ? (
                <tr><td colSpan={5} className={shared.muted}>Loading…</td></tr>
              ) : ops.sortedAgentStats.length === 0 ? (
                <tr><td colSpan={5} className={shared.empty}>No data in this period.</td></tr>
              ) : (
                ops.pagedAgentStats.map((row) => {
                  const low = (row.billableRate || 0) < LOW_BILLABLE_THRESHOLD;
                  const isSelected = ops.selectedAgent === row.agentId;
                  return (
                    <tr
                      key={row.agentId}
                      className={`${shared.clickableRow} ${isSelected ? shared.rowActive : ''}`}
                      onClick={() => ops.selectAgent(row.agentId)}
                    >
                      <td className={shared.agentCell}><strong>{row.agentName || row.agentId}</strong></td>
                      <td>{row.calls}</td>
                      <td>{row.billableCalls}</td>
                      <td>
                        <span className={low ? shared.rateWarn : undefined}>
                          {Math.round((row.billableRate || 0) * 100)}%
                          {low ? <AlertTriangle size={13} className={shared.warnIcon} /> : null}
                        </span>
                      </td>
                      <td>${(row.totalCost || 0).toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!ops.analyticsLoading && ops.sortedAgentStats.length > 0 ? (
          <div className={shared.pagination}>
            <span className={shared.muted}>
              {((ops.perfPageSafe - 1) * 10) + 1}–{Math.min(ops.perfPageSafe * 10, ops.sortedAgentStats.length)} of {ops.sortedAgentStats.length}
            </span>
            <div className={shared.pageBtns}>
              <button type="button" className={shared.pageBtn} onClick={() => ops.setPerfPage((p) => Math.max(1, p - 1))} disabled={ops.perfPageSafe <= 1}>
                <ChevronLeft size={16} />
              </button>
              <span className={shared.pageIndicator}>Page {ops.perfPageSafe} of {ops.perfTotalPages}</span>
              <button type="button" className={shared.pageBtn} onClick={() => ops.setPerfPage((p) => Math.min(ops.perfTotalPages, p + 1))} disabled={ops.perfPageSafe >= ops.perfTotalPages}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </motion.section>

      <OpsDrilldownPanel ops={ops} reduceMotion={reduceMotion} presets={presets} />
      <OpsCallLogSection ops={ops} presets={presets} />

      {ops.activeRecording && (
        <RecordingModal log={ops.activeRecording} onClose={() => ops.setActiveRecording(null)} />
      )}
    </motion.div>
  );
}
