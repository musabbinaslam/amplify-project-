import {
  Building2, Users, Phone, Radio, CircleDollarSign, RefreshCw, Search,
  ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import PageLoader from '../ui/PageLoader';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { RecordingModal } from '../../pages/CallLogsPage';
import { useOpsDashboard } from '../../hooks/useOpsDashboard';
import OpsScopedNav, { OpsSettingsLink } from './OpsScopedNav';
import {
  OpsOnlineGauge,
  OpsEarningsTrendChart,
  OpsTopAgentsChart,
} from './OpsCharts';
import chartClasses from './OpsCharts.module.css';
import OpsDrilldownPanel from './OpsDrilldownPanel';
import OpsCallLogSection from './OpsCallLogSection';
import OpsLiveAgentGrid from './OpsLiveAgentGrid';
import { RANGE_LABELS, LOW_BILLABLE_THRESHOLD } from './opsUtils';
import shared from './opsShared.module.css';
import agency from './AgencyDashboard.module.css';

const CAMPAIGN_LABELS = {
  fe_tv_calls: 'FE TV Calls',
  medicare_transfers: 'Medicare Transfers',
  aca_transfers: 'ACA Transfers',
  medicare_inbound_1: 'Medicare Inbound',
};

export default function AgencyDashboardLayout({
  scope,
  backHref,
  backLabel = 'All agencies',
  settingsHref,
  settingsLabel = 'Settings',
  embedMode = false,
  compactHeader = false,
}) {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const ops = useOpsDashboard('agency', scope);

  useEffect(() => {
    if (!ops.scopeError || !backHref) return;
    navigate(backHref, { replace: true });
  }, [ops.scopeError, backHref, navigate]);

  if (ops.initialLoading && !embedMode) return <PageLoader />;

  const s = ops.summary;
  const agencyName = ops.agencyInfo?.name || 'Your Agency';
  const lockedIds = ops.agencyInfo?.lockedCampaignIds || [];
  const adminView = ops.isAdminView;

  const compactSub = [
    `${ops.agents.length} agents`,
    `${ops.onlineCount} online`,
    RANGE_LABELS[ops.rangePreset],
  ].join(' · ');

  const Wrapper = embedMode ? 'div' : motion.div;
  const wrapperProps = embedMode
    ? { className: `${shared.page} ${shared.pageEmbedded}` }
    : {
      className: shared.page,
      variants: presets.root,
      initial: 'hidden',
      animate: 'visible',
    };

  if (embedMode && ops.initialLoading) {
    return (
      <div className={shared.embedLoading} role="status" aria-live="polite">
        <span className={shared.embedLoadingSpinner} aria-hidden="true" />
        Loading dashboard…
      </div>
    );
  }

  return (
    <Wrapper {...wrapperProps}>
      {adminView && !embedMode ? (
        <motion.div variants={presets.child}>
          <OpsScopedNav backHref={backHref} backLabel={backLabel} settingsHref={settingsHref} />
        </motion.div>
      ) : null}
      {compactHeader ? (
        <div className={`glass ${shared.compactToolbar}`}>
          <div className={shared.compactToolbarLead}>
            <h2 className={shared.compactTitle}>{agencyName}</h2>
            <p className={shared.compactSub}>{compactSub}</p>
          </div>
          <div className={shared.compactToolbarActions}>
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
            {settingsHref ? (
              <OpsSettingsLink settingsHref={settingsHref} label={settingsLabel} />
            ) : null}
          </div>
        </div>
      ) : (
      <motion.div className={`glass ${agency.tenantBanner}`} variants={presets.child}>
        <div className={agency.tenantMain}>
          <div className={agency.tenantIcon}><Building2 size={24} /></div>
          <div>
            <h1 className={agency.tenantTitle}>{agencyName}</h1>
            <p className={agency.tenantSub}>
              {ops.agents.length} agents · {ops.onlineCount} online · {RANGE_LABELS[ops.rangePreset]}
              {adminView ? ' · Viewing as platform administrator' : ''}
            </p>
            {lockedIds.length > 0 ? (
              <div className={agency.chipRow}>
                {lockedIds.map((id) => (
                  <span key={id} className={agency.chip}>{CAMPAIGN_LABELS[id] || id}</span>
                ))}
              </div>
            ) : null}
          </div>
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
          <div className={shared.headerActionRow}>
            <button type="button" className={shared.refreshBtn} onClick={ops.loadAll}>
              <RefreshCw size={16} className={ops.analyticsLoading ? shared.spin : ''} />
              Refresh
            </button>
            {embedMode && !compactHeader && settingsHref ? (
              <OpsSettingsLink settingsHref={settingsHref} />
            ) : null}
          </div>
        </div>
      </motion.div>
      )}

      <motion.div className={agency.liveCommandRow} variants={presets.child}>
        <div className={`glass ${shared.card}`}>
          <OpsLiveAgentGrid
            agents={ops.agents}
            liveCallByAgent={ops.liveCallByAgent}
            selectedAgent={ops.selectedAgent}
            onSelectAgent={ops.selectAgent}
            loading={ops.loadingAgents}
            emptyMessage="No agents in this agency yet."
          />
        </div>
        <div className={`glass ${shared.card}`}>
          <OpsOnlineGauge online={ops.onlineCount} total={ops.agents.length} reduceMotion={reduceMotion} />
        </div>
      </motion.div>

      <motion.div className={agency.chartsRow} variants={presets.child}>
        <div className={`glass ${chartClasses.chartCard}`}>
          <OpsEarningsTrendChart data={ops.byDay} loading={ops.analyticsLoading} reduceMotion={reduceMotion} />
        </div>
        <div className={`glass ${chartClasses.chartCard}`}>
          <OpsTopAgentsChart agentStats={ops.agentStats} loading={ops.analyticsLoading} reduceMotion={reduceMotion} metric="totalCost" />
        </div>
      </motion.div>

      <motion.div className={shared.kpiGrid} variants={presets.statsStrip}>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Users size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Agents</span>
          <span className={shared.statValue}>{ops.agents.length}</span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Phone size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Calls</span>
          <span className={shared.statValue}>{ops.analyticsLoading ? '—' : s.totalCalls}</span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <Radio size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Billable Rate</span>
          <span className={shared.statValue}>{ops.analyticsLoading ? '—' : `${Math.round((s.billableRate || 0) * 100)}%`}</span>
        </motion.div>
        <motion.div className={`glass ${shared.statCard}`} variants={presets.child}>
          <CircleDollarSign size={18} className={shared.statIcon} />
          <span className={shared.statLabel}>Earnings</span>
          <span className={shared.statValue}>{ops.analyticsLoading ? '—' : `$${(s.totalCost || 0).toFixed(2)}`}</span>
        </motion.div>
      </motion.div>

      <motion.section className={`glass ${shared.card}`} variants={presets.child}>
        <div className={shared.sectionHeader}>
          <h3><Users size={18} /> Leaderboard</h3>
        </div>
        <div className={shared.toolbar}>
          <div className={shared.searchWrap}>
            <Search size={15} className={shared.searchIcon} />
            <input className={shared.searchInput} placeholder="Search agent" value={ops.perfSearch} onChange={(e) => ops.setPerfSearch(e.target.value)} />
          </div>
        </div>
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Calls</th>
                <th>Billable</th>
                <th>Rate</th>
                <th>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {ops.analyticsLoading ? (
                <tr><td colSpan={6} className={shared.muted}>Loading…</td></tr>
              ) : ops.sortedAgentStats.length === 0 ? (
                <tr><td colSpan={6} className={shared.empty}>No data in this period.</td></tr>
              ) : (
                ops.pagedAgentStats.map((row, idx) => {
                  const rank = (ops.perfPageSafe - 1) * 10 + idx + 1;
                  const low = (row.billableRate || 0) < LOW_BILLABLE_THRESHOLD;
                  const isSelected = ops.selectedAgent === row.agentId;
                  const ratePct = Math.round((row.billableRate || 0) * 100);
                  return (
                    <tr
                      key={row.agentId}
                      className={`${shared.clickableRow} ${isSelected ? shared.rowActive : ''}`}
                      onClick={() => ops.selectAgent(row.agentId)}
                    >
                      <td className={agency.rankCell}>{rank}</td>
                      <td className={shared.agentCell}>
                        <strong>{row.agentName || row.agentId}</strong>
                        <div className={agency.rateBar}>
                          <div className={agency.rateBarFill} style={{ width: `${ratePct}%` }} />
                        </div>
                      </td>
                      <td>{row.calls}</td>
                      <td>{row.billableCalls}</td>
                      <td>
                        <span className={low ? shared.rateWarn : undefined}>
                          {ratePct}%
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
    </Wrapper>
  );
}
