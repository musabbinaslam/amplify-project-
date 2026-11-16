import { DollarSign, ChevronDown } from 'lucide-react';
import { DISPOSITIONS, getDispositionMeta } from '../../constants/dispositions';
import classes from '../../pages/CallLogsPage.module.css';

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

export function CallLogDispositionBadge({ log, editable, onUpdate, loading }) {
  const mapped = getDispositionMeta(log);
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
          {DISPOSITIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
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
