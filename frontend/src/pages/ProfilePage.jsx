import { useEffect, useMemo, useRef, useState } from 'react';
import { User, Camera, Check, Loader2, X, Upload, ShieldCheck, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import { getProfileBootstrap, saveProfile, getProfileActivity } from '../services/profileService';
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_PHONE_COUNTRY,
  buildInternationalPhone,
} from '../constants/countryDialCodes';
import CustomSelect from '../components/ui/CustomSelect';
import UnsavedChangesBar from '../components/ui/UnsavedChangesBar';
import PageLoader from '../components/ui/PageLoader';
import AvatarEditorModal from '../components/modals/AvatarEditorModal';
import classes from './ProfilePage.module.css';

const SPENDING_OPTIONS = ['Less than $500', '$500 - $1,000', '$1,000 - $2,500', '$2,500 - $5,000', '$5,000+', 'Not currently spending'];
const HEAR_ABOUT_OPTIONS = ['Google Search', 'Facebook / Instagram', 'YouTube', 'Referral', 'Discord', 'Other'];
const VERTICALS = ['Final Expense', 'Spanish Final Expense', 'ACA', 'Medicare', 'Leads'];
const MAX_AVATAR_FILE_MB = 5;
const MAX_AVATAR_OUTPUT_PX = 512;

