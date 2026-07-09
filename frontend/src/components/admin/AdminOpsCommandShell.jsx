import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Settings2, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSubtlePageMotion } from '../../hooks/useSubtlePageMotion';
import classes from './AdminOpsCommandShell.module.css';

function statusClass(variant) {
  if (variant === 'suspended') return classes.statusSuspended;
  if (variant === 'active') return classes.statusActive;
  return classes.statusNeutral;
}

/* eslint-disable react/prop-types */
export default function AdminOpsCommandShell({
  title,
  description,
  icon: Icon,
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
  settingsHref,
  settingsLabel = 'Settings',
  settingsRoute,
  emptyTenantsTitle = 'No tenants yet',
  emptyTenantsBody,
  emptySelectionTitle = 'Select a tenant',
  emptySelectionBody = 'Choose from the list on the left to open its performance dashboard.',
  autoSelectSingle = true,
  children,
}) {
  const presets = useSubtlePageMotion();
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

  const activeTenant = useMemo(
    () => tenants.find((t) => getTenantId(t) === activeId) || null,
    [tenants, activeId, getTenantId],
  );

  useEffect(() => {
    if (!autoSelectSingle || activeId || loading || tenants.length !== 1) return;
    onSelect(getTenantId(tenants[0]));
  }, [autoSelectSingle, activeId, loading, tenants, onSelect, getTenantId]);

  const contextChips = useMemo(() => {
    if (!activeTenant) return [];
    const chips = [];
    const count = getAgentCount?.(activeTenant);
    if (count != null) chips.push(`${count} agent${count !== 1 ? 's' : ''}`);
    const extra = getExtraMeta?.(activeTenant);
    if (extra) chips.push(extra);
    const status = getStatusPill?.(activeTenant);
    if (status?.label) chips.push(status.label);
    return chips;
  }, [activeTenant, getAgentCount, getExtraMeta, getStatusPill]);

  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        {Icon ? (
          <div className={classes.iconBox} aria-hidden="true">
            <Icon size={22} />
          </div>
        ) : null}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </motion.div>

      {metrics.length > 0 ? (
        <motion.div className={classes.kpiGrid} variants={presets.statsStrip}>
          {metrics.map((metric) => {
            const MetricIcon = metric.icon || Icon;
            return (
              <motion.div
                key={metric.label}
                className={`glass ${classes.kpiCard}`}
                variants={presets.child}
              >
                <div className={classes.kpiTop}>
                  {MetricIcon ? (
                    <div className={classes.kpiIconBox} aria-hidden="true">
                      <MetricIcon size={18} />
                    </div>
                  ) : <span className={classes.kpiTopSpacer} />}
                </div>
                <div className={classes.kpiBody}>
                  <p className={classes.kpiLabel}>{metric.label}</p>
                  <p className={classes.kpiValue}>
                    {loading ? <span className={classes.kpiSkeleton} /> : metric.value}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : null}

      <div className={classes.workspace}>
        <motion.aside className={`glass ${classes.rail}`} variants={presets.child}>
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
            <div className={classes.tenantList} role="tablist" aria-label="Tenants">
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
        </motion.aside>

        <div className={classes.main}>
          {activeTenant && settingsHref ? (
            <motion.div className={`glass ${classes.contextBar}`} variants={presets.child}>
              <div>
                <h3 className={classes.contextTitle}>{getPrimaryLabel(activeTenant)}</h3>
                {contextChips.length > 0 ? (
                  <div className={classes.chipRow}>
                    {contextChips.map((chip) => (
                      <span key={chip} className={classes.chip}>{chip}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <Link to={settingsHref(activeId)} className={classes.contextSettings}>
                <Settings2 size={16} />
                {settingsLabel}
              </Link>
            </motion.div>
          ) : null}

          {!activeId ? (
            <motion.div className={`glass ${classes.welcome}`} variants={presets.child}>
              <div className={classes.welcomeIcon} aria-hidden="true">
                {Icon ? <Icon size={24} /> : null}
              </div>
              <h3>{emptySelectionTitle}</h3>
              <p>{emptySelectionBody}</p>
              {tenants.length > 0 ? (
                <span className={classes.welcomeHint}>
                  <ArrowLeft size={14} />
                  Pick from the directory
                </span>
              ) : null}
            </motion.div>
          ) : (
            <div className={classes.embedArea}>{children}</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
