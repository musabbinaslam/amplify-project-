import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { User, Camera, Copy, Check, Link2, Key, Loader2, X, Eye, EyeOff, RefreshCw, Upload, Trash2, ShieldCheck, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { getProfileBootstrap, saveProfile, regenerateApiKey, checkSlugAvailability, getProfileActivity } from '../services/profileService';
import classes from './ProfilePage.module.css';

const SPENDING_OPTIONS = ['Less than $500', '$500 - $1,000', '$1,000 - $2,500', '$2,500 - $5,000', '$5,000+', 'Not currently spending'];
const HEAR_ABOUT_OPTIONS = ['Google Search', 'Facebook / Instagram', 'YouTube', 'Referral', 'Discord', 'Other'];
const VERTICALS = ['Final Expense', 'Spanish Final Expense', 'ACA', 'Medicare', 'Leads'];
const MAX_AVATAR_FILE_MB = 5;
const MAX_AVATAR_OUTPUT_PX = 512;
const MIN_SLUG_LEN = 3;

function normalizeSlug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9-_]/g, ''); }
function isValidPhone(v) {
  const cleaned = String(v || '').replace(/[^\d+]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 16;
}
function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = url;
  });
}
async function getCroppedImage(src, pixelCrop) {
  const image = await createImage(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const longestSide = Math.max(pixelCrop.width, pixelCrop.height);
  const scale = longestSide > MAX_AVATAR_OUTPUT_PX ? (MAX_AVATAR_OUTPUT_PX / longestSide) : 1;
  const outW = Math.max(1, Math.round(pixelCrop.width * scale));
  const outH = Math.max(1, Math.round(pixelCrop.height * scale));
  canvas.width = outW;
  canvas.height = outH;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', 0.82);
}

const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updateName = useAuthStore((s) => s.updateName);
  const fileInputRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', slug: '', phone: '', weeklySpend: '', usedInbound: '', verticals: [], hearAbout: '', avatarUrl: '' });
  const [initialForm, setInitialForm] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyRotatedAt, setApiKeyRotatedAt] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [slugStatus, setSlugStatus] = useState('idle');
  const [memberSince, setMemberSince] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activity, setActivity] = useState([]);
  const [auditCollapsed, setAuditCollapsed] = useState(true);
  const [avatarSource, setAvatarSource] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCropPixels, setAvatarCropPixels] = useState(null);
  const lastSlugCheckedRef = useRef('');
  const lastSlugResultRef = useRef(null);

  const webhookUrl = 'https://api.agentcalls.io/api/leads/webhook';
  const bioValid = form.bio.trim().length >= 20 && form.bio.trim().length <= 500;
  const phoneValid = !form.phone || isValidPhone(form.phone);
  const slugValid = form.slug.length >= MIN_SLUG_LEN && /^[a-z0-9-_]+$/.test(form.slug);

  const isDirty = useMemo(() => initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) : false, [form, initialForm]);
  const completion = useMemo(() => {
    const items = [
      { label: 'Photo uploaded', done: Boolean(form.avatarUrl || user?.avatar) },
      { label: 'Bio completed', done: bioValid },
      { label: 'Landing slug valid', done: slugValid && slugStatus !== 'taken' },
      { label: 'Phone valid', done: phoneValid && Boolean(form.phone) },
      { label: 'Vertical selected', done: form.verticals.length > 0 },
      { label: 'Webhook ready', done: Boolean(webhookUrl && apiKey) },
    ];
    const done = items.filter((i) => i.done).length;
    return { items, score: Math.round((done / items.length) * 100) };
  }, [form, user?.avatar, bioValid, slugValid, slugStatus, phoneValid, webhookUrl, apiKey]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const boot = await getProfileBootstrap(user.uid);
        const profile = boot?.profile || {};
        const key = boot?.apiKey || '';
        const act = { activity: Array.isArray(boot?.activity) ? boot.activity : [] };
        if (cancelled) return;
        const onboardingData = profile?.onboarding || {};
        const verticals = onboardingData.verticals ? (Array.isArray(onboardingData.verticals) ? onboardingData.verticals : String(onboardingData.verticals).split(',').map((v) => v.trim()).filter(Boolean)) : [];
        const next = {
          displayName: user.name || '',
          bio: profile?.bio || '',
          slug: profile?.landingPageSlug || normalizeSlug(user.name || ''),
          phone: onboardingData.phone || '',
          weeklySpend: onboardingData.weeklySpend || '',
          usedInbound: onboardingData.usedInbound || '',
          verticals,
          hearAbout: onboardingData.hearAbout || '',
          avatarUrl: profile?.avatarUrl || user?.avatar || '',
        };
        setForm(next);
        setInitialForm(next);
        setOnboarding(onboardingData);
        setApiKey(key);
        setApiKeyRotatedAt(profile?.apiKeyRotatedAt || null);
        setMemberSince(profile?.memberSince || profile?.createdAt || null);
        setLastUpdated(profile?.lastUpdated || profile?.updatedAt || null);
        setActivity(act.activity || []);
      } catch (err) {
        console.error('Failed to load profile:', err);
        toast.error('Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, user?.name, user?.avatar]);

  useEffect(() => {
    if (!slugValid) {
      setSlugStatus(form.slug ? 'invalid' : 'idle');
      return;
    }
    if (form.slug === lastSlugCheckedRef.current && lastSlugResultRef.current) {
      setSlugStatus(lastSlugResultRef.current);
      return;
    }
    const t = setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const res = await checkSlugAvailability(form.slug);
        const next = res.available ? 'available' : 'taken';
        lastSlugCheckedRef.current = form.slug;
        lastSlugResultRef.current = next;
        setSlugStatus(next);
      } catch {
        setSlugStatus('idle');
      }
    }, 900);
    return () => clearTimeout(t);
  }, [form.slug, slugValid]);

  useEffect(() => {
    if (!initialForm || !user?.uid) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaving(true);
      try {
        await saveProfile(user.uid, { bio: form.bio, onboarding: { ...(onboarding || {}), phone: form.phone, verticals: form.verticals } });
      } catch (err) {
        console.error('Autosave failed:', err);
      }
      setAutosaving(false);
    }, 2000);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [form.bio, form.phone, form.verticals, onboarding, initialForm, user?.uid]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleVertical = (v) => setForm((prev) => ({ ...prev, verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v] }));
  const handleCopy = async (text, field) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); } catch {}
  };
  const discardChanges = () => initialForm && setForm(initialForm);

  const handleSaveAll = async () => {
    if (!user?.uid) return;
    if (!slugValid || slugStatus === 'taken' || !phoneValid || !bioValid) { toast.error('Fix validation errors first'); return; }
    setSavingAll(true);
    try {
      if (form.displayName.trim() && form.displayName.trim() !== user?.name) await updateName(form.displayName.trim());
      await saveProfile(user.uid, {
        bio: form.bio,
        landingPageSlug: form.slug,
        avatarUrl: form.avatarUrl || '',
        onboarding: { ...(onboarding || {}), phone: form.phone, weeklySpend: form.weeklySpend, usedInbound: form.usedInbound, verticals: form.verticals, hearAbout: form.hearAbout },
      });
      setInitialForm(form);
      setLastUpdated(new Date().toISOString());
      const act = await getProfileActivity(20).catch(() => ({ activity: [] }));
      setActivity(act.activity || []);
      toast.success('Profile saved');
    } catch (e) {
      toast.error(e.message || 'Save failed');
    }
    setSavingAll(false);
  };

  const openAvatarEditor = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files allowed'); return; }
    if (file.size > MAX_AVATAR_FILE_MB * 1024 * 1024) { toast.error(`Max ${MAX_AVATAR_FILE_MB}MB`); return; }
    setAvatarSource(URL.createObjectURL(file));
    setShowAvatarModal(true);
  };
  const handleAvatarClick = () => fileInputRef.current?.click();
  const handleFileChange = (e) => openAvatarEditor(e.target.files?.[0]);
  const handleDropAvatar = (e) => { e.preventDefault(); openAvatarEditor(e.dataTransfer.files?.[0]); };

  const applyAvatar = async () => {
    if (!avatarSource || !avatarCropPixels || !user?.uid) return;
    setUploadingAvatar(true);
    setAvatarUploadProgress(10);
    try {
      const dataUrl = await getCroppedImage(avatarSource, avatarCropPixels);
      setAvatarUploadProgress(70);
      await saveProfile(user.uid, { avatarUrl: dataUrl });
      await updateAvatar(dataUrl);
      setForm((p) => ({ ...p, avatarUrl: dataUrl }));
      setInitialForm((p) => ({ ...p, avatarUrl: dataUrl }));
      setAvatarUploadProgress(100);
      setShowAvatarModal(false);
      toast.success('Avatar updated');
    } catch (e) {
      toast.error(e.message || 'Avatar update failed');
    }
    setUploadingAvatar(false);
  };

  const removeAvatar = async () => {
    if (!user?.uid) return;
    setUploadingAvatar(true);
    try {
      await saveProfile(user.uid, { avatarUrl: '' });
      await updateAvatar('');
      setForm((p) => ({ ...p, avatarUrl: '' }));
      setInitialForm((p) => ({ ...p, avatarUrl: '' }));
      setShowAvatarModal(false);
      toast.success('Avatar removed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    setRegeneratingKey(true);
    try {
      const res = await regenerateApiKey();
      setApiKey(res.apiKey || '');
      setApiKeyRotatedAt(res.apiKeyRotatedAt || new Date().toISOString());
      setShowRegenerateConfirm(false);
      const act = await getProfileActivity(20).catch(() => ({ activity: [] }));
      setActivity(act.activity || []);
      toast.success('API key regenerated');
    } catch (e) {
      toast.error(e.message || 'Failed to regenerate key');
    }
    setRegeneratingKey(false);
  };

  if (loading) return <div className={classes.profilePage}><div className={classes.loaderWrap}><Loader2 size={32} className={classes.spinner} /></div></div>;

  const maskedApiKey = apiKey ? `${apiKey.slice(0, 6)}••••••••${apiKey.slice(-4)}` : '';

  return (
    <div className={classes.profilePage}>
      <div className={classes.header}>
        <div className={classes.iconBox}><User size={24} /></div>
        <div><h2>Profile & Landing Page</h2><p>Customize your public profile for lead capture</p></div>
      </div>

      <div className={classes.twoCol}>
        <div className={classes.mainBox}>
          <h3>Your Profile</h3>
          <div className={classes.avatarRow}>
            <button type="button" className={classes.avatarBtn} onClick={handleAvatarClick} onDragOver={(e) => e.preventDefault()} onDrop={handleDropAvatar}>
              {form.avatarUrl ? <img src={form.avatarUrl} alt="Avatar" className={classes.avatarImg} /> : <span className={classes.avatarInitial}>{form.displayName?.charAt(0)?.toUpperCase() || 'A'}</span>}
              <div className={classes.avatarOverlay}>{uploadingAvatar ? <Loader2 size={20} className={classes.spinner} /> : <Camera size={20} />}</div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className={classes.hiddenInput} onChange={handleFileChange} />
            <div>
              <h4>{user?.name || 'Agent'}</h4>
              <p>{user?.email || ''}</p>
              <button type="button" className={classes.uploadBtn} onClick={handleAvatarClick}><Upload size={14} /> Open Avatar Editor</button>
            </div>
          </div>

          <div className={classes.summaryBox}>
            <div className={classes.summaryTop}><h4>Profile completeness</h4><span>{completion.score}%</span></div>
            <div className={classes.progressBar}><div className={classes.progressFill} style={{ width: `${completion.score}%` }} /></div>
            <div className={classes.checklist}>{completion.items.map((it) => <div className={classes.checkItem} key={it.label}>{it.done ? <Check size={14} /> : <X size={14} />}<span>{it.label}</span></div>)}</div>
          </div>

          <div className={classes.formGroup}>
            <label>Display Name</label>
            <div className={classes.nameField}><input type="text" value={form.displayName} onChange={(e) => setField('displayName', e.target.value)} className={classes.nameInput} /></div>
          </div>
          <div className={classes.formGroup}>
            <label>Landing Page URL</label>
            <div className={classes.urlInputGroup}><span className={classes.urlPrefix}>https://agentcalls.io/a/</span><input type="text" value={form.slug} onChange={(e) => setField('slug', normalizeSlug(e.target.value))} className={classes.urlInput} /></div>
            <div className={classes.validationText}>
              {slugStatus === 'checking' && <span>Checking availability…</span>}
              {slugStatus === 'available' && <span className={classes.valid}>Slug is available.</span>}
              {slugStatus === 'taken' && <span className={classes.invalid}>Slug is already taken.</span>}
              {slugStatus === 'invalid' && <span className={classes.invalid}>Use at least {MIN_SLUG_LEN} characters.</span>}
            </div>
          </div>
          <div className={classes.formGroup}>
            <label>Bio</label>
            <textarea className={classes.bioInput} value={form.bio} onChange={(e) => setField('bio', e.target.value)} maxLength={500} rows={4} />
            <div className={classes.charCount}>{form.bio.length}/500 characters</div>
            <div className={classes.validationText}>{bioValid ? <span className={classes.valid}>Bio looks good.</span> : <span className={classes.invalid}>Add at least 20 characters.</span>}</div>
          </div>
        </div>

        <div className={classes.accountBox}>
          <div className={classes.accountHeader}><h3>Account Details</h3></div>
          <div className={classes.editGrid}>
            <div className={classes.editGroup}>
              <label className={classes.editLabel}>Phone Number</label>
              <input className={classes.editInput} type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              <div className={classes.validationText}>{phoneValid ? <span className={classes.valid}>Phone format looks valid.</span> : <span className={classes.invalid}>Invalid phone format.</span>}</div>
            </div>
            <div className={classes.editGroup}>
              <label className={classes.editLabel}>Weekly Lead Spend</label>
              <select className={classes.editSelect} value={form.weeklySpend} onChange={(e) => setField('weeklySpend', e.target.value)}>{['', ...SPENDING_OPTIONS].map((o) => <option key={o} value={o}>{o || 'Select an option'}</option>)}</select>
            </div>
            <div className={classes.editGroup}>
              <label className={classes.editLabel}>Used Inbound Before</label>
              <div className={classes.editRadioRow}>{['Yes', 'No'].map((v) => <label key={v} className={classes.editRadio}><input type="radio" value={v} checked={form.usedInbound === v} onChange={(e) => setField('usedInbound', e.target.value)} />{v}</label>)}</div>
            </div>
            <div className={classes.editGroup}>
              <label className={classes.editLabel}>Verticals</label>
              <div className={classes.verticalChips}>{VERTICALS.map((v) => <button type="button" key={v} className={`${classes.verticalChip} ${form.verticals.includes(v) ? classes.verticalChipActive : ''}`} onClick={() => toggleVertical(v)}>{v}</button>)}</div>
            </div>
            <div className={classes.editGroup}>
              <label className={classes.editLabel}>How Did You Hear About Us</label>
              <select className={classes.editSelect} value={form.hearAbout} onChange={(e) => setField('hearAbout', e.target.value)}>{['', ...HEAR_ABOUT_OPTIONS].map((o) => <option key={o} value={o}>{o || 'Select an option'}</option>)}</select>
            </div>
          </div>
        </div>
      </div>

      <div className={classes.integrationBox}>
        <h3>Integration & Links</h3>
        <div className={classes.integrationRow}>
          <div className={classes.integrationLabel}><Link2 size={16} /><span>Webhook URL</span><span className={classes.badge}>For Integrations</span></div>
          <div className={classes.integrationField}><input type="text" readOnly value={webhookUrl} className={classes.readonlyInput} /><button type="button" className={classes.copyBtn} onClick={() => handleCopy(webhookUrl, 'webhook')}>{copiedField === 'webhook' ? <Check size={16} /> : <Copy size={16} />}</button></div>
        </div>
        <div className={classes.integrationRow}>
          <div className={classes.integrationLabel}><Key size={16} /><span>API Key</span><span className={classes.badge}>Header: X-Agent-Key</span></div>
          <div className={classes.integrationField}>
            <input type="text" readOnly value={showApiKey ? apiKey : maskedApiKey} className={classes.readonlyInput} />
            <button type="button" className={classes.copyBtn} onClick={() => setShowApiKey((s) => !s)}>{showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            <button type="button" className={classes.copyBtn} onClick={() => handleCopy(apiKey, 'apikey')}>{copiedField === 'apikey' ? <Check size={16} /> : <Copy size={16} />}</button>
          </div>
          <div className={classes.apiMetaRow}>
            <span>Last rotated: {apiKeyRotatedAt ? new Date(apiKeyRotatedAt).toLocaleString() : 'Never'}</span>
            <button type="button" className={classes.regenBtn} onClick={() => setShowRegenerateConfirm(true)}><RefreshCw size={14} /> Regenerate Key</button>
          </div>
        </div>
      </div>

      <div className={classes.auditBox}>
        <div className={classes.auditHeader}>
          <h3>Audit & Activity</h3>
          <button
            type="button"
            className={classes.auditToggleBtn}
            onClick={() => setAuditCollapsed((v) => !v)}
            aria-expanded={!auditCollapsed}
            aria-label={auditCollapsed ? 'Expand audit activity' : 'Collapse audit activity'}
          >
            <ChevronDown size={16} className={auditCollapsed ? classes.auditChevronCollapsed : ''} />
            {auditCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
        <div className={`${classes.auditContent} ${auditCollapsed ? classes.auditContentCollapsed : ''}`}>
          <div className={classes.metaRow}>
            <div className={classes.metaItem}><span>Member since</span><strong>{memberSince ? new Date(memberSince).toLocaleDateString() : 'Unknown'}</strong></div>
            <div className={classes.metaItem}><span>Last updated</span><strong>{lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Unknown'}</strong></div>
            <div className={classes.metaItem}><span>Autosave</span><strong>{autosaving ? 'Saving...' : 'Idle'}</strong></div>
          </div>
          <div className={classes.timeline}>
            {activity.length === 0 ? <p className={classes.noData}>No activity yet.</p> : activity.map((it) => <div className={classes.timelineItem} key={it.id}><ShieldCheck size={16} /><div><p>{it.message}</p><span>{it.createdAt ? new Date(it.createdAt).toLocaleString() : 'Now'}</span></div></div>)}
          </div>
        </div>
      </div>

      {isDirty && (
        <div className={classes.stickySaveBar}>
          <span className={classes.saveBarText}>You have unsaved changes</span>
          <div className={classes.saveBarActions}>
            <button type="button" onClick={discardChanges} className={classes.saveBarGhostBtn}>Discard</button>
            <button type="button" onClick={handleSaveAll} className={classes.saveBarPrimaryBtn} disabled={savingAll}>{savingAll ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </div>
      )}

      {showRegenerateConfirm && (
        <div className={classes.modalOverlay}>
          <div className={classes.modalCard}>
            <h4>Regenerate API key?</h4>
            <p>This revokes your old key immediately.</p>
            <div className={classes.modalActions}>
              <button type="button" className={classes.cancelBtn} onClick={() => setShowRegenerateConfirm(false)}>Cancel</button>
              <button type="button" className={classes.saveBtn} onClick={handleRegenerateApiKey} disabled={regeneratingKey}>{regeneratingKey ? 'Regenerating...' : 'Regenerate'}</button>
            </div>
          </div>
        </div>
      )}

      {showAvatarModal && (
        <div className={classes.modalOverlay}>
          <div className={classes.avatarModal}>
            <div className={classes.avatarCropWrap}>
              <Cropper image={avatarSource} crop={avatarCrop} zoom={avatarZoom} aspect={1} onCropChange={setAvatarCrop} onZoomChange={setAvatarZoom} onCropComplete={(_, px) => setAvatarCropPixels(px)} />
            </div>
            <div className={classes.sliderRow}><span>Zoom</span><input type="range" min={1} max={3} step={0.1} value={avatarZoom} onChange={(e) => setAvatarZoom(Number(e.target.value))} /></div>
            {uploadingAvatar && <div className={classes.uploadProgress}><div style={{ width: `${avatarUploadProgress}%` }} /></div>}
            <div className={`${classes.modalActions} ${classes.avatarModalActions}`}>
              <button type="button" className={classes.avatarActionGhost} onClick={() => setShowAvatarModal(false)}>Cancel</button>
              <button type="button" className={classes.avatarActionDanger} onClick={removeAvatar}>
                <Trash2 size={14} />
                Remove Photo
              </button>
              <button type="button" className={classes.avatarActionPrimary} onClick={applyAvatar} disabled={uploadingAvatar}>
                {uploadingAvatar ? 'Uploading...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
