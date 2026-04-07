import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Info } from 'lucide-react';
import { getProfile, saveProfile } from '../services/profileService';
import classes from './LicensedStatesPage.module.css';

const STATE_LIST = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const LicensedStatesPage = () => {
  const [savedStates, setSavedStates] = useState([]);
  const [stagedStates, setStagedStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusText, setStatusText] = useState('');

  const isDirty = useMemo(() => {
    if (savedStates.length !== stagedStates.length) return true;
    const a = [...savedStates].sort();
    const b = [...stagedStates].sort();
    return a.some((v, i) => v !== b[i]);
  }, [savedStates, stagedStates]);

  const selectedCount = stagedStates.length;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getProfile(null);
        const fromDoc = Array.isArray(data?.licensedStates) ? data.licensedStates : [];
        const normalized = fromDoc
          .map((s) => String(s || '').toUpperCase())
          .filter((code) => STATE_LIST.some((st) => st.code === code));
        if (!cancelled) {
          setSavedStates(normalized);
          setStagedStates(normalized);
          setStatusText(normalized.length ? 'Saved' : '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load licensed states');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleState = (st) => {
    setStagedStates((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
    );
  };

  const selectAll = () => setStagedStates(STATE_LIST.map((s) => s.code));
  const clearAll = () => setStagedStates([]);

  const selectVisible = (list) => {
    const visibleCodes = list.map((s) => s.code);
    setStagedStates((prev) => {
      const set = new Set(prev);
      visibleCodes.forEach((c) => set.add(c));
      return Array.from(set);
    });
  };

  const handleDiscard = () => {
    setStagedStates(savedStates);
    setError('');
    setStatusText(savedStates.length ? 'Reverted changes' : '');
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setError('');
    setStatusText('Saving…');
    try {
      const payload = { licensedStates: stagedStates };
      const data = await saveProfile(null, payload);
      const fromDoc = Array.isArray(data?.licensedStates) ? data.licensedStates : stagedStates;
      const normalized = fromDoc
        .map((s) => String(s || '').toUpperCase())
        .filter((code) => STATE_LIST.some((st) => st.code === code));
      setSavedStates(normalized);
      setStagedStates(normalized);
      setStatusText('Saved just now');
    } catch (err) {
      setError(err?.message || 'Failed to save licensed states');
      setStatusText('');
    } finally {
      setSaving(false);
    }
  };

  const filteredStates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return STATE_LIST;
    return STATE_LIST.filter((st) => {
      const code = st.code.toLowerCase();
      const name = st.name.toLowerCase();
      return code.includes(term) || name.includes(term);
    });
  }, [search]);

  return (
    <div className={classes.container}>
       <div className={classes.header}>
          <div className={classes.iconBox}><MapPin size={24} /></div>
          <div>
             <h2>Licensed States</h2>
             <p>Select the states you're licensed to take calls from</p>
          </div>
       </div>

       <div className={classes.mainBox}>
          <div className={classes.topRow}>
            <div className={classes.summary}>
              <div className={classes.summaryTitleRow}>
                <h3>Your Licensed States</h3>
                <div className={classes.countPill}>
                  {selectedCount} selected
                </div>
              </div>
              <p className={classes.summaryHint}>
                We only route calls from states where you are licensed.
              </p>
              <div className={classes.summaryChips} aria-live="polite">
                {selectedCount === 0 && !loading && (
                  <span className={classes.emptyChips}>No states selected yet.</span>
                )}
                {loading && (
                  <span className={classes.emptyChips}>Loading your saved states…</span>
                )}
              </div>
            </div>
            <div className={classes.summaryActions}>
              <div className={classes.statusRow}>
                {error && <span className={classes.errorText}>{error}</span>}
                {!error && statusText && (
                  <span className={classes.statusText}>{statusText}</span>
                )}
              </div>
              <div className={classes.buttonRow}>
                <button
                  type="button"
                  className={classes.discardBtn}
                  onClick={handleDiscard}
                  disabled={!isDirty || saving}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className={classes.saveBtn}
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                >
                  {saving ? 'Saving…' : `Save changes`}
                </button>
              </div>
            </div>
          </div>

          <div className={classes.toolsRow}>
            <div className={classes.searchWrap}>
              <input
                type="search"
                className={classes.searchInput}
                placeholder="Search by state or abbreviation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search states"
              />
            </div>
            <div className={classes.actions}>
              <button
                type="button"
                onClick={selectAll}
                className={classes.ghostBtn}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className={classes.ghostBtn}
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => selectVisible(filteredStates)}
                className={classes.ghostBtn}
                disabled={filteredStates.length === 0}
              >
                Select visible
              </button>
            </div>
          </div>

          <div
            className={classes.grid}
            role="list"
            aria-label="Licensed states"
          >
            {filteredStates.map((st) => {
              const isSelected = stagedStates.includes(st.code);
              return (
                <button
                  key={st.code}
                  type="button"
                  className={`${classes.stateTile} ${
                    isSelected ? classes.stateTileSelected : ''
                  }`}
                  onClick={() => toggleState(st.code)}
                  aria-pressed={isSelected}
                  role="listitem"
                >
                  <span className={classes.tileCode}>{st.code}</span>
                  <span className={classes.tileName}>{st.name}</span>
                </button>
              );
            })}
            {!loading && filteredStates.length === 0 && (
              <div className={classes.emptyState}>
                <p>No states match your search.</p>
              </div>
            )}
          </div>

          <div className={classes.infoBox}>
            <Info size={16} className={classes.infoIcon} />
            <p>
              Your licensed states help us decide which inbound calls we can
              safely route to you. Keep this list accurate to avoid missed
              opportunities or compliance issues.
            </p>
          </div>
       </div>
    </div>
  );
};

export default LicensedStatesPage;
