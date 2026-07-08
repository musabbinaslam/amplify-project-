import { useState, useEffect, useCallback, useMemo } from 'react';
import { UserPlus, X, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import {
  listManagerAssignableAgents,
  updateManagerTeam,
} from '../../services/managerService';
import shared from './opsShared.module.css';
import admin from '../admin/adminShared.module.css';
import team from './TeamDashboard.module.css';

const PAGE_SIZE = 12;

function filterUsers(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((u) =>
    [u.name, u.email, u.uid].some((v) => String(v || '').toLowerCase().includes(q)),
  );
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

export default function TeamRosterPanel({ agentCount, onUpdated }) {
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === 'manager';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const out = await listManagerAssignableAgents();
      const list = Array.isArray(out?.users) ? out.users : [];
      setUsers(list);
      setSelected(list.filter((u) => u.assigned).map((u) => u.uid));
    } catch (err) {
      toast.error(err.message || 'Failed to load agents');
      setUsers([]);
      setSelected([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && isManager) loadUsers();
  }, [open, isManager, loadUsers]);

  const filtered = useMemo(() => filterUsers(users, search), [users, search]);
  const pager = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);
  const pageUids = pager.items.map((u) => u.uid);
  const pageAllSelected = pageUids.length > 0 && pageUids.every((id) => selected.includes(id));

  const toggleUid = (uid) => {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const closeModal = () => {
    setOpen(false);
    setSearch('');
    setPage(1);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const out = await updateManagerTeam({ managedAgents: selected });
      toast.success(`Team updated (${out.managedAgents?.length ?? selected.length} agents)`);
      closeModal();
      if (onUpdated) await onUpdated();
    } catch (err) {
      toast.error(err.message || 'Failed to save team');
    } finally {
      setSaving(false);
    }
  };

  if (!isManager) return null;

  return (
    <>
      <div className={team.rosterBar}>
        <div className={team.rosterCopy}>
          <Users size={16} className={shared.statIcon} aria-hidden="true" />
          <span>
            <strong>{agentCount}</strong> agent{agentCount !== 1 ? 's' : ''} on your team
          </span>
          <span className={shared.muted}>· You can add or remove agents here, or ask an admin</span>
        </div>
        <button type="button" className={shared.refreshBtn} onClick={() => setOpen(true)}>
          <UserPlus size={16} />
          Manage team
        </button>
      </div>

      {open ? (
        <div className={admin.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="team-roster-title">
          <div className={`glass ${admin.modalBox} ${team.rosterModal}`}>
            <div className={admin.modalHeader}>
              <h3 id="team-roster-title">Manage your team</h3>
              <button type="button" className={admin.modalCloseBtn} onClick={closeModal} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className={admin.modalSub}>
              Choose which platform agents appear on your Team Dashboard. Admins can also assign agents for you.
            </p>

            <div className={team.rosterSearchRow}>
              <Search size={16} className={team.rosterSearchIcon} aria-hidden="true" />
              <input
                className={`${shared.searchInput} ${team.rosterSearchInput}`}
                placeholder="Search by name, email, or ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                autoFocus
              />
            </div>

            <div className={team.rosterToolbar}>
              <span className={shared.muted}>
                {filtered.length} available · {selected.length} selected
              </span>
              <div className={team.rosterToolbarBtns}>
                {pageUids.length > 0 ? (
                  <button
                    type="button"
                    className={shared.filterBtn}
                    onClick={() => {
                      setSelected((prev) => (
                        pageAllSelected
                          ? prev.filter((id) => !pageUids.includes(id))
                          : [...new Set([...prev, ...pageUids])]
                      ));
                    }}
                  >
                    {pageAllSelected ? 'Clear page' : 'Select page'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className={team.rosterList}>
              {loading ? (
                <p className={shared.muted}>Loading agents…</p>
              ) : pager.items.length === 0 ? (
                <p className={shared.muted}>No agents match your search.</p>
              ) : (
                pager.items.map((u) => {
                  const label = u.name || u.email || 'Unnamed user';
                  const checked = selected.includes(u.uid);
                  return (
                    <label
                      key={u.uid}
                      className={`${team.rosterItem} ${checked ? team.rosterItemActive : ''}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleUid(u.uid)} />
                      <span className={team.rosterItemBody}>
                        <span className={team.rosterItemName}>{label}</span>
                        {u.email && u.name ? (
                          <span className={team.rosterItemMeta}>{u.email}</span>
                        ) : null}
                        <span className={team.rosterItemMeta}>{u.uid}</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {pager.total > 0 ? (
              <div className={shared.pagination}>
                <span className={shared.muted}>
                  {pager.rangeStart}–{pager.rangeEnd} of {pager.total}
                </span>
                <div className={shared.pageBtns}>
                  <button
                    type="button"
                    className={shared.pageBtn}
                    disabled={pager.safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>
                  <span className={shared.pageIndicator}>Page {pager.safePage} of {pager.totalPages}</span>
                  <button
                    type="button"
                    className={shared.pageBtn}
                    disabled={pager.safePage >= pager.totalPages}
                    onClick={() => setPage((p) => Math.min(pager.totalPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
            ) : null}

            <div className={admin.modalActions}>
              <button type="button" className={admin.modalCancelBtn} onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={admin.primaryBtn} onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Saving…' : `Save team (${selected.length})`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
