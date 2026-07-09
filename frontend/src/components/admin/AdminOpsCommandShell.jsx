import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Settings2 } from 'lucide-react';
import classes from './AdminOpsCommandShell.module.css';

const DIRECTORY_VISIBLE_CAP = 7;

function statusClass(variant) {
  if (variant === 'suspended') return classes.statusSuspended;
  if (variant === 'active') return classes.statusActive;
  return classes.statusNeutral;
}

/* eslint-disable react/prop-types */
export default function AdminOpsCommandShell({
  metrics = [],
  loading = false,
  tenants = [],
  activeId = '',
  onSelect,
  getTenantId,
  getPrimaryLabel,
  getSecondaryLabel,
  getAgentCount,
  getStatusPill,
  getExtraMeta,
  getSearchText,
  settingsRoute,
  settingsLabel = 'Settings',
  emptyTenantsTitle = 'No tenants yet',
  emptyTenantsBody,
  emptySelectionTitle = 'Select a tenant',
  emptySelectionBody = 'Choose from the directory to open its dashboard.',
  autoSelectSingle = true,
  children,
}) {
  const [search, setSearch] = useState('');

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant) => {
      const blob = getSearchText
        ? getSearchText(tenant)
        : [
          getPrimaryLabel(tenant),
          getSecondaryLabel?.(tenant),
          getExtraMeta?.(tenant),
        ].filter(Boolean).join(' ');
      return String(blob).toLowerCase().includes(q);
    });
  }, [tenants, search, getSearchText, getPrimaryLabel, getSecondaryLabel, getExtraMeta]);

  const visibleListRows = Math.min(filteredTenants.length, DIRECTORY_VISIBLE_CAP);
  const listScrollable = filteredTenants.length > DIRECTORY_VISIBLE_CAP;

  useEffect(() => {
    if (!autoSelectSingle || activeId || loading || tenants.length !== 1) return;
    onSelect(getTenantId(tenants[0]));
  }, [autoSelectSingle, activeId, loading, tenants, onSelect, getTenantId]);

  return (
    <div className={classes.page}>
      {metrics.length > 0 ? (
        <div className={`glass ${classes.platformStrip}`} aria-label="Platform summary">
          {metrics.map((metric, index) => (
            <span key={metric.label} className={classes.platformMetric}>
              {index > 0 ? <span className={classes.platformSep} aria-hidden="true">·</span> : null}
              <span className={classes.platformValue}>
                {loading ? '—' : metric.value}
              </span>
              <span className={classes.platformLabel}>{metric.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className={classes.workspace}>
        <aside className={classes.rail} aria-label="Tenant directory">
          <div className={`glass ${classes.railPanel}`}>
            <div className={classes.railHead}>
              <p className={classes.railTitle}>Directory</p>
              <p className={classes.railCount}>
                {tenants.length} total
                {search.trim() && filteredTenants.length !== tenants.length
                  ? ` · ${filteredTenants.length} shown`
                  : ''}
              </p>
            </div>

            <div className={classes.searchWrap}>
              <Search size={15} className={classes.searchIcon} />
              <input
                className={classes.searchInput}
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search tenants"
              />
            </div>

            {!tenants.length ? (
              <div className={classes.railEmpty}>
                <h4>{emptyTenantsTitle}</h4>
                {emptyTenantsBody ? <p>{emptyTenantsBody}</p> : null}
                {settingsRoute ? (
                  <Link to={settingsRoute} className={classes.settingsLink}>
                    <Settings2 size={15} />
                    {settingsLabel}
                  </Link>
                ) : null}
              </div>
            ) : (
              <div
                className={`${classes.tenantList} ${listScrollable ? classes.tenantListScrollable : ''}`}
                role="tablist"
                aria-label="Tenants"
                style={{ '--tenant-visible-rows': visibleListRows }}
              >
                {filteredTenants.map((tenant) => {
                  const id = getTenantId(tenant);
                  const isActive = activeId === id;
                  const status = getStatusPill?.(tenant);
                  const count = getAgentCount?.(tenant);
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`${classes.tenantRow} ${isActive ? classes.tenantRowActive : ''}`}
                      onClick={() => onSelect(id)}
                    >
                      <div className={classes.tenantMain}>
                        <span className={classes.tenantName}>{getPrimaryLabel(tenant)}</span>
                        {getSecondaryLabel?.(tenant) ? (
                          <span className={classes.tenantSub}>{getSecondaryLabel(tenant)}</span>
                        ) : null}
                      </div>
                      <div className={classes.tenantAside}>
                        {count != null ? (
                          <span className={classes.countPill}>{count}</span>
                        ) : null}
                        {status?.label ? (
                          <span className={statusClass(status.variant)}>{status.label}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className={`glass ${classes.detail}`}>
          <AnimatePresence mode="wait">
            {!activeId ? (
              <motion.div
                key="welcome"
                className={classes.welcome}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <h3>{emptySelectionTitle}</h3>
                <p>{emptySelectionBody}</p>
              </motion.div>
            ) : (
              <motion.div
                key={activeId}
                className={classes.embedArea}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
