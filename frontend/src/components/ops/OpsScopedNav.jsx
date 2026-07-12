import { Link } from 'react-router-dom';
import { ArrowLeft, Settings2 } from 'lucide-react';
import shared from './opsShared.module.css';

/* eslint-disable react/prop-types */
export function OpsSettingsLink({ settingsHref, className, label = 'Settings' }) {
  if (!settingsHref) return null;
  return (
    <Link to={settingsHref} className={className || shared.settingsBtn}>
      <Settings2 size={16} />
      {label}
    </Link>
  );
}

export default function OpsScopedNav({
  backHref,
  backLabel = 'Back',
  settingsHref,
  showBack = true,
}) {
  if (!showBack && !settingsHref) return null;
  if (!showBack && settingsHref) {
    return (
      <div className={shared.adminNav}>
        <span />
        <OpsSettingsLink settingsHref={settingsHref} />
      </div>
    );
  }
  if (!backHref && !settingsHref) return null;

  return (
    <div className={shared.adminNav}>
      {backHref && showBack ? (
        <Link to={backHref} className={shared.backLink}>
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      ) : <span />}
      <OpsSettingsLink settingsHref={settingsHref} />
    </div>
  );
}
