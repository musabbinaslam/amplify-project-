import { useState, useEffect } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  Layers,
  PhoneCall,
  Users,
  TrendingUp,
  Sparkles,
  Loader2,
  Calendar,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { downloadAdminExcelReport, getAdminOverviewLite } from '../../services/adminService';
import classes from './AdminExportModal.module.css';

const DEFAULT_CAMPAIGNS = [
  { id: 'fe_inbounds', label: 'FE Inbounds' },
  { id: 'fe_inbounds_short', label: 'FE Inbounds Short Duration' },
  { id: 'fe_tv_calls', label: 'FE TV Calls' },
  { id: 'medicare_transfers', label: 'Medicare Transfers' },
  { id: 'medicare_inbound_1', label: 'Medicare Inbounds (1)' },
  { id: 'medicare_inbound_2', label: 'Medicare Inbounds (2)' },
  { id: 'aca_transfers', label: 'ACA Transfers' },
];

const SCOPES = [
  {
    id: 'all',
    title: 'Executive Workbook (All Tabs)',
    description: 'Multi-tab file: Executive Summary, Detailed Call Records, & Agent Directory.',
    icon: Layers,
  },
  {
    id: 'calls',
    title: 'Detailed Call Records',
    description: 'Itemized call logs with caller numbers, durations, costs, and agent names/emails.',
    icon: PhoneCall,
  },
  {
    id: 'agents',
    title: 'Agent Directory & Roster',
    description: 'Complete user profiles with email, phone, role, status, and performance metrics.',
    icon: Users,
  },
  {
    id: 'campaigns',
    title: 'Campaign Performance Summary',
    description: 'High-level campaign-by-campaign volumes, answer rates, and financial totals.',
    icon: TrendingUp,
  },
];

const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
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

export default function AdminExportModal({
  isOpen,
  onClose,
  initialScope = 'all',
  initialCampaign = 'all',
  initialRange = '7d',
}) {
  const [reportType, setReportType] = useState(initialScope);
  const [campaign, setCampaign] = useState(initialCampaign);
  const [rangePreset, setRangePreset] = useState(initialRange);
  const [status, setStatus] = useState('all');
  const [campaignsList, setCampaignsList] = useState([]);
  const [downloading, setDownloading] = useState(false);

  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));

  // Sync initial props when opened
  useEffect(() => {
    if (isOpen) {
      if (initialScope) setReportType(initialScope);
      if (initialCampaign) setCampaign(initialCampaign);
      if (initialRange) setRangePreset(initialRange);
    }
  }, [isOpen, initialScope, initialCampaign, initialRange]);

  // Load campaign list
  useEffect(() => {
    if (!isOpen) return;
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
        console.warn('Failed to load campaigns for export modal:', err.message);
        if (active) setCampaignsList(DEFAULT_CAMPAIGNS);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setDownloading(true);
    const toastId = toast.loading('Generating formatted Excel spreadsheet...');
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

      toast.success(`Downloaded ${res.filename || 'report.xlsx'}`, { id: toastId });
      onClose();
    } catch (err) {
      console.error('Download error:', err);
      toast.error(err.message || 'Failed to download Excel file', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  const selectedScopeObj = SCOPES.find((s) => s.id === reportType) || SCOPES[0];

  return (
    <AnimatePresence>
      <div className={classes.overlay} onClick={onClose} role="dialog" aria-modal="true">
        <motion.div
          className={classes.modal}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className={classes.header}>
            <div className={classes.headerTitleBlock}>
              <div className={classes.headerIcon} aria-hidden="true">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h3 className={classes.headerTitle}>Export to Excel (.xlsx)</h3>
                <p className={classes.headerSubtitle}>
                  Download fully formatted spreadsheets with agent details, calls, and performance.
                </p>
              </div>
            </div>
            <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className={classes.body}>
            {/* 1. Scope Selection */}
            <div>
              <div className={classes.sectionLabel}>
                <Layers size={13} />
                <span>1. Select Report Scope</span>
              </div>
              <div className={classes.scopeGrid}>
                {SCOPES.map((scope) => {
                  const Icon = scope.icon;
                  const isActive = reportType === scope.id;
                  return (
                    <button
                      key={scope.id}
                      type="button"
                      className={`${classes.scopeCard} ${isActive ? classes.scopeCardActive : ''}`}
                      onClick={() => setReportType(scope.id)}
                    >
                      <div className={classes.scopeIcon}>
                        <Icon size={16} />
                      </div>
                      <div className={classes.scopeCardContent}>
                        <h4 className={classes.scopeCardTitle}>{scope.title}</h4>
                        <p className={classes.scopeCardDesc}>{scope.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Filter Controls */}
            <div>
              <div className={classes.sectionLabel}>
                <Filter size={13} />
                <span>2. Configure Filters</span>
              </div>
              <div className={classes.formGrid}>
                {/* Campaign */}
                <div className={classes.formField}>
                  <label htmlFor="export-campaign" className={classes.fieldLabel}>
                    Target Campaign
                  </label>
                  <select
                    id="export-campaign"
                    className={classes.selectInput}
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
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
                <div className={classes.formField}>
                  <label htmlFor="export-status" className={classes.fieldLabel}>
                    Call Outcome Filter
                  </label>
                  <select
                    id="export-status"
                    className={classes.selectInput}
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
                <div className={classes.formField}>
                  <label htmlFor="export-range" className={classes.fieldLabel}>
                    Date Range Window
                  </label>
                  <select
                    id="export-range"
                    className={classes.selectInput}
                    value={rangePreset}
                    onChange={(e) => setRangePreset(e.target.value)}
                  >
                    {RANGE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Pickers */}
                {rangePreset === 'custom' ? (
                  <div className={classes.formField}>
                    <label className={classes.fieldLabel}>Custom Date Range</label>
                    <div className={classes.dateRangeRow}>
                      <input
                        type="date"
                        className={classes.dateInput}
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                      />
                      <span className={classes.dateRangeSeparator}>to</span>
                      <input
                        type="date"
                        className={classes.dateInput}
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className={classes.formField}>
                    <label className={classes.fieldLabel}>Timezone Applied</label>
                    <input
                      type="text"
                      className={classes.selectInput}
                      readOnly
                      value={Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 3. Live Preview & Metadata */}
            <div className={classes.previewBox}>
              <div className={classes.previewHeader}>
                <span className={classes.previewTitle}>
                  <Sparkles size={14} />
                  <span>Export Specification</span>
                </span>
                <div className={classes.previewBadges}>
                  <span className={classes.previewBadge}>
                    Scope: {selectedScopeObj.title.split(' ')[0]}
                  </span>
                  <span className={classes.previewBadge}>
                    Campaign: {campaign === 'all' ? 'All' : campaign}
                  </span>
                  <span className={classes.previewBadge}>
                    Range: {rangePreset}
                  </span>
                </div>
              </div>
              <p className={classes.previewDetails}>
                The exported <strong>.xlsx</strong> will be formatted with CallsFlow executive navy headers,
                zebra striping, formatted currency/duration cells, and auto-computed summary formulas. Full agent
                names, emails, and phone numbers are included.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className={classes.footer}>
            <button type="button" className={classes.cancelBtn} onClick={onClose} disabled={downloading}>
              Cancel
            </button>
            <button
              type="button"
              className={classes.submitBtn}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className={classes.spin} />
                  <span>Generating XLSX...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download Excel (.xlsx)</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
