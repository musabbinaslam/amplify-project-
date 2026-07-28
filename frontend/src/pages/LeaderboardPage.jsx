/* eslint-disable react/prop-types -- presentational helpers are local to this page */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  animate,
} from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Crown,
  Medal,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Phone,
  Percent,
  DollarSign,
  Clock,
  Flame,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { dropdownPanelMotion, EASE_SMOOTH } from '../motion/appMotion';
import { fetchLeaderboard } from '../services/leaderboardService';
import PageLoader from '../components/ui/PageLoader';
import classes from './LeaderboardPage.module.css';

const PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All-Time' },
];

const SORT_OPTIONS = [
  { key: 'rank', label: 'Rank', defaultDir: 'asc' },
  { key: 'billableCalls', label: 'Billable', defaultDir: 'desc' },
  { key: 'billableRatio', label: 'Ratio', defaultDir: 'desc' },
  { key: 'revenue', label: 'Revenue', defaultDir: 'desc' },
  { key: 'avgDuration', label: 'Avg Time', defaultDir: 'desc' },
];

const VISIBLE_MS = 60000;
const HIDDEN_MS = 180000;
const ROWS_PER_PAGE = 10;
const HOT_RATIO = 70; // billable ratio (%) that earns an "on fire" badge

const CONFETTI_COLORS = ['#25f425', '#ffd54a', '#00e3fd', '#ffffff', '#e08a4c'];

