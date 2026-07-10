import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Search } from 'lucide-react';
import classes from './AdminAgencySettingsShell.module.css';

const DIRECTORY_VISIBLE_CAP = 7;

function statusClass(variant) {
  if (variant === 'suspended') return classes.statusSuspended;
  if (variant === 'active') return classes.statusActive;
  return classes.statusNeutral;
}

/* eslint-disable react/prop-types */
export default function AdminAgencySettingsShell({
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
  getSearchText,
  railCreate,
  createPanelTitle = 'New agency',
  createPanelHint = 'Create a tenant, then configure it on the right',
  searchPlaceholder = 'Search…',
  sidebarAriaLabel = 'Settings sidebar',
  directoryListAriaLabel = 'Directory',
  settingsSectionsAriaLabel = 'Settings sections',
  detailHeader,
  tabs = [],
  activeTab = '',
  onTabChange,
  emptyTenantsTitle = 'No agencies yet',
  emptyTenantsBody,
  emptySelectionTitle = 'Select an agency',
  emptySelectionBody = 'Choose from the directory to manage members, campaigns, and DIDs.',
  backTo = '/app/admin',
  backLabel = 'Back to Admin',
  category,
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
        ].filter(Boolean).join(' ');
      return String(blob).toLowerCase().includes(q);
    });
  }, [tenants, search, getSearchText, getPrimaryLabel, getSecondaryLabel]);

  const visibleListRows = Math.min(filteredTenants.length, DIRECTORY_VISIBLE_CAP);
  const listScrollable = filteredTenants.length > DIRECTORY_VISIBLE_CAP;

  return (
    <div className={classes.page}>
      {backTo ? (
        <div className={classes.topBar}>
          <Link to={backTo} className={classes.backLink}>
            <ArrowLeft size={16} />
            {backLabel}
          </Link>
          {category ? <span className={classes.category}>{category}</span> : null}
        </div>
      ) : null}

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
        <aside className={classes.rail} aria-label={sidebarAriaLabel}>
          {railCreate ? (
            <div className={`glass ${classes.createPanel}`}>
              <div className={classes.railHead}>
                <p className={classes.railTitle}>{createPanelTitle}</p>
                <p className={classes.railCount}>{createPanelHint}</p>
              </div>
              {railCreate}
            </div>
          ) : null}

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
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={searchPlaceholder}
              />
            </div>

            {!tenants.length ? (
              <div className={classes.railEmpty}>
                <h4>{emptyTenantsTitle}</h4>
                {emptyTenantsBody ? <p>{emptyTenantsBody}</p> : null}
              </div>
            ) : (
              <div
                className={`${classes.tenantList} ${listScrollable ? classes.tenantListScrollable : ''}`}
                role="tablist"
                aria-label={directoryListAriaLabel}
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

        <div className={`glass ${classes.detail} ${activeId ? classes.detailActive : ''}`}>
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
                className={classes.settingsWorkspace}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {detailHeader ? (
                  <div className={classes.contextHeader}>
                    {detailHeader}
                  </div>
                ) : null}

                {tabs.length > 0 ? (
                  <div className={classes.tabBar} role="tablist" aria-label={settingsSectionsAriaLabel}>
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`${classes.tab} ${activeTab === tab.id ? classes.tabActive : ''}`}
                        onClick={() => onTabChange?.(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className={classes.tabPanel} role="tabpanel">
                  {children}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
