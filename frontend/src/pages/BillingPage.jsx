import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { DollarSign, Clock, RefreshCw, CheckCircle2, Award, X, AlertCircle } from 'lucide-react';
import classes from './BillingPage.module.css';
import { stripeService } from '../services/stripeService';

const TOPUP_TIERS = [
  { id: 'tier_50', label: '$50', amountCents: 5000 },
  { id: 'tier_100', label: '$100', amountCents: 10000 },
  { id: 'tier_250', label: '$250', amountCents: 25000, popular: true },
  { id: 'tier_500', label: '$500', amountCents: 50000 },
  { id: 'tier_1000', label: '$1,000', amountCents: 100000 },
];

const BillingPage = () => {
  const location = useLocation();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
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
      } else if (params.get('subscription') === 'success') {
        setSuccessMsg('Subscription successful! Your plan is now active.');
      }

      await fetchWallet();
    };

    initBilling();
  }, [location]);

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const data = await stripeService.getWallet();
      setWallet(data);
      setTransactions(data.transactions || []);
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

  const handleSubscribe = async (planId) => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCheckoutLoading(true);
    setErrorMsg('');
    try {
      const { url } = await stripeService.createSubscription(planId);
      window.location.href = url; // Redirect to Stripe Checkout
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setCheckoutLoading(false);
      checkoutInFlightRef.current = false;
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will still receive credits for the current billing cycle.')) return;
    
    setCheckoutLoading(true);
    try {
      await stripeService.cancelSubscription();
      setSuccessMsg('Subscription canceled successfully.');
      await fetchWallet();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const formatMoney = (cents) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return <div className={classes.loadingContainer}><RefreshCw className={classes.spinner} /> Loading billing info...</div>;
  }

  const balance = wallet?.balance || 0;
  const plan = wallet?.plan || 'paygo';

  return (
    <div className={classes.billingPage}>
      {errorMsg && <div className={classes.errorBanner}><AlertCircle size={16}/> {errorMsg}</div>}
      {successMsg && <div className={classes.successBanner}><CheckCircle2 size={16}/> {successMsg}</div>}

      <section className={classes.sectionBox}>
        <div className={classes.sectionTop}>
          <div className={classes.sectionHeader}>
            <h3><DollarSign size={20} className={classes.blueIcon} /> Account Balance</h3>
            <p>Your current credit balance for taking calls</p>
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
          <div className={classes.balanceSubtleStat}>
            <span>Current Mode</span>
            <b>{plan === 'paygo' ? 'Pay-as-you-go' : plan === 'silver' ? 'Silver' : 'Gold'}</b>
          </div>
        </div>
      </section>

      <section className={classes.sectionBox}>
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
      </section>

      <section className={classes.sectionBox}>
         <div className={classes.sectionHeader}>
            <h3><Award size={20} className={classes.goldIcon} /> Subscription Plans</h3>
            <p>Subscribe for weekly credits and lower call rates</p>
         </div>

         <div className={classes.currentPlan}>
            <div className={classes.planBadge}></div>
            <div className={classes.currentPlanMeta}>
              <b>Current Plan: {plan === 'silver' ? 'Silver' : plan === 'gold' ? 'Gold' : 'Pay-as-you-go'}</b>
              <span>{plan === 'paygo' ? '$55 per call • No commitment' : plan === 'silver' ? '$500/week • $50/call' : '$1000/week • $45/call'}</span>
            </div>
            {plan !== 'paygo' && (
               <button className={classes.cancelBtn} onClick={handleCancelSubscription} disabled={checkoutLoading}>Cancel subscription</button>
            )}
         </div>

         <div className={classes.planList}>
            <div className={`${classes.planCard} ${plan === 'silver' ? classes.activePlanCard : ''}`}>
               <div className={classes.planTitleRow}>
                  <div className={classes.planNameGroup}>
                     <Award size={24} className={classes.silverIcon} />
                     <div>
                        <h4>Silver Plan</h4>
                        <p>$500/week • Auto-renews</p>
                     </div>
                  </div>
                  {plan !== 'silver' && <button className={classes.subscribeBtn} disabled={checkoutLoading} onClick={() => handleSubscribe('silver')}>Subscribe</button>}
                  {plan === 'silver' && <span className={classes.activeBadge}><CheckCircle2 size={14}/> Active</span>}
               </div>
               <div className={classes.planFeatures}>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $50/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> Save $5/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $500 weekly credits</span>
               </div>
            </div>

            <div className={`${classes.planCard} ${classes.bestValue} ${plan === 'gold' ? classes.activePlanCard : ''}`}>
               <div className={classes.planTitleRow}>
                  <div className={classes.planNameGroup}>
                     <Award size={24} className={classes.goldIcon} />
                     <div>
                        <h4>Gold Plan</h4>
                        <p>$1000/week • Auto-renews</p>
                     </div>
                  </div>
                  {plan !== 'gold' && <button className={classes.subscribeBtn} disabled={checkoutLoading} onClick={() => handleSubscribe('gold')}>Subscribe</button>}
                  {plan === 'gold' && <span className={classes.activeBadge}><CheckCircle2 size={14}/> Active</span>}
               </div>
               <div className={classes.planFeatures}>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $45/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> Save $10/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $1000 weekly credits</span>
               </div>
            </div>
         </div>
      </section>

      {showTopupModal && (
        <div className={classes.modalOverlay} onClick={() => setShowTopupModal(false)}>
          <div className={classes.modalBox} onClick={e => e.stopPropagation()}>
            <div className={classes.modalHeader}>
              <h3>Add Call Credits</h3>
              <button className={classes.closeBtn} onClick={() => setShowTopupModal(false)}><X size={18}/></button>
            </div>
            <p className={classes.modalSub}>Select a top-up amount. Credits will be instantly added to your wallet.</p>
            
            <div className={classes.tiersGrid}>
              {TOPUP_TIERS.map(tier => (
                <button 
                  key={tier.id} 
                  className={`${classes.tierBtn} ${tier.popular ? classes.tierPopular : ''}`}
                  onClick={() => handleTopup(tier.amountCents)}
                  disabled={checkoutLoading}
                >
                  {tier.popular && <span className={classes.popularBadge}>Most Popular</span>}
                  <span className={classes.tierAmount}>{tier.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
