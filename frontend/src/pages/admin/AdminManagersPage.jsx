import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageBreadcrumbs } from '../../hooks/usePageBreadcrumbs';
import {
  UserCog,
  Plus,
  Users,
  UserPlus,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  UserMinus,
  LayoutDashboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listAdminManagers,
  getAdminManager,
  listAdminUsers,
  patchManagerSettings,
} from '../../services/adminService';
import AdminAgencySettingsShell from '../../components/admin/AdminAgencySettingsShell';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import { AdminCallTrendChart } from '../../components/admin/AdminCharts';
import PageLoader from '../../components/ui/PageLoader';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminManagersPage.module.css';

const AGENTS_VISIBLE_CAP = 5;
const PICKER_PAGE_SIZE = 12;
const MANAGER_INELIGIBLE_ROLES = new Set(['admin', 'qa', 'manager']);

const SETTINGS_TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'performance', label: 'Performance' },
  { id: 'agents', label: 'Agents' },
];

function defaultRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - 6);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

function filterByQuery(list, query, extraFields = []) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const base = [row.name, row.email, row.uid, ...extraFields.map((f) => row[f])];
    return base.some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function isUidPlaceholderName(user) {
  const name = String(user?.name || '').trim();
  const uid = String(user?.uid || '').trim();
  return !name || name === uid;
}

function pickerDisplayName(user) {
  const email = String(user?.email || '').trim();
  if (!isUidPlaceholderName(user)) return String(user.name).trim();
  if (email) return email;
  return 'Unnamed user';
}

function pickerDisplayMeta(user) {
  const email = String(user?.email || '').trim();
  if (!isUidPlaceholderName(user) && email) return email;
  return null;
}

