import React, { useState, useEffect, useRef } from 'react';
import { User, Camera, Copy, Check, Link2, Key, Loader2, Phone, DollarSign, PhoneIncoming, Layers, Megaphone, CalendarDays, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {
  getProfile,
  saveProfile,
  compressAvatar,
  getOrCreateApiKey,
} from '../services/profileService';
import classes from './ProfilePage.module.css';

const SPENDING_OPTIONS = [
  'Less than $500',
  '$500 - $1,000',
  '$1,000 - $2,500',
  '$2,500 - $5,000',
  '$5,000+',
  'Not currently spending',
];

const HEAR_ABOUT_OPTIONS = [
  'Google Search',
  'Facebook / Instagram',
  'YouTube',
  'Referral',
  'Discord',
  'Other',
];

const VERTICALS = [
  'Final Expense',
  'Spanish Final Expense',
  'ACA',
  'Medicare',
  'Leads',
];

const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const updateName = useAuthStore((s) => s.updateName);

  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [bio, setBio] = useState('');
  const [slug, setSlug] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [copiedField, setCopiedField] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    weeklySpend: '',
    usedInbound: '',
    verticals: '',
    hearAbout: '',
  });

  const webhookUrl = 'https://api.agentcalls.io/api/leads/webhook';

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    (async () => {
      try {
        const [profile, key] = await Promise.all([
          getProfile(user.uid),
          getOrCreateApiKey(user.uid),
        ]);
        if (cancelled) return;

        setDisplayName(user.name || '');
        if (profile) {
          setBio(profile.bio || '');
          setSlug(profile.landingPageSlug || user.name?.toLowerCase().replace(/\s+/g, '') || '');
          if (profile.avatarUrl) setAvatarPreview(profile.avatarUrl);
          if (profile.onboarding) setOnboarding(profile.onboarding);
        } else {
          setSlug(user.name?.toLowerCase().replace(/\s+/g, '') || '');
        }
        setApiKey(key);
      } catch (err) {
        console.error('Failed to load profile:', err);
        toast.error('Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid]);

  useEffect(() => {
    if (user?.avatar && !avatarPreview) {
      setAvatarPreview(user.avatar);
    }
  }, [user?.avatar]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);
    setUploading(true);

    try {
      const dataUrl = await compressAvatar(file);
      await updateAvatar(dataUrl);
      await saveProfile(user.uid, { avatarUrl: dataUrl });
      setAvatarPreview(dataUrl);
      toast.success('Avatar updated');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      toast.error('Avatar upload failed');
      setAvatarPreview(user.avatar || null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      await updateName(displayName.trim());
      toast.success('Display name updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await saveProfile(user.uid, {
        bio,
        landingPageSlug: slug,
      });
      toast.success('Profile saved');
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const startEditing = () => {
    setEditForm({
      phone: onboarding?.phone || '',
      weeklySpend: onboarding?.weeklySpend || '',
      usedInbound: onboarding?.usedInbound || '',
      verticals: onboarding?.verticals || '',
      hearAbout: onboarding?.hearAbout || '',
    });
    setEditingAccount(true);
  };

  const cancelEditing = () => setEditingAccount(false);

  const updateField = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }));

  const handleSaveAccount = async () => {
    if (!user?.uid) return;
    setSavingAccount(true);
    try {
      const updated = {
        ...onboarding,
        ...editForm,
      };
      await saveProfile(user.uid, { onboarding: updated });
      setOnboarding(updated);
      setEditingAccount(false);
      toast.success('Account details saved');
    } catch (err) {
      console.error('Save account failed:', err);
      toast.error('Failed to save account details');
    } finally {
      setSavingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className={classes.profilePage}>
        <div className={classes.loaderWrap}>
          <Loader2 size={32} className={classes.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.profilePage}>
      <div className={classes.header}>
        <div className={classes.iconBox}><User size={24} /></div>
        <div>
          <h2>Profile & Landing Page</h2>
          <p>Customize your public profile for lead capture</p>
        </div>
      </div>

      <div className={classes.twoCol}>
        <div className={classes.mainBox}>
          <h3>Your Profile</h3>
          <div className={classes.avatarRow}>
            <button
              type="button"
              className={classes.avatarBtn}
              onClick={handleAvatarClick}
              disabled={uploading}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className={classes.avatarImg} />
              ) : (
                <span className={classes.avatarInitial}>
                  {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              )}
              <div className={classes.avatarOverlay}>
                {uploading ? <Loader2 size={20} className={classes.spinner} /> : <Camera size={20} />}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={classes.hiddenInput}
              onChange={handleFileChange}
            />
            <div>
              <h4>{user?.name || 'Agent'}</h4>
              <p>{user?.email || ''}</p>
              <button
                type="button"
                className={classes.uploadBtn}
                onClick={handleAvatarClick}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Click avatar to upload a photo'}
              </button>
            </div>
          </div>

          <div className={classes.formGroup}>
            <label>Display Name</label>
            <div className={classes.nameField}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={classes.nameInput}
                placeholder="Your display name"
              />
              <button
                type="button"
                className={classes.nameSaveBtn}
                onClick={handleSaveName}
                disabled={savingName || displayName.trim() === user?.name}
              >
                {savingName ? <Loader2 size={14} className={classes.spinner} /> : 'Save'}
              </button>
            </div>
          </div>

          <div className={classes.formGroup}>
            <label>Landing Page URL</label>
            <div className={classes.urlInputGroup}>
              <span className={classes.urlPrefix}>https://agentcalls.io/a/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                className={classes.urlInput}
              />
            </div>
          </div>

          <div className={classes.formGroup}>
            <label>Bio</label>
            <textarea
              className={classes.bioInput}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Licensed insurance agent specializing in..."
            />
            <div className={classes.charCount}>{bio.length}/500 characters</div>
          </div>

          <button
            type="button"
            className={classes.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div className={classes.accountBox}>
          <div className={classes.accountHeader}>
            <h3>Account Details</h3>
            {onboarding && !editingAccount && (
              <button type="button" className={classes.editBtn} onClick={startEditing}>
                <Pencil size={14} />
                Edit
              </button>
            )}
            {editingAccount && (
              <button type="button" className={classes.cancelBtn} onClick={cancelEditing}>
                <X size={14} />
                Cancel
              </button>
            )}
          </div>

          {editingAccount ? (
            <div className={classes.editGrid}>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Phone Number</label>
                <input
                  className={classes.editInput}
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Weekly Lead Spend</label>
                <select
                  className={classes.editSelect}
                  value={editForm.weeklySpend}
                  onChange={(e) => updateField('weeklySpend', e.target.value)}
                >
                  <option value="" disabled>Select an option</option>
                  {SPENDING_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Used Inbound Before</label>
                <div className={classes.editRadioRow}>
                  {['Yes', 'No'].map((val) => (
                    <label key={val} className={classes.editRadio}>
                      <input
                        type="radio"
                        name="editInbound"
                        value={val}
                        checked={editForm.usedInbound === val}
                        onChange={(e) => updateField('usedInbound', e.target.value)}
                      />
                      {val}
                    </label>
                  ))}
                </div>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>Verticals</label>
                <select
                  className={classes.editSelect}
                  value={editForm.verticals}
                  onChange={(e) => updateField('verticals', e.target.value)}
                >
                  <option value="" disabled>Select a vertical</option>
                  {VERTICALS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className={classes.editGroup}>
                <label className={classes.editLabel}>How Did You Hear About Us</label>
                <select
                  className={classes.editSelect}
                  value={editForm.hearAbout}
                  onChange={(e) => updateField('hearAbout', e.target.value)}
                >
                  <option value="" disabled>Select an option</option>
                  {HEAR_ABOUT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={classes.saveAccountBtn}
                onClick={handleSaveAccount}
                disabled={savingAccount}
              >
                {savingAccount ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          ) : onboarding ? (
            <div className={classes.detailsGrid}>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><Phone size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Phone Number</span>
                  <span className={classes.detailValue}>{onboarding.phone || 'Not provided'}</span>
                </div>
              </div>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><DollarSign size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Weekly Lead Spend</span>
                  <span className={classes.detailValue}>{onboarding.weeklySpend || 'Not provided'}</span>
                </div>
              </div>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><PhoneIncoming size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Used Inbound Before</span>
                  <span className={classes.detailValue}>{onboarding.usedInbound || 'Not provided'}</span>
                </div>
              </div>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><Layers size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Verticals</span>
                  <span className={classes.detailValue}>{onboarding.verticals || 'Not provided'}</span>
                </div>
              </div>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><Megaphone size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Heard About Us</span>
                  <span className={classes.detailValue}>{onboarding.hearAbout || 'Not provided'}</span>
                </div>
              </div>
              <div className={classes.detailItem}>
                <div className={classes.detailIcon}><CalendarDays size={16} /></div>
                <div>
                  <span className={classes.detailLabel}>Member Since</span>
                  <span className={classes.detailValue}>
                    {onboarding.completedAt
                      ? new Date(onboarding.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className={classes.noData}>No onboarding data available</p>
          )}
        </div>
      </div>

      <div className={classes.integrationBox}>
        <h3>Integration & Links</h3>

        <div className={classes.integrationRow}>
          <div className={classes.integrationLabel}>
            <Link2 size={16} />
            <span>Webhook URL</span>
            <span className={classes.badge}>For Integrations</span>
          </div>
          <div className={classes.integrationField}>
            <input type="text" readOnly value={webhookUrl} className={classes.readonlyInput} />
            <button
              type="button"
              className={classes.copyBtn}
              onClick={() => handleCopy(webhookUrl, 'webhook')}
            >
              {copiedField === 'webhook' ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className={classes.integrationRow}>
          <div className={classes.integrationLabel}>
            <Key size={16} />
            <span>API Key</span>
            <span className={classes.badge}>Header: X-Agent-Key</span>
          </div>
          <div className={classes.integrationField}>
            <input type="text" readOnly value={apiKey} className={classes.readonlyInput} />
            <button
              type="button"
              className={classes.copyBtn}
              onClick={() => handleCopy(apiKey, 'apikey')}
            >
              {copiedField === 'apikey' ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
