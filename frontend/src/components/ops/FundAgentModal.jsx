import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, DollarSign, ArrowRight, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { fundAgencyAgent } from '../../services/agencyService';
import { dropdownPanelMotion } from '../../motion/appMotion';
import classes from './FundAgentModal.module.css';

const modalOverlay = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function FundAgentModal({ open, onClose, agentId, agentName, agencyId }) {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (open) {
      setAmount('');
      setIsSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    const amountCents = Math.round(parsed * 100);

    try {
      setIsSubmitting(true);
      await fundAgencyAgent(agencyId, agentId, amountCents);
      toast.success(`Successfully funded ${agentName || agentId} with $${parsed.toFixed(2)}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to fund agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={classes.overlay}
        variants={modalOverlay}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className={`glass ${classes.modal}`}
          variants={reduceMotion ? modalOverlay : dropdownPanelMotion}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={classes.header}>
            <div className={classes.headerMain}>
              <div className={classes.iconWrap}>
                <UserPlus size={20} />
              </div>
              <div>
                <h2>Fund Agent</h2>
                <p className={classes.subtitle}>{agentName || agentId}</p>
              </div>
            </div>
            <button type="button" className={classes.closeBtn} onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className={classes.form}>
            <p className={classes.subtitle} style={{ marginBottom: 20 }}>
              Transfer funds from your Agency Wallet to this agent's wallet.
            </p>
            
            <div className={classes.formField}>
              <label>Amount (USD)</label>
              <div className={classes.inputWrapper}>
                <DollarSign size={16} className={classes.inputIcon} />
                <input
                  className={classes.input}
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className={classes.actions}>
              <button type="button" className={classes.cancelBtn} onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className={classes.submitBtn} disabled={isSubmitting || !amount}>
                {isSubmitting ? 'Transferring...' : 'Transfer Funds'} <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
