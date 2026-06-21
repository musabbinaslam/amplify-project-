import { useState, useEffect, useCallback } from 'react';
import {
  Gift, Copy, CheckCircle2, Share2, Users, TrendingUp,
  Clock, ExternalLink, MessageCircle, Mail, Link2,
  Award, ChevronDown, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { referralService } from '../services/referralService';
import PageLoader from '../components/ui/PageLoader';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../motion/appMotion';
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

/* eslint-disable react/prop-types -- local stat card helper */
const StatCard = ({ label, value, icon: Icon, variants }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`glass ${classes.statCard}`}
      variants={variants}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.2, ease: EASE_SMOOTH }}
    >
      <div className={classes.statIconBox}>
        <Icon size={18} />
      </div>
      <div className={classes.statLabel}>{label}</div>
      <div className={classes.statValue}>{value}</div>
    </motion.div>
  );
};

/* eslint-disable react/prop-types -- local FAQ accordion helper */
const FaqAccordionItem = ({ question, answer, isOpen, onToggle, reduceMotion }) => (
  <div className={classes.faqItem}>
    <button
      type="button"
      className={`${classes.faqQuestion} ${isOpen ? classes.faqQuestionOpen : ''}`}
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span>{question}</span>
      <ChevronDown
        size={18}
        className={`${classes.faqChevron} ${isOpen ? classes.faqChevronOpen : ''}`}
      />
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          className={classes.faqAnswerWrap}
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_SMOOTH }}
        >
          <p className={classes.faqAnswer}>{answer}</p>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

const ReferralProgramPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const [dashboard, setDashboard] = useState(null);
  const [discount, setDiscount] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);
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
      email: `mailto:?subject=${encodeURIComponent('Join CallsFlow — Help Me Earn a Discount!')}&body=${text}`,
      x: `https://twitter.com/intent/tweet?text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    window.open(urls[platform], '_blank', 'noopener,noreferrer');
  };

  if (loading) return <PageLoader />;
  if (!dashboard) {
    return (
      <motion.div
        className={classes.page}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        <motion.p className={classes.errorText} variants={presets.child}>
          Failed to load referral data.
        </motion.p>
      </motion.div>
    );
  }

  const { code, shareUrl, stats, recent, config } = dashboard;

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      {(discount?.hasDiscount && !discount.expired) || discount?.expired ? (
        <motion.div className={classes.bannerStack} variants={presets.child}>
          {discount?.hasDiscount && !discount.expired && (
            <div className={classes.discountBanner}>
              <Gift size={18} />
              <span>
                <strong>You have a {discount.percent}% discount ready for your next top-up!</strong>
                {' '}Expires {new Date(discount.expiresAt).toLocaleDateString()}.
              </span>
            </div>
          )}
          {discount?.expired && (
            <div className={classes.expiredBanner}>
              <AlertCircle size={18} />
              <span>Your referral discount expired. Check back for future promotions.</span>
            </div>
          )}
        </motion.div>
      ) : null}

      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div className={classes.iconBox} aria-hidden="true">
          <Gift size={22} />
        </div>
        <div>
          <h2>Referral Program</h2>
          <p>Share your link and earn discounts when fellow agents go live</p>
        </div>
      </motion.div>

      <motion.section className={`glass ${classes.heroSection}`} variants={presets.child}>
        <div className={classes.heroContent}>
          <div className={classes.heroTextBlock}>
            <p className={classes.heroSubtitle}>
              Share your code with a fellow agent. When they sign up, top up at least{' '}
              <strong>$500</strong>, and complete their first call —{' '}
              <strong>you earn a {config.discountPercent}% discount</strong> on your next purchase.
            </p>

            <div className={classes.limitBanner}>
              <AlertCircle size={18} />
              <div className={classes.limitBannerText}>
                <strong>
                  Monthly Limit: {stats.monthCount} / {config.maxReferralsPerMonth} Referrals Used
                </strong>
                <span>
                  You can successfully refer up to {config.maxReferralsPerMonth} new agents per calendar month.
                </span>
              </div>
            </div>

            <div className={classes.chainNotice}>
              <Link2 size={18} className={classes.chainIcon} />
              <span>
                <strong>One referral, one reward.</strong> Each person you refer earns you one{' '}
                {config.discountPercent}% discount. Once that discount is used, share your link with the next person to
                keep the chain going!
              </span>
            </div>
          </div>

          <div className={classes.codeBlock}>
            <label className={classes.fieldLabel} htmlFor="referral-code">Your Referral Code</label>
            <div className={classes.codeRow}>
              <span id="referral-code" className={classes.codeValue}>{code}</span>
              <button
                type="button"
                className={`${classes.copyBtn} ${copied === 'code' ? classes.copyBtnDone : ''}`}
                onClick={() => copyToClipboard(code, 'code')}
              >
                {copied === 'code' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied === 'code' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={classes.linkBlock}>
            <label className={classes.fieldLabel} htmlFor="share-link">Share Link</label>
            <div className={classes.codeRow}>
              <span id="share-link" className={classes.linkValue}>{shareUrl}</span>
              <button
                type="button"
                className={`${classes.copyBtn} ${copied === 'link' ? classes.copyBtnDone : ''}`}
                onClick={() => copyToClipboard(shareUrl, 'link')}
              >
                {copied === 'link' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className={classes.shareRow}>
            <button type="button" className={`${classes.shareBtn} ${classes.whatsapp}`} onClick={() => shareVia('whatsapp')}>
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button type="button" className={`${classes.shareBtn} ${classes.emailShare}`} onClick={() => shareVia('email')}>
              <Mail size={16} /> Email
            </button>
            <button type="button" className={`${classes.shareBtn} ${classes.xShare}`} onClick={() => shareVia('x')}>
              <ExternalLink size={16} /> X
            </button>
            <button type="button" className={`${classes.shareBtn} ${classes.linkedinShare}`} onClick={() => shareVia('linkedin')}>
              <ExternalLink size={16} /> LinkedIn
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section className={classes.statsRow} variants={presets.statsStrip}>
        <StatCard label="Total Signups" value={stats.signups} icon={Users} variants={presets.child} />
        <StatCard label="Qualified" value={stats.qualified} icon={TrendingUp} variants={presets.child} />
        <StatCard label="Pending" value={stats.pending} icon={Clock} variants={presets.child} />
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><Users size={20} /> Referral Activity</h3>
          <p>Track your referrals and their progress</p>
        </div>

        {recent.length === 0 ? (
          <div className={classes.emptyPanel}>
            <Share2 size={32} className={classes.emptyPanelIcon} />
            <h4>No referrals yet</h4>
            <p>Share your link with fellow agents to get started!</p>
          </div>
        ) : (
          <div className={`glass ${classes.tableWrap}`}>
            <div className={classes.tableScroll}>
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
          </div>
        )}
      </motion.section>

      <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3><Gift size={20} /> How It Works</h3>
          <p>Three simple steps to earn your discount</p>
        </div>
        <div className={classes.stepsRow}>
          <div className={`glass ${classes.stepCard}`}>
            <div className={classes.stepNumber}>1</div>
            <h4>Sign Up</h4>
            <p>A friend signs up using your referral link or code</p>
          </div>
          <div className={classes.stepConnector} />
          <div className={`glass ${classes.stepCard}`}>
            <div className={classes.stepNumber}>2</div>
            <h4>Top Up $500+</h4>
            <p>They make a qualifying top-up of at least <strong>$500</strong></p>
          </div>
          <div className={classes.stepConnector} />
          <div className={`glass ${classes.stepCard}`}>
            <div className={classes.stepNumber}>3</div>
            <h4>Go Live</h4>
            <p>They complete their first call — you get {config.discountPercent}% off your next purchase!</p>
          </div>
        </div>
      </motion.section>

      {leaderboard.length > 0 && (
        <motion.section className={`glass ${classes.sectionCard}`} variants={presets.child}>
          <div className={classes.sectionHeader}>
            <h3><Award size={20} className={classes.goldIcon} /> Top Referrers</h3>
            <p>Agents who have made the most successful referrals</p>
          </div>
          <div className={classes.leaderboardList}>
            {leaderboard.map((entry) => (
              <div key={entry.rank} className={`glass ${classes.leaderboardItem}`}>
                <span className={`${classes.leaderRank} ${entry.rank <= 3 ? classes[`rank${entry.rank}`] : ''}`}>
                  #{entry.rank}
                </span>
                <span className={classes.leaderName}>{entry.displayName}</span>
                <span className={classes.leaderStat}>{entry.qualified} qualified</span>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      <motion.section className={`glass ${classes.sectionCard} ${classes.faqSection}`} variants={presets.child}>
        <div className={classes.sectionHeader}>
          <h3>FAQ &amp; Terms</h3>
        </div>
        {[
          { q: 'What does "going live" mean?', a: 'Going live means completing your first inbound call that lasts at least 30 seconds. Short or missed calls don\'t count.' },
          { q: 'How does the one-referral, one-reward policy work?', a: 'Each person you successfully refer earns you exactly one 20% discount on your next top-up. Once that discount is used (or expires), simply share your link with a new person to earn your next discount. The more people you refer, the more discounts you unlock — one at a time!' },
          { q: 'What is the minimum top-up for my referral to count?', a: 'The person you refer must make a qualifying top-up of at least $500. Top-ups below this amount will not activate your reward.' },
          { q: 'When does my discount expire?', a: `Your referral discount expires ${config.expiryDays} days after your referred friend goes live. Use it before then!` },
          { q: 'Can I transfer my discount?', a: 'No. Referral discounts are non-transferable and can only be used by you (the referrer) on your own account.' },
          { q: 'Is there a cash value?', a: 'No. The discount is applied as bonus wallet credits after your discounted purchase. It has no cash value and cannot be withdrawn.' },
          { q: 'How many people can I refer?', a: `You can successfully refer up to ${config.maxReferralsPerMonth} people per calendar month. Each person can only use one referral code, and each successful referral earns you one ${config.discountPercent}% discount.` },
        ].map((faq, i) => (
          <FaqAccordionItem
            key={faq.q}
            question={faq.q}
            answer={faq.a}
            isOpen={faqOpen === i}
            onToggle={() => setFaqOpen(faqOpen === i ? null : i)}
            reduceMotion={reduceMotion}
          />
        ))}
      </motion.section>
    </motion.div>
  );
};

export default ReferralProgramPage;
