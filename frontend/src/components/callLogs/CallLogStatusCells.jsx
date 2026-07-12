import { DollarSign } from 'lucide-react';
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

export function CallLogDispositionBadge({ log }) {
  const mapped = dispositionLabel(log);
  if (!mapped) {
    return <span className={classes.scoreDash}>—</span>;
  }

  return (
    <span className={`${classes.dispBadge} ${dispositionClass(mapped.tone)}`}>
      {mapped.label}
    </span>
  );
}
