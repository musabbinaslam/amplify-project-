import { useMemo, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { formatAgentDisplayName, getAgentLiveSubtext, statusMeta } from './opsUtils';
import shared from './opsShared.module.css';
import classes from './OpsLiveAgents.module.css';

const SEARCH_THRESHOLD = 6;
const LIST_MAX_HEIGHT = 320;
const LIST_MAX_HEIGHT_COMPACT = 260;

function sortAgents(agents) {
  return [...agents].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    const nameA = formatAgentDisplayName(a).label.toLowerCase();
    const nameB = formatAgentDisplayName(b).label.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function filterAgents(agents, query, onlineOnly) {
  const q = query.trim().toLowerCase();
  return agents.filter((agent) => {
    if (onlineOnly && !agent.online) return false;
    if (!q) return true;
    const { label, title } = formatAgentDisplayName(agent);
    return [label, title, agent.id, agent.agentName, agent.email]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
}

export default function OpsLiveAgentGrid({
  agents,
  liveCallByAgent,
  selectedAgent,
  onSelectAgent,
  loading,
  emptyMessage = 'No agents yet.',
  title = 'Live Operations',
  showCount = true,
  compact = false,
}) {
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const onlineCount = agents.filter((a) => a.online).length;
  const showSearch = agents.length >= SEARCH_THRESHOLD;

  const visibleAgents = useMemo(
    () => sortAgents(filterAgents(agents, search, onlineOnly)),
    [agents, search, onlineOnly],
  );

  const listStyle = {
    maxHeight: compact ? LIST_MAX_HEIGHT_COMPACT : LIST_MAX_HEIGHT,
  };

  return (
    <div className={compact ? classes.wrapCompact : classes.wrap}>
      <div className={shared.sectionHeader}>
        <h3 className={classes.sectionTitle}>
          <Activity size={18} aria-hidden="true" />
          {title}
        </h3>
        {showCount ? (
          <span className={classes.onlineMeta}>
            <span className={classes.onlineMetaValue}>{onlineCount}</span>
            {' of '}
            <span className={classes.onlineMetaValue}>{agents.length}</span>
            {' online'}
          </span>
        ) : null}
      </div>

      {showSearch ? (
        <div className={classes.toolbar}>
          <div className={shared.searchWrap}>
            <Search size={15} className={shared.searchIcon} aria-hidden="true" />
            <input
              className={shared.searchInput}
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search live agents"
            />
          </div>
          {onlineCount > 0 && onlineCount < agents.length ? (
            <button
              type="button"
              className={`${shared.filterBtn} ${onlineOnly ? shared.filterBtnActive : ''}`}
              onClick={() => setOnlineOnly((v) => !v)}
            >
              Online only
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && agents.length === 0 ? (
        <div className={shared.skeletonList}>
          <div className={shared.skeletonRow} />
          <div className={shared.skeletonRow} />
        </div>
      ) : agents.length === 0 ? (
        <p className={classes.emptyState}>{emptyMessage}</p>
      ) : visibleAgents.length === 0 ? (
        <p className={classes.emptyState}>No agents match your filters.</p>
      ) : (
        <>
          <div
            className={classes.list}
            style={listStyle}
            role="list"
            aria-label={title}
          >
            {visibleAgents.map((agent) => {
              const live = liveCallByAgent.get(agent.id);
              const meta = statusMeta(agent.status, agent.online, shared);
              const isSelected = selectedAgent === agent.id;
              const { label, title: nameTitle } = formatAgentDisplayName(agent);
              const subtext = getAgentLiveSubtext(agent, live);

              return (
                <button
                  key={agent.id}
                  type="button"
                  role="listitem"
                  className={`${classes.row} ${isSelected ? classes.rowActive : ''}`}
                  onClick={() => onSelectAgent(agent.id)}
                  aria-pressed={isSelected}
                  title={nameTitle}
                >
                  <span className={classes.rowMain}>
                    <span className={`${shared.statusDot} ${meta.cls}`} aria-hidden="true" />
                    <span className={classes.rowName}>{label}</span>
                  </span>
                  <span className={`${classes.rowStatus} ${meta.cls}`}>{meta.label}</span>
                  {subtext && !compact ? (
                    <span className={classes.rowMeta}>{subtext}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {visibleAgents.length < agents.length ? (
            <p className={classes.listFoot}>
              Showing {visibleAgents.length} of {agents.length} agents
            </p>
          ) : agents.length > 12 ? (
            <p className={classes.listFoot}>Scroll for more agents</p>
          ) : null}
        </>
      )}
    </div>
  );
}
