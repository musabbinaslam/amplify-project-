import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Loader2, Play, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  discoverMedicareRetargetUsers,
  getMedicareRetargetStats,
  listMedicareRetargetUsers,
  runMedicareRetargetTick,
} from '../../services/adminService';
import { ADMIN_CATEGORIES, findAdminModuleById } from '../../config/adminModules';
import AdminPageShell from '../../components/admin/AdminPageShell';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminMedicareRetargetPage.module.css';

const MODULE = findAdminModuleById('medicare-retarget');
const PAGE_SIZE = 25;

const STRIP = [
  { key: 'medicareUnpaidFlag', label: 'Unpaid', sub: 'Flagged cohort', status: null },
  { key: 'pending', label: 'Pending', sub: 'Not mailed yet', status: 'pending' },
  { key: 'email1_sent', label: 'Email 1', sub: 'First send', status: 'email1_sent' },
  { key: 'email2_sent', label: 'Email 2', sub: 'Follow-up', status: 'email2_sent' },
  { key: 'converted', label: 'Converted', sub: 'Paid / stopped', status: 'converted' },
  { key: 'exhausted', label: 'Exhausted', sub: 'No payment', status: 'exhausted' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'pending', label: 'Pending' },
  { value: 'email1_sent', label: 'Email 1' },
  { value: 'email2_sent', label: 'Email 2' },
  { value: 'converted', label: 'Converted' },
  { value: 'exhausted', label: 'Exhausted' },
];

const STATUS_LABELS = {
  queued: 'Queued',
  pending: 'Pending',
  email1_sent: 'Email 1',
  email2_sent: 'Email 2',
  converted: 'Converted',
  exhausted: 'Exhausted',
  suppressed: 'Suppressed',
};

