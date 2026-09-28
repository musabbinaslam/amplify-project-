import { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Layers,
  PhoneCall,
  Users,
  TrendingUp,
  Download,
  Loader2,
  Sparkles,
  Filter,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { downloadAdminExcelReport, getAdminOverviewLite } from '../../services/adminService';
import classes from './AdminExportPage.module.css';

const DEFAULT_CAMPAIGNS = [
  { id: 'fe_inbounds', label: 'FE Inbounds' },
  { id: 'fe_inbounds_short', label: 'FE Inbounds Short Duration' },
  { id: 'fe_tv_calls', label: 'FE TV Calls' },
  { id: 'medicare_transfers', label: 'Medicare Transfers' },
  { id: 'medicare_inbound_1', label: 'Medicare Inbounds (1)' },
  { id: 'medicare_inbound_2', label: 'Medicare Inbounds (2)' },
  { id: 'aca_transfers', label: 'ACA Transfers' },
];

const TEMPLATES = [
  {
    id: 'all',
    title: 'All-in-One Executive Pack',
    description: 'Complete multi-tab workbook with Executive Summary KPIs, full Call Logs, and Agent Roster.',
    badge: '3 Worksheets',
    icon: Layers,
    scope: 'all',
    range: '7d',
  },
  {
    id: 'calls',
    title: 'Call Records (Detail)',
    description: 'Itemized log of every customer call with duration, cost, status, caller DID, and agent details.',
    badge: 'Granular Logs',
    icon: PhoneCall,
    scope: 'calls',
    range: '7d',
  },
  {
    id: 'agents',
    title: 'Agent Directory & Roster',
    description: 'All signed-up users with names, emails, phone numbers, roles, status, and performance metrics.',
    badge: 'User Roster',
    icon: Users,
    scope: 'agents',
    range: '30d',
  },
  {
    id: 'campaigns',
    title: 'Campaign Performance Summary',
    description: 'Campaign volume breakdown, pricing buffer adherence, talk time totals, and revenue metrics.',
    badge: 'Analytics',
    icon: TrendingUp,
    scope: 'campaigns',
    range: '30d',
  },
];

const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Call Outcomes' },
  { value: 'completed', label: 'Completed Only' },
  { value: 'billable', label: 'Billable Only' },
  { value: 'missed', label: 'Missed / Unanswered Only' },
];

