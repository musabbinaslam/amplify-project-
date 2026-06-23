import { useEffect } from 'react';
import { X, DollarSign, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import classes from './AddCreditsModal.module.css';

const TOPUP_TIERS = [
  { id: 'tier_50', label: '$50', amountCents: 5000 },
  { id: 'tier_100', label: '$100', amountCents: 10000 },
  { id: 'tier_250', label: '$250', amountCents: 25000, popular: true },
  { id: 'tier_500', label: '$500', amountCents: 50000 },
  { id: 'tier_1000', label: '$1,000', amountCents: 100000 },
];

/* eslint-disable react/prop-types -- modal props are simple and stable */
const AddCreditsModal = ({ isOpen, onClose, discount, checkoutLoading, onTopup }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } };

  const hasDisc = discount?.hasDiscount && !discount.expired;

  return (
    <div
      className={classes.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="addCreditsTitle"
    >
      <motion.div
        className={`glass ${classes.modal}`}
        onClick={(e) => e.stopPropagation()}
        {...panelMotion}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={classes.header}>
          <div className={classes.headerMain}>
            <div className={classes.iconWrap} aria-hidden="true">
              <DollarSign size={18} />
            </div>
            <div>
              <h2 id="addCreditsTitle">Add Call Credits</h2>
              <p className={classes.subtitle}>Select a top-up amount. Credits are added instantly.</p>
            </div>
          </div>
          <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {hasDisc && (
          <p className={classes.discountNote}>
            {discount.percent}% referral discount applied to prices below.
          </p>
        )}

        <div className={classes.tiersGrid}>
          {TOPUP_TIERS.map((tier) => {
            const discountedCents = hasDisc
              ? Math.round(tier.amountCents * (1 - discount.percent / 100))
              : tier.amountCents;

            return (
              <button
                key={tier.id}
                type="button"
                className={`${classes.tierBtn} ${tier.popular ? classes.tierPopular : ''}`}
                onClick={() => onTopup(tier.amountCents)}
                disabled={checkoutLoading}
              >
                {tier.popular && <span className={classes.popularBadge}>Most Popular</span>}
                {checkoutLoading ? (
                  <Loader2 size={22} className={classes.spinner} />
                ) : hasDisc ? (
                  <span className={classes.tierAmount}>
                    <span className={classes.tierOriginal}>{tier.label}</span>
                    ${(discountedCents / 100).toFixed(0)}
                  </span>
                ) : (
                  <span className={classes.tierAmount}>{tier.label}</span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default AddCreditsModal;
