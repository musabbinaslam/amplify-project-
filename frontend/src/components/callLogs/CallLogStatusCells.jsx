import { DollarSign, ChevronDown } from 'lucide-react';
import classes from '../../pages/CallLogsPage.module.css';

function dispositionLabel(log) {
  const disposition = log?.disposition;
  if (disposition === 'callback') return { label: 'Call back', tone: 'callback' };
  if (disposition === 'not_interested') return { label: 'Not Interested', tone: 'negative' };
  if (disposition === 'busy') return { label: 'Busy', tone: 'negative' };
  if (disposition === 'dead_air') return { label: 'Dead Air', tone: 'negative' };
  if (disposition === 'policy_closed') return { label: 'Policy Closed', tone: 'policy' };
  if (disposition === 'sold' || log?.isBillable) return { label: 'Sold', tone: 'sold' };
  return null;
}

function dispositionClass(tone) {
  if (tone === 'sold') return classes.dispSold;
  if (tone === 'callback') return classes.dispAnswered;
  if (tone === 'policy') return classes.dispPolicyClosed;
  return classes.dispMissed;
}

const statusBase = `${classes.dispBadge} ${classes.dispStatusBadge}`;

export function CallLogStatusBadge({ log }) {
  const saleSuffix = log?.saleAmount ? ` ($${Number(log.saleAmount).toFixed(0)})` : '';

  if (log?.isBillable) {
    return (
      <span className={`${statusBase} ${classes.dispSold}`}>
        <DollarSign size={12} aria-hidden="true" />
        Billable{saleSuffix}
      </span>
    );
  }

  if (log?.status === 'missed') {
    return <span className={`${statusBase} ${classes.dispMissed}`}>Missed</span>;
  }

  return <span className={`${statusBase} ${classes.dispAnswered}`}>Answered</span>;
}

export const DISPOSITION_OPTIONS = [
  { value: 'callback', label: 'Call back', tone: 'callback' },
  { value: 'not_interested', label: 'Not Interested', tone: 'negative' },
  { value: 'busy', label: 'Busy', tone: 'negative' },
  { value: 'dead_air', label: 'Dead Air', tone: 'negative' },
  { value: 'policy_closed', label: 'Policy Closed', tone: 'policy' },
];

export function CallLogDispositionBadge({ log, editable, onUpdate, loading }) {
  const mapped = dispositionLabel(log);
  if (!mapped) {
    return <span className={classes.scoreDash}>—</span>;
  }

  if (editable) {
    const currentVal = log?.disposition || '';
    const baseClass = mapped ? dispositionClass(mapped.tone) : classes.dispMissed;
    
    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <span 
          className={`${classes.dispBadge} ${baseClass}`}
          style={{ paddingRight: '0.4rem' }}
        >
          {mapped ? mapped.label : 'Select...'}
          <ChevronDown size={12} style={{ opacity: 0.5, marginLeft: '2px' }} />
        </span>
        <select
          value={currentVal}
          disabled={loading}
          onChange={(e) => onUpdate && onUpdate(log.id, e.target.value)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          <option value="" disabled>Select disposition...</option>
          {DISPOSITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <span className={`${classes.dispBadge} ${dispositionClass(mapped.tone)}`}>
      {mapped.label}
    </span>
  );
}