function computeRangeDates(preset, customStart, customEnd) {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const yest = new Date(now.getTime() - 24 * 3600 * 1000);
    const start = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0);
    const end = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (preset === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (preset === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  return {
    from: customStart ? new Date(`${customStart}T00:00:00Z`).toISOString() : new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
    to: customEnd ? new Date(`${customEnd}T23:59:59Z`).toISOString() : now.toISOString(),
  };
}

export default function AdminExportPage() {
  const presets = useSubtlePageMotion();
  const [selectedTemplate, setSelectedTemplate] = useState('all');
  const [reportType, setReportType] = useState('all');
  const [campaign, setCampaign] = useState('all');
  const [rangePreset, setRangePreset] = useState('7d');
  const [status, setStatus] = useState('all');
  const [campaignsList, setCampaignsList] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [previewTab, setPreviewTab] = useState('calls');

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getAdminOverviewLite();
        if (!active) return;
        if (Array.isArray(res?.campaigns) && res.campaigns.length > 0) {
          setCampaignsList(res.campaigns);
        } else if (res?.campaigns && typeof res.campaigns === 'object') {
          const list = Object.entries(res.campaigns).map(([id, val]) => ({
            id,
            label: val?.label || id,
          }));
          setCampaignsList(list.length ? list : DEFAULT_CAMPAIGNS);
        } else {
          setCampaignsList(DEFAULT_CAMPAIGNS);
        }
      } catch (err) {
        console.warn('Failed to load campaigns:', err.message);
        if (active) setCampaignsList(DEFAULT_CAMPAIGNS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleApplyTemplate = (tmpl) => {
    setSelectedTemplate(tmpl.id);
    setReportType(tmpl.scope);
    setRangePreset(tmpl.range);
    if (tmpl.scope === 'agents') setPreviewTab('agents');
    else if (tmpl.scope === 'campaigns') setPreviewTab('summary');
    else setPreviewTab('calls');
  };

  const handleDownload = async () => {
    setDownloading(true);
    const toastId = toast.loading('Generating CallsFlow formatted Excel (.xlsx) workbook...');
    try {
      const { from, to } = computeRangeDates(rangePreset, customStart, customEnd);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

      const res = await downloadAdminExcelReport({
        reportType,
        campaign,
        from,
        to,
        status,
        tz,
      });

      toast.success(`Downloaded ${res.filename || 'CallsFlow_Export.xlsx'}`, { id: toastId });
    } catch (err) {
      console.error('Download error:', err);
      toast.error(err.message || 'Failed to download Excel file', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AdminPageShell
      title="Data & Excel Export"
      description="Download presentation-grade, fully formatted Excel (.xlsx) workbooks for calls, campaigns, and agent rosters."
      icon={FileSpreadsheet}
      category={ADMIN_CATEGORIES.operations}
    >
      <motion.div className={classes.pageContainer} variants={presets.root}>
        {/* Recommended Templates Section */}
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.sectionHeading}>
            <Sparkles size={15} className={classes.headingIcon} />
            <span>Recommended Report Templates</span>
          </div>
          <div className={classes.presetsGrid}>
            {TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              const isActive = selectedTemplate === tmpl.id;
              return (
                <div
                  key={tmpl.id}
                  className={`${classes.presetCard} ${isActive ? classes.presetCardActive : ''}`}
                  onClick={() => handleApplyTemplate(tmpl)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={classes.presetCardHeader}>
                    <div className={classes.presetIconBox}>
                      <Icon size={18} />
                    </div>
                    <span className={`${classes.presetBadge} ${isActive ? classes.presetBadgeActive : ''}`}>
                      {tmpl.badge}
                    </span>
                  </div>
                  <div>
                    <h3 className={classes.presetTitle}>{tmpl.title}</h3>
                    <p className={classes.presetDesc}>{tmpl.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Main Grid: Config on Left, Preview Table on Right */}
        <motion.div className={classes.mainLayout} variants={presets.child}>
          {/* Config Panel */}
          <div className={`glass ${classes.configPanel}`}>
            <div className={classes.panelHeader}>
              <div className={classes.panelIconBox}>
                <Filter size={16} />
              </div>
              <div>
                <h3 className={classes.panelTitle}>Export Configuration</h3>
                <p className={classes.panelSubtitle}>Configure dataset, filters, and timeline</p>
              </div>
            </div>

            {/* Scope */}
            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-scope" className={classes.label}>
                Report Scope / Dataset
              </label>
              <select
                id="cfg-scope"
                className={classes.select}
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value);
                  setSelectedTemplate('');
                  if (e.target.value === 'agents') setPreviewTab('agents');
                  else if (e.target.value === 'campaigns') setPreviewTab('summary');
                  else setPreviewTab('calls');
                }}
              >
                <option value="all">Executive Master Pack (All 3 Sheets)</option>
                <option value="calls">Call Records (Detail Only)</option>
                <option value="agents">Agent Directory & Metrics Only</option>
                <option value="campaigns">Campaign Summary Only</option>
              </select>
            </div>

            {/* Campaign */}
            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-campaign" className={classes.label}>
                Campaign Filter
              </label>
              <select
                id="cfg-campaign"
                className={classes.select}
                value={campaign}
                onChange={(e) => {
                  setCampaign(e.target.value);
                  setSelectedTemplate('');
                }}
              >
                <option value="all">All Campaigns (Consolidated)</option>
                {campaignsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Call Status */}
            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-status" className={classes.label}>
                Call Outcome / Billable Filter
              </label>
              <select
                id="cfg-status"
                className={classes.select}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Preset */}
            <div className={classes.fieldGroup}>
              <label className={classes.label}>
                Date Range Preset
              </label>
              <div className={classes.rangePills}>
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`${classes.rangePill} ${rangePreset === p.value ? classes.rangePillActive : ''}`}
                    onClick={() => setRangePreset(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Inputs if custom range selected */}
            {rangePreset === 'custom' ? (
              <div className={classes.fieldGroup}>
                <label className={classes.label}>Custom Date Window</label>
                <div className={classes.dateRangeRow}>
                  <input
                    type="date"
                    className={classes.dateInput}
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <span className={classes.dateSeparator}>to</span>
                  <input
                    type="date"
                    className={classes.dateInput}
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {/* Action Box */}
            <div className={classes.downloadActionBox}>
              <button
                type="button"
                className={classes.exportBtn}
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <Loader2 size={17} className={classes.spin} />
                    <span>Generating Workbook...</span>
                  </>
                ) : (
                  <>
                    <Download size={17} />
                    <span>Download Excel (.xlsx)</span>
                  </>
                )}
              </button>

              <div className={classes.exportMetaBadges}>
                <span className={classes.metaBadge}>
                  <CheckCircle2 size={12} /> CallsFlow Master Branding
                </span>
                <span className={classes.metaBadge}>
                  <CheckCircle2 size={12} /> Auto-calculated Excel =SUM Formulas
                </span>
                <span className={classes.metaBadge}>
                  <CheckCircle2 size={12} /> Frozen Top Headers & Auto-Filter
                </span>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className={`glass ${classes.previewPanel}`}>
            <div className={classes.previewHeader}>
              <div className={classes.panelHeader}>
                <div className={classes.panelIconBox}>
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <h3 className={classes.panelTitle}>Spreadsheet Preview</h3>
                  <p className={classes.panelSubtitle}>Tab structure and formatting sample</p>
                </div>
              </div>
              <div className={classes.sheetTabs}>
                <button
                  type="button"
                  className={`${classes.sheetTab} ${previewTab === 'calls' ? classes.sheetTabActive : ''}`}
                  onClick={() => setPreviewTab('calls')}
                >
                  <PhoneCall size={13} />
                  <span>Call Records</span>
                </button>
                <button
                  type="button"
                  className={`${classes.sheetTab} ${previewTab === 'agents' ? classes.sheetTabActive : ''}`}
                  onClick={() => setPreviewTab('agents')}
                >
                  <Users size={13} />
                  <span>Agent Directory</span>
                </button>
                <button
                  type="button"
                  className={`${classes.sheetTab} ${previewTab === 'summary' ? classes.sheetTabActive : ''}`}
                  onClick={() => setPreviewTab('summary')}
                >
                  <TrendingUp size={13} />
                  <span>Executive Summary</span>
                </button>
              </div>
            </div>

            {/* Preview Table */}
            {previewTab === 'calls' && (
              <div className={classes.tableWrap}>
                <div className={classes.tableScroll}>
                  <table className={classes.table}>
                    <thead>
                      <tr>
                        <th>Call ID</th>
                        <th>Date & Time</th>
                        <th>Agent Name</th>
                        <th>Agent Email</th>
                        <th>Agent Phone</th>
                        <th>Campaign</th>
                        <th>Customer Phone</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th>Billable</th>
                        <th>Cost ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>call_8f29c1...</td>
                        <td>2026-09-28 14:22:05</td>
                        <td>Jane Doe</td>
                        <td>jane.doe@agency.com</td>
                        <td>+1 (555) 234-5678</td>
                        <td>FE Inbounds</td>
                        <td>+1 (555) 987-6543</td>
                        <td>02:45</td>
                        <td><span className={classes.badgeSuccess}>COMPLETED</span></td>
                        <td><span className={classes.badgeSuccess}>YES</span></td>
                        <td>$50.00</td>
                      </tr>
                      <tr>
                        <td>call_3a71e4...</td>
                        <td>2026-09-28 13:58:12</td>
                        <td>Michael Chang</td>
                        <td>mchang@callsflow.io</td>
                        <td>+1 (555) 876-5432</td>
                        <td>Medicare Transfers</td>
                        <td>+1 (555) 432-1098</td>
                        <td>01:10</td>
                        <td><span className={classes.badgeWarning}>NO-ANSWER</span></td>
                        <td>NO</td>
                        <td>$0.00</td>
                      </tr>
                      <tr>
                        <td>call_9d04b7...</td>
                        <td>2026-09-28 13:15:40</td>
                        <td>Sarah Connor</td>
                        <td>sarah@amplify.org</td>
                        <td>+1 (555) 345-6789</td>
                        <td>FE TV Calls</td>
                        <td>+1 (555) 654-3210</td>
                        <td>04:12</td>
                        <td><span className={classes.badgeSuccess}>COMPLETED</span></td>
                        <td><span className={classes.badgeSuccess}>YES</span></td>
                        <td>$65.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {previewTab === 'agents' && (
              <div className={classes.tableWrap}>
                <div className={classes.tableScroll}>
                  <table className={classes.table}>
                    <thead>
                      <tr>
                        <th>Agent Name</th>
                        <th>Email Address</th>
                        <th>Phone Number</th>
                        <th>Platform Role</th>
                        <th>Status</th>
                        <th>Wallet Balance</th>
                        <th>Total Calls</th>
                        <th>Answer Rate</th>
                        <th>Total Talk Time</th>
                        <th>Total Spend ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Jane Doe</td>
                        <td>jane.doe@agency.com</td>
                        <td>+1 (555) 234-5678</td>
                        <td>AGENT</td>
                        <td><span className={classes.badgeSuccess}>ACTIVE</span></td>
                        <td>$340.00</td>
                        <td>142</td>
                        <td>89.4%</td>
                        <td>4h 32m</td>
                        <td>$3,550.00</td>
                      </tr>
                      <tr>
                        <td>Michael Chang</td>
                        <td>mchang@callsflow.io</td>
                        <td>+1 (555) 876-5432</td>
                        <td>AGENT</td>
                        <td><span className={classes.badgeSuccess}>ACTIVE</span></td>
                        <td>$125.00</td>
                        <td>98</td>
                        <td>82.1%</td>
                        <td>2h 45m</td>
                        <td>$2,450.00</td>
                      </tr>
                      <tr>
                        <td>David Miller</td>
                        <td>david.m@partners.com</td>
                        <td>+1 (555) 123-9876</td>
                        <td>AGENT</td>
                        <td><span className={classes.badgeWarning}>PAUSED</span></td>
                        <td>$45.00</td>
                        <td>24</td>
                        <td>75.0%</td>
                        <td>42m</td>
                        <td>$600.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {previewTab === 'summary' && (
              <div className={classes.tableWrap}>
                <div className={classes.tableScroll}>
                  <table className={classes.table}>
                    <thead>
                      <tr>
                        <th>Campaign Name</th>
                        <th>Total Calls</th>
                        <th>Answered</th>
                        <th>Billable</th>
                        <th>Total Duration</th>
                        <th>Avg Handle Time</th>
                        <th>Total Spend ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>FE Inbounds</td>
                        <td>1,240</td>
                        <td>1,085</td>
                        <td>942</td>
                        <td>58h 12m</td>
                        <td>02:48</td>
                        <td>$47,100.00</td>
                      </tr>
                      <tr>
                        <td>Medicare Transfers</td>
                        <td>890</td>
                        <td>720</td>
                        <td>610</td>
                        <td>39h 45m</td>
                        <td>02:35</td>
                        <td>$30,500.00</td>
                      </tr>
                      <tr>
                        <td>Auto Insurance Inbound</td>
                        <td>450</td>
                        <td>380</td>
                        <td>315</td>
                        <td>18h 20m</td>
                        <td>02:18</td>
                        <td>$15,750.00</td>
                      </tr>
                      <tr style={{ fontWeight: 700 }}>
                        <td>TOTAL / AVERAGE</td>
                        <td>2,580</td>
                        <td>2,185</td>
                        <td>1,867</td>
                        <td>116h 17m</td>
                        <td>02:38</td>
                        <td>$93,350.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AdminPageShell>
  );
}
