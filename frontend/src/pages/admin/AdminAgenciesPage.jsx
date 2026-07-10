import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageBreadcrumbs } from '../../hooks/usePageBreadcrumbs';
import {
  Building2,
  Plus,
  Trash2,
  Users,
  Phone,
  UserPlus,
  X,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  Search,
  LayoutDashboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listAdminAgencies,
  createAdminAgency,
  updateAdminAgency,
  deleteAdminAgency,
  listAgencyMembers,
  assignAgencyMember,
  updateAgencyMemberRole,
  removeAgencyMember,
  lockAgencyCampaigns,
  listAgencyDids,
  assignAgencyDid,
} from '../../services/agencyService';
import { getAdminOverviewLite, listAdminUsers } from '../../services/adminService';
import AdminAgencySettingsShell from '../../components/admin/AdminAgencySettingsShell';
import { ADMIN_CATEGORIES } from '../../config/adminModules';
import PageLoader from '../../components/ui/PageLoader';
import shared from '../../components/admin/adminShared.module.css';
import classes from './AdminAgenciesPage.module.css';

const MEMBERS_PAGE_SIZE = 25;
const PICKER_PAGE_SIZE = 12;

const SETTINGS_TABS = [
  { id: 'members', label: 'Members' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'dids', label: 'DIDs' },
];

function dedupeUsers(list) {
  const map = new Map();
  (list || []).forEach((u) => {
    if (u?.uid && !map.has(u.uid)) map.set(u.uid, u);
  });
  return [...map.values()];
}

function filterByQuery(list, query, extraFields = []) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const base = [
      row.name,
      row.email,
      row.uid,
      ...extraFields.map((f) => row[f]),
    ];
    return base.some((v) => String(v || '').toLowerCase().includes(q));
  });
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
  const displayName = member.name || member.email || 'Unnamed user';
  return (
    <div className={classes.memberCell}>
      <span className={classes.memberName}>{displayName}</span>
      {member.email && member.name ? (
        <span className={classes.memberMeta}>{member.email}</span>
      ) : null}
      <span className={classes.memberMeta}>{member.uid}</span>
    </div>
  );
}