function filterByNameEmail(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const name = isUidPlaceholderName(row) ? '' : String(row.name || '');
    return [name, row.email].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function hasPickerIdentity(user) {
  if (user?.authMissing) return false;
  const email = String(user?.email || '').trim();
  if (email) return true;
  return !isUidPlaceholderName(user);
}

function paginate(list, page, pageSize) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    totalPages,
    safePage,
    total,
    rangeStart: total ? start + 1 : 0,
    rangeEnd: Math.min(safePage * pageSize, total),
  };
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function TablePagination({ page, totalPages, rangeStart, rangeEnd, total, onPageChange }) {
  if (!total) return null;
  return (
    <div className={classes.pagination}>
      <span className={classes.pageMeta}>
        {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className={classes.pageBtns}>
        <button
          type="button"
          className={classes.pageBtn}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className={classes.pageIndicator}>Page {page} of {totalPages}</span>
        <button
          type="button"
          className={classes.pageBtn}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MemberCell({ member }) {
  const displayName = pickerDisplayName(member);
  const meta = pickerDisplayMeta(member);
  return (
    <div className={classes.memberCell}>
      <span className={classes.memberName}>{displayName}</span>
      {meta ? <span className={classes.memberMeta}>{meta}</span> : null}
    </div>
  );
}

function CreateTeamUserModal({
  open,
  onClose,
  users,
  search,
  pickerPage,
  onSearchChange,
  onPickerPageChange,
  onSelect,
}) {
  if (!open) return null;

  const filtered = filterByNameEmail(users, search);
  const picker = paginate(filtered, pickerPage, PICKER_PAGE_SIZE);

  return (
    <div className={shared.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="create-team-user-title">
      <div className={`glass ${shared.modalBox} ${classes.assignModal}`}>
        <div className={shared.modalHeader}>
          <h3 id="create-team-user-title">Choose user</h3>
          <button type="button" className={shared.modalCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={shared.modalSub}>
          Select a platform agent to promote as a manager. Admins, QA, existing managers,
          and agency users are not shown.
        </p>

        <div className={classes.modalSearchRow}>
          <Search size={16} className={classes.searchIcon} aria-hidden="true" />
          <input
            className={`${shared.searchInput} ${classes.modalSearch}`}
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>

        <div className={classes.userPickerList}>
          {picker.items.length === 0 ? (
            <p className={classes.userPickerEmpty}>No eligible users match your search.</p>
          ) : (
            picker.items.map((u) => {
              const label = pickerDisplayName(u);
              const meta = pickerDisplayMeta(u);
              return (
                <button
                  key={u.uid}
                  type="button"
                  className={classes.userPickerItem}
                  onClick={() => onSelect(u.uid)}
                >
                  <span className={classes.userPickerBody}>
                    <span className={classes.userPickerName}>{label}</span>
                    {meta ? <span className={classes.memberMeta}>{meta}</span> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <TablePagination
          page={picker.safePage}
          totalPages={picker.totalPages}
          rangeStart={picker.rangeStart}
          rangeEnd={picker.rangeEnd}
          total={picker.total}
          onPageChange={onPickerPageChange}
        />
      </div>
    </div>
  );
}

function AssignAgentsModal({
  open,
  onClose,
  users,
  selectedUids,
  search,
  pickerPage,
  assigning,
  onSearchChange,
  onPickerPageChange,
  onToggle,
  onSelectPage,
  onSelectAllFiltered,
  onSubmit,
}) {
  if (!open) return null;

  const filtered = filterByNameEmail(users, search);
  const picker = paginate(filtered, pickerPage, PICKER_PAGE_SIZE);
  const pageUids = picker.items.map((u) => u.uid);
  const pageAllSelected = pageUids.length > 0 && pageUids.every((id) => selectedUids.includes(id));

  return (
    <div className={shared.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="assign-agents-title">
      <div className={`glass ${shared.modalBox} ${classes.assignModal}`}>
        <div className={shared.modalHeader}>
          <h3 id="assign-agents-title">Add agents</h3>
          <button type="button" className={shared.modalCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={shared.modalSub}>
          Search platform users and select agents to add to this manager team.
          {filtered.length > PICKER_PAGE_SIZE ? ` Showing ${PICKER_PAGE_SIZE} per page.` : ''}
        </p>

        <div className={classes.modalSearchRow}>
          <Search size={16} className={classes.searchIcon} aria-hidden="true" />
          <input
            className={`${shared.searchInput} ${classes.modalSearch}`}
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>

        <div className={classes.pickerToolbar}>
          <span className={classes.pickerMeta}>
            {filtered.length} available · {selectedUids.length} selected
          </span>
          <div className={classes.pickerToolbarBtns}>
            {pageUids.length > 0 ? (
              <button
                type="button"
                className={shared.rowBtn}
                onClick={() => onSelectPage(pageUids, !pageAllSelected)}
              >
                {pageAllSelected ? 'Clear page' : 'Select page'}
              </button>
            ) : null}
            {filtered.length > 0 ? (
              <button
                type="button"
                className={shared.rowBtn}
                onClick={() => onSelectAllFiltered(filtered.map((u) => u.uid), true)}
              >
                Select all matching
              </button>
            ) : null}
            {selectedUids.length > 0 ? (
              <button
                type="button"
                className={shared.rowBtn}
                onClick={() => onSelectAllFiltered([], false)}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <div className={classes.userPickerList}>
          {picker.items.length === 0 ? (
            <p className={classes.userPickerEmpty}>No users match your search.</p>
          ) : (
            picker.items.map((u) => {
              const label = pickerDisplayName(u);
              const meta = pickerDisplayMeta(u);
              const checked = selectedUids.includes(u.uid);
              return (
                <label
                  key={u.uid}
                  className={`${classes.userPickerItem} ${checked ? classes.userPickerItemActive : ''}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => onToggle(u.uid)} />
                  <span className={classes.userPickerBody}>
                    <span className={classes.userPickerName}>{label}</span>
                    {meta ? <span className={classes.memberMeta}>{meta}</span> : null}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <TablePagination
          page={picker.safePage}
          totalPages={picker.totalPages}
          rangeStart={picker.rangeStart}
          rangeEnd={picker.rangeEnd}
          total={picker.total}
          onPageChange={onPickerPageChange}
        />

        <div className={shared.modalActions} style={{ marginTop: '16px' }}>
          <button type="button" className={shared.modalCancelBtn} onClick={onClose} disabled={assigning}>
            Cancel
          </button>
          <button
            type="button"
            className={shared.primaryBtn}
            disabled={!selectedUids.length || assigning}
            onClick={onSubmit}
          >
            <UserPlus size={16} />
            {assigning
              ? 'Adding…'
              : `Add ${selectedUids.length} agent${selectedUids.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminManagersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = useMemo(() => defaultRange(), []);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState(() => searchParams.get('selected') || '');
  const [settingsTab, setSettingsTab] = useState('settings');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createUid, setCreateUid] = useState('');
  const [createTeamName, setCreateTeamName] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSearch, setCreateSearch] = useState('');
  const [createPickerPage, setCreatePickerPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [assignSelected, setAssignSelected] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [savingTeamName, setSavingTeamName] = useState(false);

  const selected = managers.find((m) => m.uid === selectedUid) || null;

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Manager Teams', href: selectedUid ? '/app/admin/managers' : undefined },
    ];
    if (selectedUid) {
      const teamLabel = selected?.teamName || selected?.name || 'Loading…';
      crumbs.push({ label: teamLabel });
    }
    return crumbs;
  }, [selectedUid, selected?.teamName, selected?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const updateSelectedUid = useCallback((uid) => {
    setSelectedUid(uid);
    if (uid) {
      setSearchParams({ selected: uid }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  useEffect(() => {
    const param = searchParams.get('selected');
    if (!param || !managers.length) return;
    if (managers.some((m) => m.uid === param) && param !== selectedUid) {
      setSelectedUid(param);
    }
  }, [managers, searchParams, selectedUid]);

  const stats = useMemo(() => {
    const withAgents = managers.filter((m) => (m.agentCount ?? 0) > 0).length;
    const agents = managers.reduce((sum, m) => sum + (m.agentCount ?? 0), 0);
    return { total: managers.length, withAgents, agents };
  }, [managers]);

  const metrics = useMemo(() => [
    { label: 'teams', value: stats.total },
    { label: 'with agents', value: stats.withAgents },
    { label: 'agents', value: stats.agents },
  ], [stats]);

  const managerUids = useMemo(() => new Set(managers.map((m) => m.uid)), [managers]);

  const platformUsers = useMemo(
    () => users.filter((u) => !u.agencyId),
    [users],
  );

  const createCandidates = useMemo(
    () => platformUsers.filter(
      (u) => hasPickerIdentity(u)
        && !MANAGER_INELIGIBLE_ROLES.has(u.role)
        && !managerUids.has(u.uid),
    ),
    [platformUsers, managerUids],
  );

  const selectedCreateUser = useMemo(
    () => platformUsers.find((u) => u.uid === createUid) || null,
    [platformUsers, createUid],
  );

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateSearch('');
    setCreatePickerPage(1);
  };

  const handleSelectCreateUser = (uid) => {
    setCreateUid(uid);
    closeCreateModal();
  };

  const assignCandidates = useMemo(() => {
    if (!detail?.manager) return [];
    const memberSet = new Set(detail.manager.managedAgents || []);
    return platformUsers.filter(
      (u) => hasPickerIdentity(u)
        && u.uid !== detail.manager.uid
        && !memberSet.has(u.uid)
        && !MANAGER_INELIGIBLE_ROLES.has(u.role),
    );
  }, [detail, platformUsers]);

  const filteredMembers = useMemo(
    () => filterByQuery(detail?.members || [], membersSearch, ['role']),
    [detail, membersSearch],
  );

  const agentsListScrollable = filteredMembers.length > AGENTS_VISIBLE_CAP;
  const agentsVisibleRows = agentsListScrollable
    ? AGENTS_VISIBLE_CAP
    : Math.max(filteredMembers.length, 1);

  const chartData = useMemo(() => {
    if (!detail?.byDay?.length) return [];
    return detail.byDay.map((d) => ({
      day: d.day,
      totalCalls: d.calls,
      answeredCalls: d.answered,
    }));
  }, [detail]);

  const loadManagers = useCallback(async () => {
    const out = await listAdminManagers(range);
    setManagers(out.managers || []);
  }, [range]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await listAdminUsers();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      // Non-fatal
    }
  }, []);

  const loadDetail = useCallback(async (uid) => {
    if (!uid) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const out = await getAdminManager(uid, range);
      setDetail(out);
    } catch (err) {
      toast.error(err.message || 'Failed to load team details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [range]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadManagers(), loadUsers()]);
      } catch (err) {
        toast.error(err.message || 'Failed to load manager teams');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadManagers, loadUsers]);

  useEffect(() => {
    if (selectedUid) {
      loadDetail(selectedUid);
      setMembersSearch('');
      setSettingsTab('settings');
    } else {
      setDetail(null);
      setTeamNameDraft('');
    }
  }, [selectedUid, loadDetail]);

  useEffect(() => {
    const name = detail?.manager?.teamName || selected?.teamName || '';
    setTeamNameDraft(name);
  }, [detail?.manager?.teamName, selected?.teamName, selectedUid]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createUid) {
      toast.error('Select a user first');
      return;
    }
    if (MANAGER_INELIGIBLE_ROLES.has(selectedCreateUser?.role)) {
      toast.error('Platform admin and QA accounts cannot be assigned as manager team leads');
      return;
    }
    setCreating(true);
    try {
      const uid = createUid;
      const teamName = createTeamName.trim();
      await patchManagerSettings(uid, {
        role: 'manager',
        managedAgents: [],
        teamName: teamName || '',
      });
      toast.success('Manager team created');
      setCreateUid('');
      setCreateTeamName('');
      setCreateSearch('');
      await Promise.all([loadManagers(), loadUsers()]);
      updateSelectedUid(uid);
    } catch (err) {
      toast.error(err.message || 'Failed to create manager team');
    } finally {
      setCreating(false);
    }
  };

  const handleDemote = async (uid, name) => {
    if (!window.confirm(`Demote ${name || uid}? They will lose manager access and their team allowlist will be cleared.`)) {
      return;
    }
    try {
      await patchManagerSettings(uid, { role: 'agent', managedAgents: [] });
      toast.success('Manager demoted');
      if (selectedUid === uid) updateSelectedUid('');
      await Promise.all([loadManagers(), loadUsers()]);
    } catch (err) {
      toast.error(err.message || 'Failed to demote manager');
    }
  };

  const handleSaveTeamName = async () => {
    if (!detail?.manager) return;
    setSavingTeamName(true);
    try {
      await patchManagerSettings(detail.manager.uid, {
        role: 'manager',
        managedAgents: detail.manager.managedAgents || [],
        teamName: teamNameDraft.trim(),
      });
      toast.success('Team name updated');
      await Promise.all([loadManagers(), loadDetail(detail.manager.uid)]);
    } catch (err) {
      toast.error(err.message || 'Failed to update team name');
    } finally {
      setSavingTeamName(false);
    }
  };

  const handleRemoveMember = async (memberUid) => {
    if (!detail?.manager || !window.confirm('Remove this agent from the team?')) return;
    setSavingMembers(true);
    try {
      const next = (detail.manager.managedAgents || []).filter((id) => id !== memberUid);
      await patchManagerSettings(detail.manager.uid, { role: 'manager', managedAgents: next });
      toast.success('Agent removed from team');
      await Promise.all([loadManagers(), loadDetail(detail.manager.uid)]);
    } catch (err) {
      toast.error(err.message || 'Failed to remove agent');
    } finally {
      setSavingMembers(false);
    }
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignSearch('');
    setPickerPage(1);
    setAssignSelected([]);
  };

  const handleAssignAgents = async () => {
    if (!detail?.manager || !assignSelected.length) return;
    setAssigning(true);
    try {
      const merged = [...new Set([...(detail.manager.managedAgents || []), ...assignSelected])];
      await patchManagerSettings(detail.manager.uid, { role: 'manager', managedAgents: merged });
      toast.success(`Added ${assignSelected.length} agent${assignSelected.length !== 1 ? 's' : ''}`);
      closeAssignModal();
      await Promise.all([loadManagers(), loadDetail(detail.manager.uid)]);
    } catch (err) {
      toast.error(err.message || 'Failed to add agents');
    } finally {
      setAssigning(false);
    }
  };

  const toggleAssignUid = (uid) => {
    setAssignSelected((prev) => (
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    ));
  };

  const selectPageUids = (pageUids, select) => {
    setAssignSelected((prev) => {
      if (!select) return prev.filter((id) => !pageUids.includes(id));
      return [...new Set([...prev, ...pageUids])];
    });
  };

  const selectAllFiltered = (uids, select) => {
    setAssignSelected(select ? [...uids] : []);
  };

  if (loading && !managers.length) return <PageLoader />;

  const contextHeader = selected ? (
    <div className={classes.contextHeaderRow}>
      <div className={classes.contextLead}>
        <div className={classes.contextIcon} aria-hidden="true">
          <UserCog size={20} />
        </div>
        <div className={classes.contextCopy}>
          <h3 className={classes.contextTitle}>{selected.teamName || selected.name}</h3>
          <p className={classes.contextMeta}>
            {selected.teamName ? (
              <>
                Manager: {selected.name}
                {selected.email ? ` · ${selected.email}` : ''}
                {' · '}
              </>
            ) : (
              <>
                {pickerDisplayMeta(selected) || pickerDisplayName(selected)}
                {' · '}
              </>
            )}
            {selected.agentCount ?? 0} agent{(selected.agentCount ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className={classes.contextActions}>
        <Link
          to={`/app/admin/ops/teams?selected=${encodeURIComponent(selected.uid)}`}
          className={classes.opsLink}
        >
          <LayoutDashboard size={15} />
          <span className={classes.opsLinkLabel}>View ops dashboard</span>
        </Link>
        <button
          type="button"
          className={`${shared.rowBtnWarn} ${classes.contextActionBtn}`}
          onClick={() => handleDemote(selected.uid, selected.name)}
        >
          <UserMinus size={14} />
          Demote
        </button>
        <button
          type="button"
          className={classes.closeBtn}
          onClick={() => updateSelectedUid('')}
          aria-label="Close team settings"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  ) : null;

  const railCreate = (
    <form className={classes.createFooterForm} onSubmit={handleCreate}>
      <div className={shared.formField}>
        <label>User</label>
        <div className={classes.createUserRow}>
          <div className={classes.selectedUserBox} aria-live="polite">
            {selectedCreateUser ? (
              <>
                <span className={classes.selectedUserName}>
                  {pickerDisplayName(selectedCreateUser)}
                </span>
                {pickerDisplayMeta(selectedCreateUser) ? (
                  <span className={classes.memberMeta}>{pickerDisplayMeta(selectedCreateUser)}</span>
                ) : null}
              </>
            ) : (
              <span className={classes.selectedUserPlaceholder}>No user selected</span>
            )}
          </div>
          <button
            type="button"
            className={shared.rowBtn}
            onClick={() => setCreateModalOpen(true)}
          >
            Choose user
          </button>
        </div>
      </div>
      <div className={shared.formField}>
        <label htmlFor="createTeamName">Team name</label>
        <input
          id="createTeamName"
          className={shared.input}
          placeholder="e.g. East Coast Team"
          value={createTeamName}
          onChange={(e) => setCreateTeamName(e.target.value)}
          maxLength={80}
        />
      </div>
      <button
        type="submit"
        className={`${shared.primaryBtn} ${classes.createFooterBtn}`}
        disabled={creating || !createUid}
      >
        <Plus size={16} />
        {creating ? 'Creating…' : 'Create team'}
      </button>
    </form>
  );

  return (
    <>
      <AdminAgencySettingsShell
        metrics={metrics}
        loading={loading}
        category={ADMIN_CATEGORIES.configuration}
        tenants={managers}
        activeId={selectedUid}
        onSelect={updateSelectedUid}
        getTenantId={(m) => m.uid}
        getPrimaryLabel={(m) => m.teamName || m.name}
        getSecondaryLabel={(m) => {
          const primary = m.teamName || m.name;
          if (m.name && m.name !== primary && !isUidPlaceholderName(m)) return m.name;
          return m.email || '';
        }}
        getAgentCount={(m) => m.agentCount ?? 0}
        getSearchText={(m) => [
          m.teamName,
          isUidPlaceholderName(m) ? '' : m.name,
          m.email,
        ].filter(Boolean).join(' ')}
        railCreate={railCreate}
        createPanelTitle="New team"
        createPanelHint="Promote a user, then configure the team on the right"
        createTriggerLabel="Create team"
        searchPlaceholder="Search teams…"
        sidebarAriaLabel="Manager teams sidebar"
        directoryListAriaLabel="Manager teams"
        settingsSectionsAriaLabel="Team settings sections"
        detailHeader={contextHeader}
        tabs={SETTINGS_TABS}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        emptyTenantsTitle="No manager teams yet"
        emptyTenantsBody="Click Create team above to promote your first manager."
        emptySelectionTitle="Select a team"
        emptySelectionBody="Choose from the directory to manage agents and view performance."
      >
        {settingsTab === 'settings' ? (
          <div className={classes.tabContent}>
            {detailLoading ? (
              <p className={shared.muted}>Loading team details…</p>
            ) : detail ? (
              <div className={classes.teamNameRow}>
                <div className={shared.formField}>
                  <label htmlFor="teamNameDraft">Team name</label>
                  <input
                    id="teamNameDraft"
                    className={shared.input}
                    placeholder="e.g. East Coast Team"
                    value={teamNameDraft}
                    onChange={(e) => setTeamNameDraft(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <button
                  type="button"
                  className={shared.primaryBtn}
                  onClick={handleSaveTeamName}
                  disabled={savingTeamName}
                >
                  {savingTeamName ? 'Saving…' : 'Save name'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {settingsTab === 'performance' ? (
          <div className={classes.tabContent}>
            {detailLoading ? (
              <p className={shared.muted}>Loading team details…</p>
            ) : detail ? (
              <>
                <p className={classes.tabIntro}>Last 7 days</p>
                <div className={classes.performanceStrip}>
                  <div className={classes.perfCard}>
                    <span className={classes.perfLabel}>Total calls</span>
                    <span className={classes.perfValue}>{detail.summary?.totalCalls ?? 0}</span>
                  </div>
                  <div className={classes.perfCard}>
                    <span className={classes.perfLabel}>Billable rate</span>
                    <span className={classes.perfValue}>
                      {Math.round((detail.summary?.billableRate ?? 0) * 100)}%
                    </span>
                  </div>
                  <div className={classes.perfCard}>
                    <span className={classes.perfLabel}>Earnings</span>
                    <span className={classes.perfValue}>{formatMoney(detail.summary?.totalCost)}</span>
                  </div>
                </div>
                <div className={classes.chartSection}>
                  <AdminCallTrendChart
                    data={chartData}
                    loading={false}
                    reduceMotion={false}
                    totalCalls={detail.summary?.totalCalls ?? 0}
                    answerRatePct={Math.round((detail.summary?.answerRate ?? 0) * 100)}
                  />
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {settingsTab === 'agents' ? (
          <div className={classes.tabContent}>
            <div className={classes.tabToolbar}>
              <p className={classes.tabIntro}>
                {detailLoading
                  ? 'Loading agents…'
                  : `${(detail?.members || []).length} assigned · ${agentsListScrollable ? 'scroll the list for more' : 'search to filter'}`}
              </p>
              <button
                type="button"
                className={shared.primaryBtn}
                onClick={() => setAssignModalOpen(true)}
                disabled={!detail || detailLoading}
              >
                <UserPlus size={16} />
                Add agents
              </button>
            </div>

            <div className={classes.membersToolbar}>
              <div className={classes.membersSearchWrap}>
                <Search size={16} className={classes.searchIcon} aria-hidden="true" />
                <input
                  className={`${shared.searchInput} ${classes.membersSearch}`}
                  placeholder="Search agents by name, email, or ID…"
                  value={membersSearch}
                  onChange={(e) => setMembersSearch(e.target.value)}
                />
              </div>
              {membersSearch ? (
                <span className={classes.pickerMeta}>
                  {filteredMembers.length} match{filteredMembers.length !== 1 ? 'es' : ''}
                </span>
              ) : null}
            </div>

            <div className={shared.tableWrap}>
              <div
                className={`${shared.tableScroll} ${classes.agentsTableViewport} ${agentsListScrollable ? classes.agentsTableViewportScrollable : ''}`}
                style={{ '--agents-visible-rows': agentsVisibleRows }}
              >
                <table className={`${shared.table} ${classes.memberTable}`}>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Calls</th>
                      <th>Billable %</th>
                      <th>Earnings</th>
                      <th className={shared.actionsHead}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLoading ? (
                      <tr>
                        <td colSpan={5} className={shared.muted}>Loading agents…</td>
                      </tr>
                    ) : (detail?.members || []).length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className={shared.emptyPanel}>
                            <Users size={24} className={shared.emptyPanelIcon} />
                            <h4>No agents yet</h4>
                            <p>Use Add agents to build this manager&apos;s team allowlist.</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={shared.muted}>No agents match your search.</td>
                      </tr>
                    ) : (
                      filteredMembers.map((m) => (
                        <tr key={m.uid}>
                          <td><MemberCell member={m} /></td>
                          <td>{m.calls ?? 0}</td>
                          <td>{Math.round((m.billableRate ?? 0) * 100)}%</td>
                          <td>{formatMoney(m.totalCost)}</td>
                          <td className={shared.actionsCell}>
                            <button
                              type="button"
                              className={shared.dangerBtn}
                              disabled={savingMembers}
                              onClick={() => handleRemoveMember(m.uid)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </AdminAgencySettingsShell>

      <CreateTeamUserModal
        open={createModalOpen}
        onClose={closeCreateModal}
        users={createCandidates}
        search={createSearch}
        pickerPage={createPickerPage}
        onSearchChange={(v) => { setCreateSearch(v); setCreatePickerPage(1); }}
        onPickerPageChange={setCreatePickerPage}
        onSelect={handleSelectCreateUser}
      />

      <AssignAgentsModal
        open={assignModalOpen}
        onClose={closeAssignModal}
        users={assignCandidates}
        selectedUids={assignSelected}
        search={assignSearch}
        pickerPage={pickerPage}
        assigning={assigning}
        onSearchChange={(v) => { setAssignSearch(v); setPickerPage(1); }}
        onPickerPageChange={setPickerPage}
        onToggle={toggleAssignUid}
        onSelectPage={selectPageUids}
        onSelectAllFiltered={selectAllFiltered}
        onSubmit={handleAssignAgents}
      />
    </>
  );
}
