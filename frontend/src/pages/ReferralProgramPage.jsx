import React, { useState, useEffect, useCallback } from 'react';
import {
  Gift, Copy, CheckCircle2, Share2, Users, TrendingUp,
  Clock, ExternalLink, QrCode, MessageCircle, Mail,
  Award, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { referralService } from '../services/referralService';
import PageLoader from '../components/ui/PageLoader';
import classes from './ReferralProgramPage.module.css';

const STATUS_LABELS = {
  pending: 'Pending',
  qualified: 'Qualified',
  live: 'Live',
  discount_applied: 'Discount Applied',
  blocked: 'Blocked',
  reversed: 'Reversed',
};

const STATUS_COLORS = {
  pending: 'statusPending',
  qualified: 'statusQualified',
  live: 'statusLive',
  discount_applied: 'statusApplied',
  blocked: 'statusBlocked',
  reversed: 'statusReversed',
};

const STAGE_MAP = {
  pending: 1,
  qualified: 2,
  live: 3,
  discount_applied: 3,
  blocked: 0,
  reversed: 0,
};

const ReferralProgramPage = () => {
  const [dashboard, setDashboard] = useState(null);
  const [discount, setDiscount] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null); // 'code' | 'link' | null
  const [faqOpen, setFaqOpen] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, disc, lb] = await Promise.all([
        referralService.getMyDashboard(),
        referralService.getDiscountStatus().catch(() => null),
        referralService.getLeaderboard().catch(() => ({ leaderboard: [] })),
      ]);
      setDashboard(dash);
      setDiscount(disc);
      setLeaderboard(lb?.leaderboard || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      toast.success(type === 'code' ? 'Code copied!' : 'Link copied!');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const shareVia = (platform) => {
    if (!dashboard) return;
    const text = encodeURIComponent(dashboard.shareText);
    const url = encodeURIComponent(dashboard.shareUrl);
    const urls = {
      whatsapp: `https://wa.me/?text=${text}`,
      email: `mailto:?subject=${encodeURIComponent('Join CallsFlow — Get 20% Off')}&body=${text}`,
      x: `https://twitter.com/intent/tweet?text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    window.open(urls[platform], '_blank', 'noopener,noreferrer');
  };

  if (loading) return <PageLoader />;
  if (!dashboard) return <div className={classes.page}><p className={classes.errorText}>Failed to load referral data.</p></div>;

  const { code, shareUrl, stats, recent, config } = dashboard;

  return (
    <div className={classes.page}>
      {/* ── Discount Banner (for referee) ── */}
      {discount?.hasDiscount && !discount.expired && (
        <div className={classes.discountBanner}>
          <Gift size={20} />
          <div>
            <strong>You have a {discount.percent}% discount ready for your next top-up!</strong>
            <span> Expires {new Date(discount.expiresAt).toLocaleDateString()}.</span>
          </div>
        </div>
      )}
      {discount?.expired && (
        <div className={classes.expiredBanner}>
          <AlertCircle size={18} />
          <span>Your referral discount expired. Check back for future promotions.</span>
        </div>
      )}

      {/* ── Hero Card ── */}
      <section className={classes.heroCard}>
        <div className={classes.heroContent}>
          <div className={classes.heroTextBlock}>
            <h1 className={classes.heroTitle}>
              <Gift size={28} className={classes.heroIcon} />
              Referral Program
            </h1>
            <p className={classes.heroSubtitle}>
              Anyone who signs up with your code, makes a payment, and goes live gets{' '}
              <strong>{config.discountPercent}% off</strong> their next purchase.
            </p>
          </div>

          <div className={classes.codeBlock}>
            <label className={classes.codeLabel}>Your Referral Code</label>
            <div className={classes.codeRow}>
              <span className={classes.codeValue}>{code}</span>
              <button
                className={`${classes.copyBtn} ${copied === 'code' ? classes.copyBtnDone : ''}`}
                onClick={() => copyToClipboard(code, 'code')}
              >
                {copied === 'code' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied === 'code' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={classes.linkBlock}>
            <label className={classes.codeLabel}>Share Link</label>
            <div className={classes.codeRow}>
              <span className={classes.linkValue}>{shareUrl}</span>
              <button
                className={`${classes.copyBtn} ${copied === 'link' ? classes.copyBtnDone : ''}`}
                onClick={() => copyToClipboard(shareUrl, 'link')}
              >
                {copied === 'link' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={classes.shareRow}>
            <button className={`${classes.shareBtn} ${classes.whatsapp}`} onClick={() => shareVia('whatsapp')}>
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button className={`${classes.shareBtn} ${classes.emailShare}`} onClick={() => shareVia('email')}>
              <Mail size={16} /> Email
            </button>
            <button className={`${classes.shareBtn} ${classes.xShare}`} onClick={() => shareVia('x')}>
              <ExternalLink size={16} /> X
            </button>
            <button className={`${classes.shareBtn} ${classes.linkedinShare}`} onClick={() => shareVia('linkedin')}>
              <ExternalLink size={16} /> LinkedIn
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Row ── */}
      <section className={classes.statsRow}>
        <div className={classes.statCard}>
          <div className={classes.statIconWrap}><Users size={22} className={classes.statIcon} /></div>
          <div className={classes.statMeta}>
            <span className={classes.statValue}>{stats.signups}</span>
            <span className={classes.statLabel}>Total Signups</span>
          </div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIconWrap}><TrendingUp size={22} className={classes.statIcon} /></div>
          <div className={classes.statMeta}>
            <span className={classes.statValue}>{stats.qualified}</span>
            <span className={classes.statLabel}>Qualified</span>
          </div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statIconWrap}><Clock size={22} className={classes.statIcon} /></div>
          <div className={classes.statMeta}>
            <span className={classes.statValue}>{stats.pending}</span>
            <span className={classes.statLabel}>Pending</span>
          </div>
        </div>
      </section>

      {/* ── Activity Table ── */}
      <section className={classes.sectionBox}>
        <div className={classes.sectionHeader}>
          <h3><Users size={20} /> Referral Activity</h3>
          <p>Track your referrals and their progress</p>
        </div>

        {recent.length === 0 ? (
          <div className={classes.emptyState}>
            <Share2 size={36} className={classes.emptyIcon} />
            <p>No referrals yet</p>
            <span>Share your link with fellow agents to get started!</span>
          </div>
        ) : (
          <div className={classes.tableWrap}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Referee</th>
                  <th>Status</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.refereeUid}>
                    <td className={classes.dateCell}>
                      {r.signupAt ? new Date(r.signupAt).toLocaleDateString() : '—'}
                    </td>
                    <td>{r.refereeEmail || r.refereeName || '—'}</td>
                    <td>
                      <span className={`${classes.statusPill} ${classes[STATUS_COLORS[r.status]] || ''}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td>
                      <div className={classes.stageBar}>
                        {[1, 2, 3].map((s) => (
                          <div
                            key={s}
                            className={`${classes.stageDot} ${(STAGE_MAP[r.status] || 0) >= s ? classes.stageDotActive : ''}`}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── How It Works ── */}
      <section className={classes.sectionBox}>
        <div className={classes.sectionHeader}>
          <h3><Gift size={20} /> How It Works</h3>
          <p>Three simple steps to earn your discount</p>
        </div>
        <div className={classes.stepsRow}>
          <div className={classes.stepCard}>
            <div className={classes.stepNumber}>1</div>
            <h4>Sign Up</h4>
            <p>A friend signs up using your referral link or code</p>
          </div>
          <div className={classes.stepConnector} />
          <div className={classes.stepCard}>
            <div className={classes.stepNumber}>2</div>
            <h4>Make Payment</h4>
            <p>They make their first top-up payment (min $50)</p>
          </div>
          <div className={classes.stepConnector} />
          <div className={classes.stepCard}>
            <div className={classes.stepNumber}>3</div>
            <h4>Go Live</h4>
            <p>They complete their first call — {config.discountPercent}% discount unlocked!</p>
          </div>
        </div>
      </section>

      {/* ── Leaderboard ── */}
      {leaderboard.length > 0 && (
        <section className={classes.sectionBox}>
          <div className={classes.sectionHeader}>
            <h3><Award size={20} className={classes.goldIcon} /> Top Referrers</h3>
            <p>Agents who have made the most successful referrals</p>
          </div>
          <div className={classes.leaderboardList}>
            {leaderboard.map((entry) => (
              <div key={entry.rank} className={classes.leaderboardItem}>
                <span className={`${classes.leaderRank} ${entry.rank <= 3 ? classes[`rank${entry.rank}`] : ''}`}>
                  #{entry.rank}
                </span>
                <span className={classes.leaderName}>{entry.displayName}</span>
                <span className={classes.leaderStat}>{entry.qualified} qualified</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section className={classes.sectionBox}>
        <div className={classes.sectionHeader}>
          <h3>FAQ & Terms</h3>
        </div>
        {[
          { q: 'What does "going live" mean?', a: 'Going live means completing your first inbound call that lasts at least 30 seconds. Short or missed calls don\'t count.' },
          { q: 'When does my discount expire?', a: `Your referral discount expires ${config.expiryDays} days after your referred friend goes live. Use it before then!` },
          { q: 'Can I transfer my discount?', a: 'No. Referral discounts are non-transferable and can only be used by the referred agent on their own account.' },
          { q: 'Is there a cash value?', a: 'No. The discount is applied as bonus wallet credits after your discounted purchase. It has no cash value and cannot be withdrawn.' },
          { q: 'How many people can I refer?', a: 'You can refer up to 100 people. Each person can only use one referral code.' },
        ].map((faq, i) => (
          <div key={i} className={classes.faqItem}>
            <button className={classes.faqQuestion} onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
              <span>{faq.q}</span>
              {faqOpen === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {faqOpen === i && <p className={classes.faqAnswer}>{faq.a}</p>}
          </div>
        ))}
      </section>
    </div>
  );
};

export default ReferralProgramPage;