function statusPillClass(status) {
  if (status === 'converted') return shared.dispSold;
  if (status === 'email1_sent' || status === 'email2_sent') return shared.dispAnswered;
  if (status === 'exhausted' || status === 'suppressed') return shared.dispMissed;
  return shared.dispPending;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminMedicareRetargetPage() {
  const presets = useSubtlePageMotion();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [capped, setCapped] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const out = await getMedicareRetargetStats();
      setStats(out);
    } catch (err) {
      toast.error(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    try {
      const out = await listMedicareRetargetUsers({
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(Array.isArray(out?.items) ? out.items : []);
      setTotal(Number(out?.total) || 0);
      setTotalPages(Math.max(1, Number(out?.totalPages) || 1));
      setCapped(Boolean(out?.capped));
      if (out?.page && out.page !== page) setPage(out.page);
    } catch (err) {
      toast.error(err.message || 'Failed to load users');
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setListLoading(false);
    }
  }, [page, statusFilter]);

  const load = useCallback(async () => {
    await Promise.all([loadStats(), loadUsers()]);
  }, [loadStats, loadUsers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const setFilter = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const runTick = async () => {
    setRunning(true);
    try {
      const out = await runMedicareRetargetTick();
      if (out?.reason) {
        toast.error(`Tick skipped — ${out.reason}`);
      } else {
        toast.success(
          `Tick ran — email1 ${out.sent1 || 0}, email2 ${out.sent2 || 0}, converted ${out.converted || 0}, deferred ${out.deferred || 0}, waiting ${out.waiting || 0}, errors ${out.errors || 0}`,
        );
      }
      await load();
    } catch (err) {
      toast.error(err.message || 'Tick failed');
    } finally {
      setRunning(false);
    }
  };

  const discover = async () => {
    setDiscovering(true);
    try {
      const out = await discoverMedicareRetargetUsers();
      toast.success(`Discovered ${out.flagged || 0} unpaid Medicare signup${Number(out.flagged) === 1 ? '' : 's'} (scanned ${out.scanned || 0})`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Discover failed');
    } finally {
      setDiscovering(false);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const busy = loading || listLoading || running || discovering;

  return (
    <AdminPageShell
      title={MODULE?.title || 'Medicare Retarget'}
      description="All unpaid Medicare signups (old and new). Two emails, two days apart, 1:00 PM ET. Payment converts; no payment after email 2 exhausts."
      icon={Mail}
      category={ADMIN_CATEGORIES[MODULE?.category] || ADMIN_CATEGORIES.communications}
      backTo="/app/admin/email-campaigns"
      backLabel="Back to Email Campaigns"
      actions={(
        <div className={classes.actions}>
          <button type="button" className={shared.refreshBtn} onClick={load} disabled={busy}>
            <RefreshCw size={14} className={loading || listLoading ? shared.spin : ''} />
            Refresh
          </button>
          <button type="button" className={shared.modalCancelBtn} onClick={discover} disabled={busy}>
            {discovering ? <Loader2 size={14} className={shared.spin} /> : null}
            Discover unpaid
          </button>
          <button type="button" className={shared.primaryBtn} onClick={runTick} disabled={busy}>
            {running ? <Loader2 size={14} className={shared.spin} /> : <Play size={14} />}
            Run tick now
          </button>
        </div>
      )}
    >
      <motion.div className={`glass ${shared.qaStrip} ${classes.strip}`} variants={presets.child}>
        {STRIP.map((cell) => {
          const active = cell.status && statusFilter === cell.status;
          const hot = Number(stats?.[cell.key] || 0) > 0;
          const Tag = cell.status ? 'button' : 'div';
          return (
            <Tag
              key={cell.key}
              type={cell.status ? 'button' : undefined}
              className={`${shared.qaStripCell} ${hot ? shared.qaStripCellHot : ''} ${active ? classes.stripActive : ''} ${cell.status ? classes.stripBtn : ''}`}
              onClick={cell.status ? () => setFilter(active ? 'all' : cell.status) : undefined}
            >
              <span className={shared.qaStripLabel}>{cell.label}</span>
              <span className={shared.qaStripValue}>
                {loading && !stats ? '—' : Number(stats?.[cell.key] || 0)}
              </span>
              <span className={shared.qaStripSub}>{cell.sub}</span>
            </Tag>
          );
        })}
      </motion.div>

      <motion.section className={`glass ${shared.sectionCard}`} variants={presets.child}>
        <div className={shared.cardTopRow}>
          <div>
            <h3 className={shared.cardTitle}>Enrolled agents</h3>
            <p className={`${shared.cardSubtitle} ${classes.headerSub}`}>
              {stats?.generatedAt
                ? `Updated ${formatWhen(stats.generatedAt)}`
                : 'Status and send times for this campaign.'}
            </p>
          </div>
          <div className={shared.filterRow} role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === opt.value}
                className={`${shared.filterBtn} ${statusFilter === opt.value ? shared.filterBtnActive : ''}`}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={shared.tableWrap}>
          <div className={shared.tableScroll}>
            <table className={shared.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Email 1</th>
                  <th>Email 2</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {listLoading && !rows.length ? (
                  <tr>
                    <td colSpan={5} className={classes.muted}>Loading enrolled agents…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className={shared.qaEmpty}>
                        <Mail size={26} className={shared.qaEmptyIcon} />
                        <h4>No agents in this filter</h4>
                        <p>Run a tick to scan all unpaid Medicare signups into this funnel, or switch the status filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.uid}>
                      <td className={shared.agentCell}>
                        <strong>{row.name || row.email || 'Unknown'}</strong>
                        {row.email ? <span className={shared.agentSubId}>{row.email}</span> : null}
                      </td>
                      <td>
                        <span className={`${shared.statusPill} ${statusPillClass(row.status)}`}>
                          {STATUS_LABELS[row.status] || row.status || '—'}
                        </span>
                      </td>
                      <td>{formatWhen(row.email1SentAt)}</td>
                      <td>{formatWhen(row.email2SentAt)}</td>
                      <td>{formatWhen(row.lastCheckedAt || row.convertedAt || row.exhaustedAt || row.enrolledAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={shared.pagination}>
          <span className={shared.pageMeta}>
            {total === 0
              ? '0 agents'
              : `Showing ${rangeStart}–${rangeEnd} of ${total}${capped ? ' (capped)' : ''}`}
          </span>
          <div className={shared.pageBtns}>
            <button
              type="button"
              className={shared.pageBtn}
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className={shared.pageIndicator}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className={shared.pageBtn}
              disabled={page >= totalPages || listLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </motion.section>
    </AdminPageShell>
  );
}