function isValidPhoneLocal(v) {
  const cleaned = String(v || '').replace(/\D/g, '');
  return cleaned.length >= 6 && cleaned.length <= 15;
}
function splitInternationalPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { phoneCountry: DEFAULT_PHONE_COUNTRY, phone: '' };
  }

  const normalized = raw.startsWith('+') ? raw : `+${raw.replace(/[^\d]/g, '')}`;
  const exactDialMatch = COUNTRY_DIAL_CODES
    .slice()
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => normalized.startsWith(c.dial));

  if (!exactDialMatch) {
    return { phoneCountry: DEFAULT_PHONE_COUNTRY, phone: raw.replace(/\D/g, '') };
  }

  return {
    phoneCountry: exactDialMatch.code,
    phone: normalized.slice(exactDialMatch.dial.length).replace(/\D/g, ''),
  };
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
  const presets = useSubtlePageMotion();
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updateName = useAuthStore((s) => s.updateName);
  const fileInputRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', phoneCountry: DEFAULT_PHONE_COUNTRY, phone: '', weeklySpend: '', usedInbound: '', verticals: [], hearAbout: '', avatarUrl: '' });
  const [initialForm, setInitialForm] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
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

  const bioValid = form.bio.trim().length >= 20 && form.bio.trim().length <= 500;
  const phoneValid = !form.phone || isValidPhoneLocal(form.phone);

  const isDirty = useMemo(() => initialForm ? JSON.stringify(form) !== JSON.stringify(initialForm) : false, [form, initialForm]);
  const completion = useMemo(() => {
    const items = [
      { label: 'Photo uploaded', done: Boolean(form.avatarUrl || user?.avatar) },
      { label: 'Bio completed', done: bioValid },
      { label: 'Phone valid', done: phoneValid && Boolean(form.phone) },
      { label: 'Vertical selected', done: form.verticals.length > 0 },
    ];
    const done = items.filter((i) => i.done).length;
    return { items, score: Math.round((done / items.length) * 100) };
  }, [form, user?.avatar, bioValid, phoneValid]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const boot = await getProfileBootstrap(user.uid);
        const profile = boot?.profile || {};
        const act = { activity: Array.isArray(boot?.activity) ? boot.activity : [] };
        if (cancelled) return;
        const onboardingData = profile?.onboarding || {};
        const verticals = onboardingData.verticals ? (Array.isArray(onboardingData.verticals) ? onboardingData.verticals : String(onboardingData.verticals).split(',').map((v) => v.trim()).filter(Boolean)) : [];
        const phoneParts = splitInternationalPhone(onboardingData.phone || '');
        const next = {
          displayName: user.name || '',
          bio: profile?.bio || '',
          phoneCountry: phoneParts.phoneCountry,
          phone: phoneParts.phone,
          weeklySpend: onboardingData.weeklySpend || '',
          usedInbound: onboardingData.usedInbound || '',
          verticals,
          hearAbout: onboardingData.hearAbout || '',
          avatarUrl: profile?.avatarUrl || user?.avatar || '',
        };
        setForm(next);
        setInitialForm(next);
        setOnboarding(onboardingData);
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
    if (!initialForm || !user?.uid) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaving(true);
      try {
        await saveProfile(user.uid, {
          bio: form.bio,
          onboarding: {
            ...(onboarding || {}),
            phone: buildInternationalPhone(form.phoneCountry, form.phone),
            verticals: form.verticals,
          },
        });
      } catch (err) {
        console.error('Autosave failed:', err);
      }
      setAutosaving(false);
    }, 2000);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [form.bio, form.phoneCountry, form.phone, form.verticals, onboarding, initialForm, user?.uid]);

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleVertical = (v) => setForm((prev) => ({ ...prev, verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v] }));
  const discardChanges = () => initialForm && setForm(initialForm);

  const handleSaveAll = async () => {
    if (!user?.uid) return;
    if (!phoneValid || !bioValid) { toast.error('Fix validation errors first'); return; }
    setSavingAll(true);
    try {
      if (form.displayName.trim() && form.displayName.trim() !== user?.name) await updateName(form.displayName.trim());
      await saveProfile(user.uid, {
        bio: form.bio,
        avatarUrl: form.avatarUrl || '',
        onboarding: {
          ...(onboarding || {}),
          phone: buildInternationalPhone(form.phoneCountry, form.phone),
          weeklySpend: form.weeklySpend,
          usedInbound: form.usedInbound,
          verticals: form.verticals,
          hearAbout: form.hearAbout,
        },
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

  if (loading) return <PageLoader />;

  return (
    <>
      <motion.div
        className={classes.page}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={classes.pageHeader} variants={presets.child}>
          <div className={classes.iconBox} aria-hidden="true">
            <User size={20} />
          </div>
          <div>
            <h2>Profile</h2>
            <p>Display name, photo, and account preferences</p>
          </div>
        </motion.div>

        <motion.div className={classes.twoCol} variants={presets.child}>
          <section className={`glass ${classes.profileCard}`}>
            <div className={classes.cardHeader}>
              <div className={classes.cardHeaderText}>
                <h3>Your Profile</h3>
                <p>Photo, bio, and contact details</p>
              </div>
            </div>
            <div className={classes.cardDivider} />

            <div className={classes.avatarRow}>
              <button type="button" className={classes.avatarBtn} onClick={handleAvatarClick} onDragOver={(e) => e.preventDefault()} onDrop={handleDropAvatar}>
                {form.avatarUrl ? <img src={form.avatarUrl} alt="Avatar" className={classes.avatarImg} /> : <span className={classes.avatarInitial}>{form.displayName?.charAt(0)?.toUpperCase() || 'A'}</span>}
                <div className={classes.avatarOverlay}>{uploadingAvatar ? <Loader2 size={20} className={classes.spinner} /> : <Camera size={20} />}</div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className={classes.hiddenInput} onChange={handleFileChange} />
              <div className={classes.avatarMeta}>
                <h4>{user?.name || 'Agent'}</h4>
                <p>{user?.email || ''}</p>
                <button type="button" className={classes.uploadBtn} onClick={handleAvatarClick}>
                  <Upload size={14} />
                  Open Avatar Editor
                </button>
              </div>
            </div>

            <div className={classes.completenessPanel}>
              <div className={classes.completenessTop}>
                <h4>Profile completeness</h4>
                <span>{completion.score}%</span>
              </div>
              <div className={classes.progressBar}>
                <div className={classes.progressFill} style={{ width: `${completion.score}%` }} />
              </div>
              <div className={classes.checklist}>
                {completion.items.map((it) => (
                  <div className={`${classes.checkItem} ${it.done ? classes.checkItemDone : ''}`} key={it.label}>
                    {it.done ? <Check size={14} /> : <X size={14} />}
                    <span>{it.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={classes.formGroup}>
              <label htmlFor="displayName">Display Name</label>
              <input id="displayName" type="text" value={form.displayName} onChange={(e) => setField('displayName', e.target.value)} className={classes.textInput} />
            </div>
            <div className={classes.formGroup}>
              <label htmlFor="bio">Bio</label>
              <textarea id="bio" className={classes.bioInput} value={form.bio} onChange={(e) => setField('bio', e.target.value)} maxLength={500} rows={4} />
              <div className={classes.charCount}>{form.bio.length}/500 characters</div>
              <div className={classes.validationText}>
                {bioValid ? <span className={classes.valid}>Bio looks good.</span> : <span className={classes.invalid}>Add at least 20 characters.</span>}
              </div>
            </div>
          </section>

          <section className={`glass ${classes.accountCard}`}>
            <div className={classes.cardHeader}>
              <div className={classes.cardHeaderText}>
                <h3>Account Details</h3>
                <p>Contact info and onboarding preferences</p>
              </div>
            </div>
            <div className={classes.cardDivider} />

            <div className={classes.editGrid}>
              <div className={classes.editGroup}>
                <label className={classes.editLabel} htmlFor="phoneCountry">Phone Number</label>
                <div className={classes.profilePhoneRow}>
                  <select
                    id="phoneCountry"
                    className={classes.profileCountrySelect}
                    value={form.phoneCountry}
                    onChange={(e) => setField('phoneCountry', e.target.value)}
                    aria-label="Phone country"
                  >
                    {COUNTRY_DIAL_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.dial})
                      </option>
                    ))}
                  </select>
                  <input
                    className={classes.profilePhoneInput}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="Mobile number (no country code)"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                </div>
                <div className={classes.validationText}>
                  {phoneValid ? <span className={classes.valid}>Phone format looks valid.</span> : <span className={classes.invalid}>Invalid phone format.</span>}
                </div>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Weekly Lead Spend</label>
                <CustomSelect
                  className={classes.profileSelect}
                  options={['', ...SPENDING_OPTIONS].map((o) => ({ value: o, label: o || 'Select an option' }))}
                  value={form.weeklySpend}
                  onChange={(v) => setField('weeklySpend', v)}
                  placeholder="Select an option"
                />
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Used Inbound Before</label>
                <div className={classes.editRadioRow}>
                  {['Yes', 'No'].map((v) => (
                    <label key={v} className={`${classes.editRadio} ${form.usedInbound === v ? classes.editRadioActive : ''}`}>
                      <input type="radio" value={v} checked={form.usedInbound === v} onChange={(e) => setField('usedInbound', e.target.value)} />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Verticals</label>
                <div className={classes.chipTray}>
                  <div className={classes.verticalChips}>
                    {VERTICALS.map((v) => (
                      <button type="button" key={v} className={`${classes.verticalChip} ${form.verticals.includes(v) ? classes.verticalChipActive : ''}`} onClick={() => toggleVertical(v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>How Did You Hear About Us</label>
                <CustomSelect
                  className={classes.profileSelect}
                  options={['', ...HEAR_ABOUT_OPTIONS].map((o) => ({ value: o, label: o || 'Select an option' }))}
                  value={form.hearAbout}
                  onChange={(v) => setField('hearAbout', v)}
                  placeholder="Select an option"
                />
              </div>
            </div>
          </section>
        </motion.div>

        <motion.section className={`glass ${classes.auditSection}`} variants={presets.child}>
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
              <div className={classes.metaItem}>
                <span>Member since</span>
                <strong>{memberSince ? new Date(memberSince).toLocaleDateString() : 'Unknown'}</strong>
              </div>
              <div className={classes.metaItem}>
                <span>Last updated</span>
                <strong>{lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Unknown'}</strong>
              </div>
              <div className={classes.metaItem}>
                <span>Autosave</span>
                <strong>{autosaving ? 'Saving...' : 'Idle'}</strong>
              </div>
            </div>
            <div className={classes.timeline}>
              {activity.length === 0 ? (
                <p className={classes.noData}>No activity yet.</p>
              ) : (
                activity.map((it) => (
                  <div className={classes.timelineItem} key={it.id}>
                    <ShieldCheck size={16} />
                    <div>
                      <p>{it.message}</p>
                      <span>{it.createdAt ? new Date(it.createdAt).toLocaleString() : 'Now'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.section>

        <div className={`glass ${classes.unsavedWrap}`}>
          <UnsavedChangesBar
            visible={isDirty}
            onDiscard={discardChanges}
            onSave={handleSaveAll}
            saving={savingAll}
          />
        </div>
      </motion.div>

      <AvatarEditorModal
        isOpen={showAvatarModal}
        avatarSource={avatarSource}
        avatarCrop={avatarCrop}
        avatarZoom={avatarZoom}
        uploadingAvatar={uploadingAvatar}
        avatarUploadProgress={avatarUploadProgress}
        onClose={() => setShowAvatarModal(false)}
        onCropChange={setAvatarCrop}
        onZoomChange={setAvatarZoom}
        onCropComplete={(_, px) => setAvatarCropPixels(px)}
        onApply={applyAvatar}
        onRemove={removeAvatar}
      />
    </>
  );
};

export default ProfilePage;
