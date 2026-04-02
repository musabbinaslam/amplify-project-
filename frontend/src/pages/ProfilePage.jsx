import React, { useState, useEffect, useRef } from 'react';
import { User, Camera, Copy, Check, Link2, Key, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {
  getProfile,
  saveProfile,
  compressAvatar,
  getOrCreateApiKey,
} from '../services/profileService';
import classes from './ProfilePage.module.css';

const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);

  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bio, setBio] = useState('');
  const [slug, setSlug] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [copiedField, setCopiedField] = useState(null);

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

        if (profile) {
          setBio(profile.bio || '');
          setSlug(profile.landingPageSlug || user.name?.toLowerCase().replace(/\s+/g, '') || '');
          if (profile.avatarUrl) setAvatarPreview(profile.avatarUrl);
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