function formatDuration(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatRevenue(value) {
  return `$${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function initialsFrom(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const CountUp = ({ value, decimals = 0, prefix = '', suffix = '' }) => {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(() => `${prefix}${(0).toFixed(decimals)}${suffix}`);

  useEffect(() => {
    const format = (v) => `${prefix}${Number(v).toFixed(decimals)}${suffix}`;
    if (reduceMotion) {
      setDisplay(format(value));
      return undefined;
    }
    const controls = animate(mv, value, {
      duration: 1.6,
      ease: EASE_SMOOTH,
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
  }, [value, decimals, prefix, suffix, reduceMotion, mv]);

  return <span>{display}</span>;
};

const Avatar = ({ name, size = 44, className = '' }) => (
  <span
    className={`${classes.avatar} ${className}`}
    style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
  >
    <span>{initialsFrom(name)}</span>
  </span>
);

const RANK_META = {
  1: { Icon: Crown, cls: classes.gold, tier: classes.tier1, pedestal: 132, label: 'Champion' },
  2: { Icon: Medal, cls: classes.silver, tier: classes.tier2, pedestal: 96, label: 'Runner-up' },
  3: { Icon: Medal, cls: classes.bronze, tier: classes.tier3, pedestal: 72, label: 'Third place' },
};

const ChampionColumn = ({ entry, reduceMotion, isMe, delay }) => {
  const meta = RANK_META[entry.rank] || RANK_META[3];
  const { Icon } = meta;
  const isFirst = entry.rank === 1;
  const hot = entry.billableRatio >= HOT_RATIO && entry.billableCalls > 0;

  return (
    <div className={`${classes.champColumn} ${meta.tier} ${meta.cls}`}>
      {/* Open figure — no card, stands directly on the podium bar */}
      <motion.div
        className={classes.champFigure}
        initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.85, ease: EASE_SMOOTH, delay: reduceMotion ? 0 : delay }}
      >
        <motion.span
          className={`${classes.champIcon} ${!reduceMotion ? classes.bob : ''}`}
          initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -16, rotate: -8 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 160, damping: 19, delay: delay + 0.5 }
          }
        >
          <Icon size={isFirst ? 30 : 22} />
        </motion.span>

        <div className={classes.avatarRing}>
          <Avatar name={entry.name} size={isFirst ? 84 : 62} />
        </div>

        <p className={classes.champName} title={entry.name}>
          {entry.name}
          {isMe && <span className={classes.youBadge}>You</span>}
          {hot && (
            <span className={classes.hotBadge} title="Billable ratio over 70%">
              <Flame size={12} />
            </span>
          )}
        </p>

        <p className={classes.champValue}>
          <CountUp value={entry.billableCalls} />
        </p>
        <p className={classes.champValueLabel}>Billable Calls</p>

        <p className={classes.champStats}>
          {entry.billableRatio}% ratio
          <span className={classes.statDot}>·</span>
          {formatRevenue(entry.revenue)}
          <span className={classes.statDot}>·</span>
          {formatDuration(entry.avgDuration)} avg
        </p>
      </motion.div>

      {/* Podium bar */}
      <motion.div
        className={classes.pedestal}
        initial={reduceMotion ? { height: meta.pedestal } : { height: 0 }}
        animate={{ height: meta.pedestal }}
        transition={{ duration: reduceMotion ? 0 : 1.0, ease: EASE_SMOOTH, delay: reduceMotion ? 0 : delay + 0.15 }}
      >
        {isFirst && !reduceMotion && <span className={classes.shimmer} aria-hidden="true" />}
        <span className={classes.pedestalRank}>{entry.rank}</span>
      </motion.div>
    </div>
  );
};

const MetricPill = ({ icon: Icon, value, label, active }) => (
  <div className={`${classes.rowMetric} ${active ? classes.rowMetricActive : ''}`}>
    <span className={classes.rowMetricValue}>
      <Icon size={13} /> {value}
    </span>
    <span className={classes.rowMetricLabel}>{label}</span>
  </div>
);

const LeaderboardPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const dropdownMotion = useMemo(() => dropdownPanelMotion(reduceMotion), [reduceMotion]);
  const user = useAuthStore((s) => s.user);

  const [periodKey, setPeriodKey] = useState('month');
  const [data, setData] = useState({ entries: [], me: null, totalAgents: 0, generatedAt: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const [page, setPage] = useState(1);
  const dropdownRef = useRef(null);
  const championRef = useRef(null);
  // Once the first load completes, later loads (period switch, polling) update in place.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const load = useCallback(
    async ({ showSpinner = false, manual = false } = {}) => {
      try {
        if (showSpinner) setLoading(true);
        if (manual) setRefreshing(true);
        const next = await fetchLeaderboard({ period: periodKey });
        setData(next);
        setError(null);
        hasLoadedRef.current = true;
      } catch (err) {
        console.error('Leaderboard load failed:', err);
        if (showSpinner || manual) setError(err.message || 'Failed to load leaderboard');
      } finally {
        if (showSpinner) setLoading(false);
        if (manual) setRefreshing(false);
      }
    },
    [periodKey],
  );

  // Initial load + visibility-aware polling; refreshes on tab focus/visibility.
  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;
    let timerId = null;

    const run = async (opts) => {
      if (cancelled) return;
      await load(opts);
    };

    const schedule = () => {
      if (timerId) window.clearTimeout(timerId);
      const ms = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS;
      timerId = window.setTimeout(() => {
        run({ showSpinner: false }).finally(() => {
          if (!cancelled) schedule();
        });
      }, ms);
    };

    // Full-page loader only before the first data arrives; afterwards (e.g. on
    // period change) fetch in the background and swap the entries in place.
    run({ showSpinner: !hasLoadedRef.current, manual: hasLoadedRef.current }).then(() => {
      if (!cancelled) schedule();
    });

    const handleWake = () => {
      run({ showSpinner: false });
      schedule();
    };
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
    };
  }, [user?.uid, load]);

  const entries = useMemo(() => data.entries || [], [data.entries]);
  const me = data.me || null;
  const leaderCalls = entries[0]?.billableCalls || 0;

  const fireConfetti = useCallback(() => {
    if (reduceMotion) return;
    const defaults = {
      ticks: 280,
      gravity: 0.75,
      decay: 0.94,
      startVelocity: 38,
      colors: CONFETTI_COLORS,
      // Above the entire app shell (sidebar, header, modals) — covers the whole viewport.
      zIndex: 10000,
      disableForReducedMotion: true,
    };
    // Volley from across the full width so confetti rains over the whole app.
    confetti({ ...defaults, particleCount: 80, spread: 120, origin: { x: 0.5, y: 0.4 }, angle: 90 });
    confetti({ ...defaults, particleCount: 55, spread: 70, origin: { x: 0, y: 0.65 }, angle: 55 });
    confetti({ ...defaults, particleCount: 55, spread: 70, origin: { x: 1, y: 0.65 }, angle: 125 });
    window.setTimeout(() => {
      confetti({ ...defaults, particleCount: 45, spread: 100, origin: { x: 0.2, y: 0.1 }, angle: 280 });
      confetti({ ...defaults, particleCount: 45, spread: 100, origin: { x: 0.8, y: 0.1 }, angle: 260 });
    }, 250);
    window.setTimeout(() => {
      confetti({ ...defaults, particleCount: 60, spread: 160, startVelocity: 28, origin: { x: 0.5, y: 0.9 }, angle: 90 });
    }, 450);
  }, [reduceMotion]);

  // Celebrate the #1 agent — keyed on the *fetched* payload's period so the
  // burst only fires after fresh data lands, never while old data is on screen.
  useEffect(() => {
    const champ = entries[0]?.agentId;
    if (!champ) return;
    const celebrationKey = `${data.period || ''}:${champ}`;
    if (championRef.current === celebrationKey) return;
    championRef.current = celebrationKey;
    fireConfetti();
  }, [entries, data.period, fireConfetti]);

  const podium = entries.slice(0, 3);
  const podiumOrder = useMemo(() => {
    // Visual podium order: 2nd, 1st, 3rd on desktop.
    if (podium.length === 3) return [podium[1], podium[0], podium[2]];
    return podium;
  }, [podium]);

  const tableRows = useMemo(() => {
    const rows = entries.filter((e) => e.rank > 3);
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = Number(a[key] ?? 0);
      const bv = Number(b[key] ?? 0);
      if (av === bv) return a.rank - b.rank;
      return (av - bv) * factor;
    });
  }, [entries, sort]);

  const handleSort = (opt) => {
    setSort((prev) => {
      if (prev.key === opt.key) {
        return { key: opt.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key: opt.key, dir: opt.defaultDir };
    });
    setPage(1);
  };

  // Back to the first page when the period changes.
  useEffect(() => {
    setPage(1);
  }, [periodKey]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => tableRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE),
    [tableRows, safePage],
  );

  const listMotion = useMemo(() => ({
    container: {
      hidden: {},
      visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.07, delayChildren: reduceMotion ? 0 : 0.1 } },
    },
    item: {
      hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 },
      visible: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.55, ease: EASE_SMOOTH } },
    },
  }), [reduceMotion]);

  // Motivational messaging for the viewer.
  const meMessage = useMemo(() => {
    if (!me) return null;
    if (!me.rank) {
      return { tone: 'start', title: 'Get on the board', sub: 'Make your first billable call to claim a spot.' };
    }
    if (me.rank === 1) {
      return { tone: 'champ', title: "You're the champion", sub: 'Top of the leaderboard. Keep the crown!' };
    }
    if (me.rank <= 3) {
      return { tone: 'podium', title: "You're on the podium!", sub: `Ranked #${me.rank} of ${data.totalAgents}.` };
    }
    const nextUp = entries.find((e) => e.rank === me.rank - 1);
    if (nextUp) {
      const gap = Math.max(0, nextUp.billableCalls - me.billableCalls);
      return {
        tone: 'climb',
        title: `Ranked #${me.rank} of ${data.totalAgents}`,
        sub: gap === 0
          ? `Neck-and-neck with #${nextUp.rank} — one more billable call to break ahead!`
          : `${gap} billable ${gap === 1 ? 'call' : 'calls'} to overtake #${nextUp.rank}.`,
        progress: nextUp.billableCalls ? Math.min(100, Math.round((me.billableCalls / nextUp.billableCalls) * 100)) : 0,
      };
    }
    return { tone: 'climb', title: `Ranked #${me.rank} of ${data.totalAgents}`, sub: 'Keep climbing!' };
  }, [me, entries, data.totalAgents]);

  const updatedLabel = data.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) return <PageLoader />;

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.header className={classes.header} variants={presets.child}>
        <div className={classes.headerLead}>
          <span className={`${classes.headerIcon} ${!reduceMotion ? classes.bob : ''}`}>
            <Trophy size={22} />
          </span>
          <div>
            <h1 className={classes.title}>Leaderboard</h1>
            <p className={classes.subtitle}>
              Top agents by billable calls
              {updatedLabel ? <span className={classes.updatedAt}> · Updated {updatedLabel}</span> : null}
            </p>
          </div>
        </div>

        <div className={classes.headerActions}>
          <div className={classes.customDropdown} ref={dropdownRef}>
            <button
              type="button"
              className={classes.dropdownTrigger}
              onClick={() => setIsDropdownOpen((o) => !o)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
            >
              {PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label}
              <ChevronDown size={16} className={`${classes.dropdownIcon} ${isDropdownOpen ? classes.open : ''}`} />
            </button>
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div className={classes.dropdownMenu} role="listbox" {...dropdownMotion}>
                  {PERIOD_OPTIONS.map((opt) => (
                    <div
                      key={opt.key}
                      role="option"
                      aria-selected={periodKey === opt.key}
                      className={`${classes.dropdownItem} ${periodKey === opt.key ? classes.activeItem : ''}`}
                      onClick={() => {
                        setPeriodKey(opt.key);
                        setIsDropdownOpen(false);
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className={classes.refreshBtn}
            onClick={() => load({ manual: true })}
            disabled={refreshing}
            aria-label="Refresh leaderboard"
            title="Refresh"
          >
            <RefreshCw size={16} className={refreshing ? classes.spinning : ''} />
            <span className={classes.refreshLabel}>Refresh</span>
          </button>
        </div>
      </motion.header>

      {error && <div className={classes.errorBanner}>{error}</div>}

      <div className={refreshing ? classes.boardRefreshing : undefined}>
      {entries.length === 0 ? (
        <motion.div className={classes.emptyCard} variants={presets.child}>
          <span className={`${classes.emptyIcon} ${!reduceMotion ? classes.floaty : ''}`}>
            <Trophy size={36} />
          </span>
          <p className={classes.emptyTitle}>The stage is set</p>
          <p className={classes.emptySub}>No billable calls this period yet — be the first to claim the crown.</p>
        </motion.div>
      ) : (
        <>
          {/* Champions stage */}
          <motion.section
            className={`${classes.stage} ${reduceMotion ? classes.stageStatic : ''}`}
            variants={presets.child}
          >
            <div className={classes.aurora} aria-hidden="true">
              <span className={`${classes.blob} ${classes.blobGold}`} />
              <span className={`${classes.blob} ${classes.blobBrand}`} />
              <span className={`${classes.blob} ${classes.blobCyan}`} />
            </div>

            <div className={classes.stageHeader}>
              <Sparkles size={15} />
              <span>
                {PERIOD_OPTIONS.find((p) => p.key === periodKey)?.label} champions
              </span>
            </div>

            <div className={classes.podium}>
              {podiumOrder.map((entry, i) => (
                <ChampionColumn
                  key={entry.agentId}
                  entry={entry}
                  reduceMotion={reduceMotion}
                  isMe={me?.agentId === entry.agentId}
                  delay={0.15 + i * 0.22 + (entry.rank === 1 ? 0.15 : 0)}
                />
              ))}
            </div>
          </motion.section>

          {/* Motivational "you" card */}
          {me && meMessage && (
            <motion.div className={`${classes.meBanner} ${classes[`me_${meMessage.tone}`] || ''}`} variants={presets.child}>
              <div className={classes.meBannerLead}>
                <span className={classes.meBannerRank}>{me.rank ? `#${me.rank}` : '—'}</span>
                <div>
                  <p className={classes.meBannerTitle}>{meMessage.title}</p>
                  <p className={classes.meBannerSub}>{meMessage.sub}</p>
                  {typeof meMessage.progress === 'number' && (
                    <div className={classes.meProgressTrack}>
                      <motion.div
                        className={classes.meProgressFill}
                        initial={reduceMotion ? false : { width: 0 }}
                        animate={{ width: `${meMessage.progress}%` }}
                        transition={{ duration: reduceMotion ? 0 : 1.2, ease: EASE_SMOOTH, delay: reduceMotion ? 0 : 0.3 }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className={classes.meBannerStats}>
                <div>
                  <span className={classes.meStatValue}>{me.billableCalls}</span>
                  <span className={classes.meStatLabel}>Billable</span>
                </div>
                <div>
                  <span className={classes.meStatValue}>{me.billableRatio}%</span>
                  <span className={classes.meStatLabel}>Ratio</span>
                </div>
                <div>
                  <span className={classes.meStatValue}>{formatRevenue(me.revenue)}</span>
                  <span className={classes.meStatLabel}>Revenue</span>
                </div>
                <div>
                  <span className={classes.meStatValue}>{formatDuration(me.avgDuration)}</span>
                  <span className={classes.meStatLabel}>Avg</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Ranked rows (ranks 4+) */}
          {tableRows.length > 0 && (
            <motion.section className={classes.rankSection} variants={presets.child}>
              <div className={classes.rankSectionHeader}>
                <h3><TrendingUp size={18} /> The chase</h3>
                <div className={classes.sortPills} role="group" aria-label="Sort by">
                  {SORT_OPTIONS.map((opt) => {
                    const active = sort.key === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`${classes.sortPill} ${active ? classes.sortPillActive : ''}`}
                        onClick={() => handleSort(opt)}
                        aria-pressed={active}
                      >
                        {opt.label}
                        {active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.div
                className={classes.rankList}
                variants={listMotion.container}
                initial="hidden"
                animate="visible"
                key={`${sort.key}${sort.dir}${safePage}`}
              >
                {pagedRows.map((entry) => {
                  const isMe = me?.agentId === entry.agentId;
                  const pct = leaderCalls ? Math.max(3, Math.round((entry.billableCalls / leaderCalls) * 100)) : 0;
                  return (
                    <motion.div
                      key={entry.agentId}
                      className={`${classes.rankRow} ${isMe ? classes.meRow : ''}`}
                      variants={listMotion.item}
                    >
                      <span className={classes.rankNum}>#{entry.rank}</span>
                      <Avatar name={entry.name} size={38} />
                      <div className={classes.rankIdentity}>
                        <span className={classes.rankName} title={entry.name}>
                          {entry.name}
                          {isMe && <span className={classes.mePillSmall}>You</span>}
                        </span>
                        <div className={classes.rankBarTrack}>
                          <motion.div
                            className={classes.rankBarFill}
                            initial={reduceMotion ? false : { width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: reduceMotion ? 0 : 1.0, ease: EASE_SMOOTH, delay: reduceMotion ? 0 : 0.2 }}
                          />
                        </div>
                      </div>
                      <div className={classes.rankMetrics}>
                        <MetricPill icon={Phone} value={entry.billableCalls} label="Billable" active={sort.key === 'billableCalls'} />
                        <MetricPill icon={Percent} value={`${entry.billableRatio}%`} label="Ratio" active={sort.key === 'billableRatio'} />
                        <MetricPill icon={DollarSign} value={formatRevenue(entry.revenue)} label="Revenue" active={sort.key === 'revenue'} />
                        <MetricPill icon={Clock} value={formatDuration(entry.avgDuration)} label="Avg" active={sort.key === 'avgDuration'} />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              {totalPages > 1 && (
                <div className={classes.pagination}>
                  <button
                    type="button"
                    className={classes.pageBtn}
                    disabled={safePage === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className={classes.pageInfo}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className={classes.pageBtn}
                    disabled={safePage === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </motion.section>
          )}
        </>
      )}
      </div>
    </motion.div>
  );
};

export default LeaderboardPage;
