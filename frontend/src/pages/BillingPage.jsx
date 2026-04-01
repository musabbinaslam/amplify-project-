import React from 'react';
import { DollarSign, Clock, RefreshCw, CheckCircle2, Award } from 'lucide-react';
import classes from './BillingPage.module.css';

const BillingPage = () => {
  return (
    <div className={classes.billingPage}>
      <div className={classes.sectionBox}>
        <div className={classes.sectionHeader}>
          <h3><DollarSign size={20} className={classes.blueIcon} /> Account Balance</h3>
          <p>Your current credit balance for taking calls</p>
        </div>
        
        <div className={classes.balanceRow}>
          <div>
            <div className={classes.balanceAmount}>$0.00</div>
            <div className={classes.lowBalanceWarning}>
              <AlertCircle size={14} /> Low balance - add credits to continue taking calls
            </div>
          </div>
          <button className={classes.addCreditsBtn}>+ Add Credits</button>
        </div>
      </div>

      <div className={classes.sectionBox}>
        <div className={classes.transHeader}>
          <div>
            <h3><Clock size={20} /> Transaction History</h3>
            <p>Credit additions, call deductions, and balance changes</p>
          </div>
          <button className={classes.refreshBtn}><RefreshCw size={14} /> Refresh</button>
        </div>
        
        <div className={classes.emptyStateBox}>
          <Clock size={48} className={classes.emptyIcon} />
          <p>No transactions yet</p>
          <span>Your credit history will appear here</span>
        </div>
      </div>

      <div className={classes.sectionBox}>
         <div className={classes.sectionHeader}>
            <h3><Award size={20} className={classes.goldIcon} /> Subscription Plans</h3>
            <p>Subscribe for weekly credits and lower call rates</p>
         </div>

         <div className={classes.currentPlan}>
            <div className={classes.planBadge}></div>
            <b>Current: Pay-as-you-go</b>
            <span>$55 per call • No commitment</span>
         </div>

         <div className={classes.planList}>
            <div className={classes.planCard}>
               <div className={classes.planTitleRow}>
                  <div className={classes.planNameGroup}>
                     <Award size={24} className={classes.silverIcon} />
                     <div>
                        <h4>Silver Plan</h4>
                        <p>$500/week • Auto-renews</p>
                     </div>
                  </div>
                  <button className={classes.subscribeBtn}>Subscribe</button>
               </div>
               <div className={classes.planFeatures}>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $50/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> Save $5/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $500 weekly credits</span>
               </div>
            </div>

            <div className={classes.planCard}>
               <div className={classes.planTitleRow}>
                  <div className={classes.planNameGroup}>
                     <Award size={24} className={classes.goldIcon} />
                     <div>
                        <h4>Gold Plan</h4>
                        <p>$1000/week • Auto-renews</p>
                     </div>
                  </div>
                  <button className={classes.subscribeBtn}>Subscribe</button>
               </div>
               <div className={classes.planFeatures}>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $45/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> Save $10/call</span>
                  <span><CheckCircle2 size={14} className={classes.greenIcon} /> $1000 weekly credits</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

const AlertCircle = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);

export default BillingPage;