function AssignMembersModal({
  open,
  onClose,
  users,
  selectedUids,
  role,
  search,
  pickerPage,
  assigning,
  onSearchChange,
  onPickerPageChange,
  onToggle,
  onSelectPage,
  onSelectAllFiltered,
  onRoleChange,
  onSubmit,
}) {
  if (!open) return null;

  const filtered = filterByQuery(users, search);
  const picker = paginate(filtered, pickerPage, PICKER_PAGE_SIZE);
  const pageUids = picker.items.map((u) => u.uid);
  const pageAllSelected = pageUids.length > 0 && pageUids.every((id) => selectedUids.includes(id));

  return (
    <div className={shared.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="assign-members-title">
      <div className={`glass ${shared.modalBox} ${classes.assignModal}`}>
        <div className={shared.modalHeader}>
          <h3 id="assign-members-title">Add members</h3>
          <button type="button" className={shared.modalCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={shared.modalSub}>
          Search platform users, select one or more, then assign them to this agency.
          {filtered.length > PICKER_PAGE_SIZE ? ` Showing ${PICKER_PAGE_SIZE} per page.` : ''}
        </p>

        <div className={classes.modalSearchRow}>
          <Search size={16} className={classes.searchIcon} aria-hidden="true" />
          <input
            className={`${shared.searchInput} ${classes.modalSearch}`}
            placeholder="Search by name, email, or ID…"
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
            <p className={classes.userPickerEmpty}>No unassigned users match your search.</p>
          ) : (
            picker.items.map((u) => {
              const label = u.name || u.email || 'Unnamed user';
              const checked = selectedUids.includes(u.uid);
              return (
                <label
                  key={u.uid}
                  className={`${classes.userPickerItem} ${checked ? classes.userPickerItemActive : ''}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => onToggle(u.uid)} />
                  <span className={classes.userPickerBody}>
                    <span className={classes.userPickerName}>{label}</span>
                    {u.email && u.name ? (
                      <span className={classes.memberMeta}>{u.email}</span>
                    ) : null}
                    <span className={classes.memberMeta}>{u.uid}</span>
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

        <div className={classes.modalFooter}>
          <div className={shared.formField}>
            <label>Role for selected</label>
            <select className={shared.select} value={role} onChange={(e) => onRoleChange(e.target.value)}>
              <option value="agency_agent">Agency Agent</option>
              <option value="agency_admin">Agency Admin</option>
            </select>
          </div>
          <div className={shared.modalActions}>
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
                ? 'Assigning…'
                : `Assign ${selectedUids.length} user${selectedUids.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminAgenciesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [agencies, setAgencies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(() => searchParams.get('selected') || '');
  const [settingsTab, setSettingsTab] = useState('members');
  const [members, setMembers] = useState([]);
  const [dids, setDids] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', slug: '' });
  const [memberForm, setMemberForm] = useState({ selectedUids: [], role: 'agency_agent' });
  const [memberSearch, setMemberSearch] = useState('');
  const [pickerPage, setPickerPage] = useState(1);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');
  const [membersPage, setMembersPage] = useState(1);
  const [assigningMembers, setAssigningMembers] = useState(false);
  const [roleUpdatingUid, setRoleUpdatingUid] = useState('');
  const [didForm, setDidForm] = useState({ phoneE164: '', campaignId: '', label: '' });
  const [lockedDraft, setLockedDraft] = useState([]);
  const [savingCampaigns, setSavingCampaigns] = useState(false);

  const selected = agencies.find((a) => a.id === selectedId) || null;

  const breadcrumbs = useMemo(() => {
    const crumbs = [
      { label: 'Admin', href: '/app/admin' },
      { label: 'Agencies', href: selectedId ? '/app/admin/agencies' : undefined },
    ];
    if (selectedId) {
      crumbs.push({ label: selected?.name || 'Loading…' });
    }
    return crumbs;
  }, [selectedId, selected?.name]);

  usePageBreadcrumbs(breadcrumbs);

  const updateSelectedId = useCallback((id) => {
    setSelectedId(id);
    if (id) {
      setSearchParams({ selected: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [setSearchParams]);

  useEffect(() => {
    const param = searchParams.get('selected');
    if (!param || !agencies.length) return;
    if (agencies.some((a) => a.id === param) && param !== selectedId) {
      setSelectedId(param);
    }
  }, [agencies, searchParams, selectedId]);

  const filteredMembers = useMemo(
    () => filterByQuery(members, membersSearch, ['role']),
    [members, membersSearch],
  );
  const membersPager = useMemo(
    () => paginate(filteredMembers, membersPage, MEMBERS_PAGE_SIZE),
    [filteredMembers, membersPage],
  );

  const stats = useMemo(() => {
    const active = agencies.filter((a) => a.status !== 'suspended').length;
    const agents = agencies.reduce((sum, a) => sum + (a.agentCount ?? 0), 0);
    return { total: agencies.length, active, agents };
  }, [agencies]);

  const metrics = useMemo(() => [
    { label: 'agencies', value: stats.total },
    { label: 'active', value: stats.active },
    { label: 'agents', value: stats.agents },
  ], [stats]);

  const loadAgencies = useCallback(async () => {
    const out = await listAdminAgencies();
    setAgencies(out.agencies || []);
  }, []);

  const loadShell = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, userOut] = await Promise.all([
        getAdminOverviewLite(),
        listAdminUsers(),
      ]);
      setCampaigns(ov?.campaigns || []);
      setUsers(dedupeUsers(userOut?.users || []).filter((u) => !u.agencyId));
      await loadAgencies();
    } catch (e) {
      toast.error(e.message || 'Failed to load agencies');
    } finally {
      setLoading(false);
    }
  }, [loadAgencies]);

  const loadAgencyDetail = useCallback(async (agencyId) => {
    if (!agencyId) {
      setMembers([]);
      setDids([]);
      setLockedDraft([]);
      return;
    }
    setDetailLoading(true);
    try {
      const [memberOut, didOut] = await Promise.all([
        listAgencyMembers(agencyId),
        listAgencyDids(agencyId),
      ]);
      setMembers(memberOut.members || []);
      setDids(didOut.routes || []);
      const agency = agencies.find((a) => a.id === agencyId);
      setLockedDraft(Array.isArray(agency?.lockedCampaignIds) ? [...agency.lockedCampaignIds] : []);
    } catch (e) {
      toast.error(e.message || 'Failed to load agency detail');
    } finally {
      setDetailLoading(false);
    }
  }, [agencies]);

  useEffect(() => { loadShell(); }, [loadShell]);
  useEffect(() => { loadAgencyDetail(selectedId); }, [selectedId, loadAgencyDetail]);

  useEffect(() => {
    setMembersPage(1);
    setMembersSearch('');
    setAssignModalOpen(false);
    setMemberForm({ selectedUids: [], role: 'agency_agent' });
    setMemberSearch('');
    setPickerPage(1);
    setSettingsTab('members');
  }, [selectedId]);

  useEffect(() => {
    setMembersPage(1);
  }, [membersSearch]);

  useEffect(() => {
    setPickerPage(1);
  }, [memberSearch]);

  useEffect(() => {
    if (!selectedId) return;
    const agency = agencies.find((a) => a.id === selectedId);
    if (agency) {
      setLockedDraft(Array.isArray(agency.lockedCampaignIds) ? [...agency.lockedCampaignIds] : []);
    }
  }, [agencies, selectedId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast.error('Agency name is required');
      return;
    }
    try {
      const out = await createAdminAgency(createForm);
      toast.success('Agency created');
      setCreateForm({ name: '', slug: '' });
      await loadAgencies();
      if (out?.agency?.id) updateSelectedId(out.agency.id);
    } catch (err) {
      toast.error(err.message || 'Failed to create agency');
    }
  };

  const handleAssignMember = async () => {
    if (!selectedId || !memberForm.selectedUids.length) return;
    setAssigningMembers(true);
    try {
      const out = await assignAgencyMember(selectedId, {
        uids: memberForm.selectedUids,
        role: memberForm.role,
      });
      const count = out?.assigned?.length || memberForm.selectedUids.length;
      toast.success(`Assigned ${count} member${count !== 1 ? 's' : ''}`);
      if (out?.errors?.length) {
        toast.error(`${out.errors.length} user(s) could not be assigned`);
      }
      setMemberForm({ selectedUids: [], role: 'agency_agent' });
      setMemberSearch('');
      setPickerPage(1);
      setAssignModalOpen(false);
      await Promise.all([loadShell(), loadAgencies(), loadAgencyDetail(selectedId)]);
    } catch (err) {
      toast.error(err.message || 'Failed to assign members');
    } finally {
      setAssigningMembers(false);
    }
  };

  const toggleMemberSelection = (uid) => {
    setMemberForm((f) => ({
      ...f,
      selectedUids: f.selectedUids.includes(uid)
        ? f.selectedUids.filter((id) => id !== uid)
        : [...f.selectedUids, uid],
    }));
  };

  const selectPageMembers = (uids, select) => {
    setMemberForm((f) => {
      if (!select) {
        const drop = new Set(uids);
        return { ...f, selectedUids: f.selectedUids.filter((id) => !drop.has(id)) };
      }
      return { ...f, selectedUids: [...new Set([...f.selectedUids, ...uids])] };
    });
  };

  const selectAllFilteredMembers = (uids, select) => {
    setMemberForm((f) => ({
      ...f,
      selectedUids: select ? [...new Set(uids)] : [],
    }));
  };

  const closeAssignModal = () => {
    if (assigningMembers) return;
    setAssignModalOpen(false);
    setMemberForm((f) => ({ ...f, selectedUids: [] }));
    setMemberSearch('');
    setPickerPage(1);
  };

  const handleUpdateMemberRole = async (uid, role) => {
    if (!selectedId) return;
    setRoleUpdatingUid(uid);
    try {
      await updateAgencyMemberRole(selectedId, uid, { role });
      setMembers((prev) => prev.map((m) => (m.uid === uid ? { ...m, role } : m)));
      toast.success('Role updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update role');
      await loadAgencyDetail(selectedId);
    } finally {
      setRoleUpdatingUid('');
    }
  };

  const handleRemoveMember = async (uid) => {
    if (!selectedId || !window.confirm('Remove this user from the agency?')) return;
    try {
      await removeAgencyMember(selectedId, uid);
      toast.success('Member removed');
      await Promise.all([loadShell(), loadAgencies(), loadAgencyDetail(selectedId)]);
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
    }
  };

  const handleSaveLockedCampaigns = async () => {
    if (!selectedId) return;
    setSavingCampaigns(true);
    try {
      await lockAgencyCampaigns(selectedId, lockedDraft);
      toast.success('Locked campaigns updated');
      await loadAgencies();
    } catch (err) {
      toast.error(err.message || 'Failed to lock campaigns');
    } finally {
      setSavingCampaigns(false);
    }
  };

  const handleAssignDid = async (e) => {
    e.preventDefault();
    if (!selectedId || !didForm.phoneE164 || !didForm.campaignId) return;
    try {
      await assignAgencyDid(selectedId, didForm);
      toast.success('DID assigned');
      setDidForm({ phoneE164: '', campaignId: '', label: '' });
      await loadAgencyDetail(selectedId);
    } catch (err) {
      toast.error(err.message || 'Failed to assign DID');
    }
  };

  const toggleLockedCampaign = (campaignId) => {
    setLockedDraft((prev) => (
      prev.includes(campaignId)
        ? prev.filter((id) => id !== campaignId)
        : [...prev, campaignId]
    ));
  };

  const handleDeleteAgency = async (id) => {
    if (!window.confirm('Delete this agency? It must have no members.')) return;
    try {
      await deleteAdminAgency(id);
      toast.success('Agency deleted');
      if (selectedId === id) updateSelectedId('');
      await loadAgencies();
    } catch (err) {
      toast.error(err.message || 'Failed to delete agency');
    }
  };

  const handleSuspend = async (agency) => {
    try {
      await updateAdminAgency(agency.id, {
        status: agency.status === 'suspended' ? 'active' : 'suspended',
      });
      toast.success('Agency status updated');
      await loadAgencies();
    } catch (err) {
      toast.error(err.message || 'Failed to update agency');
    }
  };

  if (loading && !agencies.length) return <PageLoader />;

  const contextHeader = selected ? (
    <div className={classes.contextHeaderRow}>
      <div className={classes.contextLead}>
        <div className={classes.contextIcon} aria-hidden="true">
          <Building2 size={20} />
        </div>
        <div className={classes.contextCopy}>
          <h3 className={classes.contextTitle}>{selected.name}</h3>
          <p className={classes.contextMeta}>
            {selected.slug || selected.id}
            {' · '}
            {selected.agentCount ?? 0} member{(selected.agentCount ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className={classes.contextActions}>
        <span className={`${shared.statusPill} ${selected.status === 'suspended' ? shared.dispMissed : shared.dispAnswered}`}>
          {selected.status === 'suspended' ? 'Suspended' : 'Active'}
        </span>
        <Link
          to={`/app/admin/ops/agencies?selected=${encodeURIComponent(selected.id)}`}
          className={classes.opsLink}
        >
          <LayoutDashboard size={15} />
          <span className={classes.opsLinkLabel}>View ops dashboard</span>
        </Link>
        <button
          type="button"
          className={`${shared.rowBtnWarn} ${classes.contextActionBtn}`}
          onClick={() => handleSuspend(selected)}
        >
          {selected.status === 'suspended' ? <Play size={14} /> : <Pause size={14} />}
          {selected.status === 'suspended' ? 'Activate' : 'Suspend'}
        </button>
        <button
          type="button"
          className={shared.rowBtnDanger}
          onClick={() => handleDeleteAgency(selected.id)}
          aria-label="Delete agency"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          className={classes.closeBtn}
          onClick={() => updateSelectedId('')}
          aria-label="Close agency settings"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  ) : null;

  const railCreate = (
    <form className={classes.createFooterForm} onSubmit={handleCreate}>
      <div className={shared.formField}>
        <label>Name</label>
        <input
          className={shared.input}
          value={createForm.name}
          onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Acme Call Center"
        />
      </div>
      <div className={shared.formField}>
        <label>Slug (optional)</label>
        <input
          className={shared.input}
          value={createForm.slug}
          onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
          placeholder="acme-call-center"
        />
      </div>
      <button type="submit" className={`${shared.primaryBtn} ${classes.createFooterBtn}`}>
        <Plus size={16} />
        Create agency
      </button>
    </form>
  );

  return (
    <>
      <AdminAgencySettingsShell
        metrics={metrics}
        loading={loading}
        category={ADMIN_CATEGORIES.configuration}
        tenants={agencies}
        activeId={selectedId}
        onSelect={updateSelectedId}
        getTenantId={(a) => a.id}
        getPrimaryLabel={(a) => a.name}
        getSecondaryLabel={(a) => a.slug || a.id}
        getAgentCount={(a) => a.agentCount ?? 0}
        getStatusPill={(a) => ({
          label: a.status === 'suspended' ? 'Suspended' : 'Active',
          variant: a.status === 'suspended' ? 'suspended' : 'active',
        })}
        getSearchText={(a) => [a.name, a.slug, a.id, a.status].filter(Boolean).join(' ')}
        railCreate={railCreate}
        createTriggerLabel="Create agency"
        detailHeader={contextHeader}
        tabs={SETTINGS_TABS}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        emptyTenantsTitle="No agencies yet"
        emptyTenantsBody="Click Create agency above to add your first tenant."
        emptySelectionTitle="Select an agency"
        emptySelectionBody="Choose from the directory to manage members, campaigns, and DIDs."
      >
        {settingsTab === 'members' ? (
          <div className={classes.tabContent}>
            <div className={classes.tabToolbar}>
              <p className={classes.tabIntro}>
                {members.length} assigned · search and paginate for large teams
              </p>
              <button
                type="button"
                className={shared.primaryBtn}
                onClick={() => setAssignModalOpen(true)}
              >
                <UserPlus size={16} />
                Add members
              </button>
            </div>

            <div className={classes.membersToolbar}>
              <div className={classes.membersSearchWrap}>
                <Search size={16} className={classes.searchIcon} aria-hidden="true" />
                <input
                  className={`${shared.searchInput} ${classes.membersSearch}`}
                  placeholder="Search members by name, email, or ID…"
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
              <div className={shared.tableScroll}>
                <table className={`${shared.table} ${classes.memberTable}`}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th className={shared.actionsHead}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailLoading ? (
                      <tr>
                        <td colSpan={3} className={shared.muted}>Loading members…</td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <div className={shared.emptyPanel}>
                            <Users size={24} className={shared.emptyPanelIcon} />
                            <h4>No members yet</h4>
                            <p>Use Add members to assign platform users to this agency.</p>
                          </div>
                        </td>
                      </tr>
                    ) : membersPager.items.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={shared.muted}>No members match your search.</td>
                      </tr>
                    ) : (
                      membersPager.items.map((m) => (
                        <tr key={m.uid}>
                          <td><MemberCell member={m} /></td>
                          <td>
                            <select
                              className={`${shared.select} ${classes.roleSelect}`}
                              value={m.role === 'agency_admin' ? 'agency_admin' : 'agency_agent'}
                              disabled={roleUpdatingUid === m.uid}
                              onChange={(e) => handleUpdateMemberRole(m.uid, e.target.value)}
                              aria-label={`Role for ${m.name || m.email || m.uid}`}
                            >
                              <option value="agency_agent">Agency Agent</option>
                              <option value="agency_admin">Agency Admin</option>
                            </select>
                          </td>
                          <td className={shared.actionsCell}>
                            <button
                              type="button"
                              className={shared.dangerBtn}
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

            <TablePagination
              page={membersPager.safePage}
              totalPages={membersPager.totalPages}
              rangeStart={membersPager.rangeStart}
              rangeEnd={membersPager.rangeEnd}
              total={membersPager.total}
              onPageChange={setMembersPage}
            />
          </div>
        ) : null}

        {settingsTab === 'campaigns' ? (
          <div className={classes.tabContent}>
            <p className={classes.tabIntro}>
              Agency agents only see selected campaigns in Take Calls.
            </p>
            {campaigns.length === 0 ? (
              <div className={shared.emptyPanel}>
                <h4>No campaigns configured</h4>
                <p>Add campaigns in Campaign Settings first.</p>
              </div>
            ) : (
              <>
                <div className={classes.campaignGrid}>
                  {campaigns.map((c) => {
                    const checked = lockedDraft.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`${classes.campaignChip} ${checked ? classes.campaignChipActive : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLockedCampaign(c.id)}
                        />
                        <span className={classes.campaignChipBody}>
                          <span className={classes.campaignChipLabel}>{c.label || c.id}</span>
                          <span className={classes.campaignChipMeta}>
                            ${Number(c.price).toFixed(0)} · {c.buffer}s
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={shared.primaryBtn}
                  onClick={handleSaveLockedCampaigns}
                  disabled={savingCampaigns}
                >
                  {savingCampaigns ? 'Saving…' : 'Save locked campaigns'}
                </button>
              </>
            )}
          </div>
        ) : null}

        {settingsTab === 'dids' ? (
          <div className={classes.tabContent}>
            <p className={classes.tabIntro}>
              Phone numbers routed exclusively to this agency&apos;s campaigns.
            </p>
            <form className={classes.didForm} onSubmit={handleAssignDid}>
              <div className={shared.formField}>
                <label>Phone (E.164)</label>
                <input
                  className={shared.input}
                  value={didForm.phoneE164}
                  onChange={(e) => setDidForm((f) => ({ ...f, phoneE164: e.target.value }))}
                  placeholder="+15551234567"
                />
              </div>
              <div className={shared.formField}>
                <label>Campaign</label>
                <select
                  className={shared.select}
                  value={didForm.campaignId}
                  onChange={(e) => setDidForm((f) => ({ ...f, campaignId: e.target.value }))}
                >
                  <option value="">Select campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.label || c.id}</option>
                  ))}
                </select>
              </div>
              <div className={shared.formField}>
                <label>Label</label>
                <input
                  className={shared.input}
                  value={didForm.label}
                  onChange={(e) => setDidForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <button type="submit" className={shared.primaryBtn} disabled={!didForm.phoneE164 || !didForm.campaignId}>
                <Plus size={16} />
                Add DID
              </button>
            </form>

            <div className={shared.tableWrap}>
              <div className={shared.tableScroll}>
                <table className={`${shared.table} ${shared.routingTable}`}>
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Campaign</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dids.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <div className={shared.emptyPanel}>
                            <Phone size={24} className={shared.emptyPanelIcon} />
                            <h4>No DIDs assigned</h4>
                            <p>Add a phone number above to route inbound calls to this agency.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      dids.map((d) => (
                        <tr key={d.id}>
                          <td className={shared.mono}>{d.phoneE164}</td>
                          <td>{d.campaignId}</td>
                          <td>{d.label || '—'}</td>
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

      <AssignMembersModal
        open={assignModalOpen}
        onClose={closeAssignModal}
        users={users}
        selectedUids={memberForm.selectedUids}
        role={memberForm.role}
        search={memberSearch}
        pickerPage={pickerPage}
        assigning={assigningMembers}
        onSearchChange={setMemberSearch}
        onPickerPageChange={setPickerPage}
        onToggle={toggleMemberSelection}
        onSelectPage={selectPageMembers}
        onSelectAllFiltered={selectAllFilteredMembers}
        onRoleChange={(role) => setMemberForm((f) => ({ ...f, role }))}
        onSubmit={handleAssignMember}
      />
    </>
  );
}
