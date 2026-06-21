import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { DollarSign, Clock, RefreshCw, CheckCircle2, AlertCircle, Gift, Wallet, TrendingUp } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { EASE_SMOOTH } from '../motion/appMotion';
import classes from './BillingPage.module.css';
import { stripeService } from '../services/stripeService';
import { referralService } from '../services/referralService';
import PageLoader from '../components/ui/PageLoader';
import AddCreditsModal from '../components/modals/AddCreditsModal';

/* eslint-disable react/prop-types -- local stat card helper */
const StatCard = ({ label, value, icon: Icon, variants, valueClassName }) => {
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
      <div className={`${classes.statValue} ${valueClassName || ''}`}>{value}</div>
    </motion.div>
  );
};

const BillingPage = () => {
  const presets = useSubtlePageMotion();
  const location = useLocation();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
          setSuccessMsg('Payment successful! Credits are being processed.');
        }
      }

      await fetchWallet();

      try {
        const discountData = await referralService.getDiscountStatus();
        setDiscount(discountData);
      } catch {
        // non-blocking
      }
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await stripeService.getWallet();
      setWallet(data);
      setTransactions(data.transactions || []);
      window.dispatchEvent(new CustomEvent('wallet_updated', { detail: data.balance }));
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to refresh wallet information.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleTopup = async (amountCents) => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCheckoutLoading(true);
    setErrorMsg('');
    try {
      const { url } = await stripeService.createCheckout(amountCents);
      window.location.href = url;
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
        className={classes.page}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        {(errorMsg || successMsg || (discount?.hasDiscount && !discount.expired)) && (
          <motion.div className={classes.bannerStack} variants={presets.child}>
            {errorMsg && (
              <div className={classes.errorBanner}>
                <AlertCircle size={16} />
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className={classes.successBanner}>
                <CheckCircle2 size={16} />
                {successMsg}
              </div>
            )}
            {discount?.hasDiscount && !discount.expired && (
              <div className={classes.discountBanner}>
                <Gift size={18} />
                <span>
                  <strong>{discount.percent}% referral discount active!</strong> Your next top-up will be discounted.
                  {discount.expiresAt && ` Expires ${new Date(discount.expiresAt).toLocaleDateString()}.`}
                </span>
              </div>
            )}
          </motion.div>
        )}

        <motion.section className={`glass ${classes.balanceSection}`} variants={presets.child}>
          <div className={classes.sectionTop}>
            <div className={classes.sectionHeader}>
              <div className={classes.iconBox} aria-hidden="true">
                <DollarSign size={20} />
              </div>
              <div className={classes.sectionHeaderText}>
                <h3>Account Balance</h3>
                <p>Your wallet summary and quick top-up actions</p>
              </div>
            </div>
            <button type="button" className={classes.addCreditsBtn} onClick={() => setShowTopupModal(true)}>
              + Add Credits
            </button>
          </div>

          <div className={classes.balanceHero}>
            <div className={classes.balanceAmount}>{formatMoney(balance)}</div>
            {balance < 5000 && (
              <div className={classes.lowBalanceWarning}>
                <AlertCircle size={14} />
                Low balance — add credits to continue taking calls
              </div>
            )}
          </div>

          <motion.div className={classes.statsRow} variants={presets.statsStrip}>
            <StatCard
              label="Credits Added"
              value={formatMoney(totalCreditsAdded)}
              icon={Wallet}
              variants={presets.child}
            />
            <StatCard
              label="Total Spent"
              value={formatMoney(totalSpent)}
              icon={TrendingUp}
              variants={presets.child}
            />
            <StatCard
              label="Last Top-up"
              value={lastTopup ? new Date(lastTopup.createdAt).toLocaleDateString() : 'No top-up yet'}
              icon={Clock}
              variants={presets.child}
              valueClassName={lastTopup ? '' : classes.statValueSmall}
            />
          </motion.div>
        </motion.section>

        <motion.section className={`glass ${classes.historySection}`} variants={presets.child}>
          <div className={classes.sectionTop}>
            <div className={classes.sectionHeader}>
              <div className={classes.iconBox} aria-hidden="true">
                <Clock size={20} />
              </div>
              <div className={classes.sectionHeaderText}>
                <h3>Transaction History</h3>
                <p>Credit additions, call deductions, and balance changes</p>
              </div>
            </div>
            <button
              type="button"
              className={classes.refreshBtn}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? classes.spinner : ''} />
              Refresh
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className={classes.emptyStateBox}>
              <Clock size={34} className={classes.emptyIcon} />
              <p>No transactions yet</p>
              <span>Your credit history will appear here</span>
            </div>
          ) : (
            <div className={`glass ${classes.tableWrap}`}>
              <div className={classes.tableScroll}>
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
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td>{t.description}</td>
                        <td className={t.type === 'credit' ? classes.creditAmt : classes.debitAmt}>
                          {t.type === 'credit' ? '+' : '-'}
                          {formatMoney(Math.abs(t.amountCents))}
                        </td>
                        <td>{formatMoney(t.balanceAfterCents || 0)}</td>
                        <td className={classes.dateCell}>{new Date(t.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.section>
      </motion.div>

      <AddCreditsModal
        isOpen={showTopupModal}
        onClose={() => setShowTopupModal(false)}
        discount={discount}
        checkoutLoading={checkoutLoading}
        onTopup={handleTopup}
      />
    </>
  );
};

export default BillingPage;
