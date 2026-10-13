/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Link2, RefreshCw, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAgencyInvite,
  rotateAgencyInvite,
  getAdminAgencyInvite,
  rotateAdminAgencyInvite,
} from '../../services/agencyService';
import classes from './AgencyInviteCard.module.css';

export default function AgencyInviteCard({
  agencyId,
  adminMode = false,
  /** `strip` = dashboard; `panel` = admin detail */
  variant = 'strip',
}) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = adminMode
        ? await getAdminAgencyInvite(agencyId)
        : await getAgencyInvite(agencyId ? { agencyId } : undefined);
      setInvite(out);
    } catch (err) {
      setInvite(null);
      if (err?.status !== 403) {
        console.warn('[AgencyInvite]', err?.message || err);
      }
    } finally {
      setLoading(false);
    }
  }, [agencyId, adminMode]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1400);
      toast.success(key === 'link' ? 'Invite link copied' : 'Invite code copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const rotate = async () => {
    if (!window.confirm('Rotate invite code? The old link and code will stop working.')) return;
    setRotating(true);
    try {
      const out = adminMode
        ? await rotateAdminAgencyInvite(agencyId)
        : await rotateAgencyInvite(agencyId ? { agencyId } : undefined);
      setInvite((prev) => ({ ...prev, ...out }));
      toast.success('Invite code rotated');
    } catch (err) {
      toast.error(err?.message || 'Failed to rotate');
    } finally {
      setRotating(false);
    }
  };

  const shell = variant === 'panel' ? classes.panel : classes.strip;
  const share = invite?.shareUrl || invite?.joinUrl || '';

  if (loading) {
    return (
      <div className={`glass ${shell}`}>
        <p className={classes.muted}>Loading invite…</p>
      </div>
    );
  }

  if (!invite?.code) {
    return (
      <div className={`glass ${shell}`}>
        <div className={classes.header}>
          <span className={classes.iconWrap} aria-hidden="true">
            <UserPlus size={18} />
          </span>
          <div className={classes.lead}>
            <p className={classes.title}>Invite agents</p>
            <p className={classes.hint}>Available after the agency is approved.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass ${shell}`}>
      <div className={classes.header}>
        <span className={classes.iconWrap} aria-hidden="true">
          <UserPlus size={18} />
        </span>
        <div className={classes.lead}>
          <p className={classes.title}>Invite agents</p>
          <p className={classes.hint}>Share the link — agents join your agency on signup.</p>
        </div>
      </div>

      <div className={classes.actions}>
        <button
          type="button"
          className={classes.primaryBtn}
          onClick={() => copy(share, 'link')}
        >
          <span className={classes.iconSwap} data-state={copied === 'link' ? 'b' : 'a'}>
            <span className={classes.iconSlot} data-icon="a"><Link2 size={15} /></span>
            <span className={classes.iconSlot} data-icon="b"><Check size={15} /></span>
          </span>
          {copied === 'link' ? 'Link copied' : 'Copy invite link'}
        </button>

        <div className={classes.metaRow}>
          <button
            type="button"
            className={classes.codeChip}
            onClick={() => copy(invite.code, 'code')}
            title="Copy invite code"
            aria-label="Copy invite code"
          >
            <span className={classes.code}>{invite.code}</span>
            <span className={classes.iconSwap} data-state={copied === 'code' ? 'b' : 'a'}>
              <span className={classes.iconSlot} data-icon="a"><Copy size={13} /></span>
              <span className={classes.iconSlot} data-icon="b"><Check size={13} /></span>
            </span>
          </button>

          <button
            type="button"
            className={classes.ghostBtn}
            onClick={rotate}
            disabled={rotating}
          >
            <RefreshCw size={13} className={rotating ? classes.spin : ''} />
            {rotating ? 'Rotating…' : 'Rotate code'}
          </button>
        </div>
      </div>
    </div>
  );
}
