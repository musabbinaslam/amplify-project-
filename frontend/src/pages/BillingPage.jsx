import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { DollarSign, Clock, RefreshCw, CheckCircle2, X, AlertCircle, Gift, Wallet, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './BillingPage.module.css';
import { stripeService } from '../services/stripeService';
import { referralService } from '../services/referralService';
import PageLoader from '../components/ui/PageLoader';

const TOPUP_TIERS = [
  { id: 'tier_50', label: '$50', amountCents: 5000 },
  { id: 'tier_100', label: '$100', amountCents: 10000 },
  { id: 'tier_250', label: '$250', amountCents: 25000, popular: true },
  { id: 'tier_500', label: '$500', amountCents: 50000 },
  { id: 'tier_1000', label: '$1,000', amountCents: 100000 },
];

const BillingPage = () => {
  const presets = useSubtlePageMotion();
  const location = useLocation();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [discount, setDiscount] = useState(null);
  const checkoutInFlightRef = useRef(false);

  useEffect(() => {
    const initBilling = async () => {
      setErrorMsg('');
      const params = new URLSearchParams(location.search);

      if (params.get('payment') === 'success') {
        const sessionId = params.get('session_id');
        if (sessionId) {
          try {
            const result = await stripeService.verifyCheckout(sessionId);
            if (result?.credited) {
              setSuccessMsg('Payment verified. Credits were added to your wallet.');
            } else {
              setSuccessMsg('Payment successful! Credits have been added to your wallet.');
            }
          } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Payment succeeded, but we could not verify credits yet. Please refresh in a moment.');
          }
        } else {
          // Backward compatibility for checkouts created before session_id was added.
          setSuccessMsg('Payment successful! Credits are being processed.');
        }
      }

      await fetchWallet();

      // Fetch referral discount status
      try {
        const discountData = await referralService.getDiscountStatus();
        setDiscount(discountData);
      } catch {} // non-blocking
    };

    initBilling();
  }, [location]);

  useEffect(() => {
    const refreshWalletQuiet = async () => {
      try {
        const data = await stripeService.getWallet();
        setWallet(data);
        setTransactions(data.transactions || []);
      } catch (err) {
        console.error('Failed to refresh wallet', err);
      }
    };

    const onWalletUpdated = (e) => {
      if (e.detail !== undefined && e.detail !== null) {
        setWallet((prev) => (prev ? { ...prev, balance: e.detail } : { balance: e.detail, transactions: [] }));
      }
      refreshWalletQuiet();
    };

    window.addEventListener('wallet_updated', onWalletUpdated);
    return () => window.removeEventListener('wallet_updated', onWalletUpdated);
  }, []);

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const data = await stripeService.getWallet();
      setWallet(data);
      setTransactions(data.transactions || []);
      window.dispatchEvent(new CustomEvent('wallet_updated', { detail: data.balance }));
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load wallet information.');
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async (amountCents) => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCheckoutLoading(true);
    setErrorMsg('');
    try {
      const { url } = await stripeService.createCheckout(amountCents);
      window.location.href = url; // Redirect to Stripe Checkout
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setCheckoutLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  const formatMoney = (cents) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return <PageLoader />;
  }

  const balance = wallet?.balance || 0;
  const totalCreditsAdded = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Math.abs(Number(t.amountCents || 0)), 0);
  const totalSpent = transactions
    .filter((t) => t.type !== 'credit')
    .reduce((sum, t) => sum + Math.abs(Number(t.amountCents || 0)), 0);
  const lastTopup = transactions.find((t) => t.type === 'credit');

  return (
    <>
    <motion.div
      className={classes.billingPage}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={presets.child}>
        {errorMsg && <div className={classes.errorBanner}><AlertCircle size={16}/> {errorMsg}</div>}
        {successMsg && <div className={classes.successBanner}><CheckCircle2 size={16}/> {successMsg}</div>}

        {discount?.hasDiscount && !discount.expired && (
          <div className={classes.successBanner} style={{ gap: 10 }}>
            <Gift size={18} />
            <span>
              <strong>{discount.percent}% referral discount active!</strong> Your next top-up will be discounted.
              {discount.expiresAt && ` Expires ${new Date(discount.expiresAt).toLocaleDateString()}.`}
            </span>
          </div>
        )}
      </motion.div>

      <motion.section className={classes.sectionBox} variants={presets.child}>
        <div className={classes.sectionTop}>
          <div className={classes.sectionHeader}>
            <h3><DollarSign size={20} className={classes.blueIcon} /> Account Balance</h3>
            <p>Your wallet summary and quick top-up actions</p>
          </div>
          <button className={classes.addCreditsBtn} onClick={() => setShowTopupModal(true)}>+ Add Credits</button>
        </div>

        <div className={classes.balanceRow}>
          <div className={classes.balanceMeta}>
            <div className={classes.balanceAmount}>{formatMoney(balance)}</div>
            {balance < 5000 && (
              <div className={classes.lowBalanceWarning}>
                <AlertCircle size={14} /> Low balance - add credits to continue taking calls
              </div>
            )}
          </div>
        </div>

        <div className={classes.statsGrid}>
          <div className={classes.statCard}>
            <Wallet size={16} />
            <span>Credits Added</span>
            <strong>{formatMoney(totalCreditsAdded)}</strong>
          </div>
          <div className={classes.statCard}>
            <TrendingUp size={16} />
            <span>Total Spent</span>
            <strong>{formatMoney(totalSpent)}</strong>
          </div>
          <div className={classes.statCard}>
            <Clock size={16} />
            <span>Last Top-up</span>
            <strong>{lastTopup ? new Date(lastTopup.createdAt).toLocaleDateString() : 'No top-up yet'}</strong>
          </div>
        </div>
      </motion.section>

      <motion.section className={classes.sectionBox} variants={presets.child}>
        <div className={classes.sectionTop}>
          <div>
            <h3><Clock size={20} /> Transaction History</h3>
            <p>Credit additions, call deductions, and balance changes</p>
          </div>
          <button className={classes.refreshBtn} onClick={fetchWallet}><RefreshCw size={14} className={loading ? classes.spinner : ''} /> Refresh</button>
        </div>
        {transactions.length === 0 ? (
          <div className={classes.emptyStateBox}>
            <Clock size={34} className={classes.emptyIcon} />
            <p>No transactions yet</p>
            <span>Your credit history will appear here</span>
          </div>
        ) : (
          <div className={classes.tableWrap}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td>{t.description}</td>
                    <td className={t.type === 'credit' ? classes.creditAmt : classes.debitAmt}>
                      {t.type === 'credit' ? '+' : '-'}{formatMoney(Math.abs(t.amountCents))}
                    </td>
                    <td>{formatMoney(t.balanceAfterCents || 0)}</td>
                    <td className={classes.dateCell}>{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </motion.div>

      {showTopupModal && (
        <div className={classes.modalOverlay} onClick={() => setShowTopupModal(false)}>
          <div className={classes.modalBox} onClick={e => e.stopPropagation()}>
            <div className={classes.modalHeader}>
              <h3>Add Call Credits</h3>
              <button className={classes.closeBtn} onClick={() => setShowTopupModal(false)}><X size={18}/></button>
            </div>
            <p className={classes.modalSub}>Select a top-up amount. Credits will be instantly added to your wallet.</p>
            
            <div className={classes.tiersGrid}>
              {TOPUP_TIERS.map(tier => {
                const hasDisc = discount?.hasDiscount && !discount.expired;
                const discountedCents = hasDisc
                  ? Math.round(tier.amountCents * (1 - discount.percent / 100))
                  : tier.amountCents;
                return (
                  <button 
                    key={tier.id} 
                    className={`${classes.tierBtn} ${tier.popular ? classes.tierPopular : ''}`}
                    onClick={() => handleTopup(tier.amountCents)}
                    disabled={checkoutLoading}
                  >
                    {tier.popular && <span className={classes.popularBadge}>Most Popular</span>}
                    {hasDisc ? (
                      <span className={classes.tierAmount}>
                        <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '0.7em', marginRight: 8 }}>{tier.label}</span>
                        ${(discountedCents / 100).toFixed(0)}
                      </span>
                    ) : (
                      <span className={classes.tierAmount}>{tier.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BillingPage;
