import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings, Mic, Volume2, User, Shield, Download, LogOut,
  Trash2, Eye, EyeOff, Loader2, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import {
  loadSettings, saveSettings, exportUserData, revokeAllSessions,
} from '../services/settingsService';
import classes from './SettingsPage.module.css';

const SettingsPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const updateName = useAuthStore((s) => s.updateName);
  const updateEmailAddress = useAuthStore((s) => s.updateEmailAddress);
  const changePassword = useAuthStore((s) => s.changePassword);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [loading, setLoading] = useState(true);

  // Audio state
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const micStreamRef = useRef(null);
  const micAnimRef = useRef(null);

  // Account state
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Privacy state
  const [revoking, setRevoking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isPasswordUser = user?.authProvider === 'password';

  // Load saved settings & enumerate devices
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const saved = await loadSettings(user.uid);
        if (saved.audioInputDeviceId) setSelectedInput(saved.audioInputDeviceId);
        if (saved.audioOutputDeviceId) setSelectedOutput(saved.audioOutputDeviceId);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
      setDisplayName(user.name || '');
      setEmail(user.email || '');
      await enumerateDevices();
      setLoading(false);
    })();
  }, [user?.uid]);

  const enumerateDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch {
      toast.error('Microphone permission denied');
    }
  };

  const handleDeviceChange = async (type, deviceId) => {
    if (type === 'input') setSelectedInput(deviceId);
    else setSelectedOutput(deviceId);

    const key = type === 'input' ? 'audioInputDeviceId' : 'audioOutputDeviceId';
    try {
      await saveSettings(user.uid, {
        ...(type === 'input' ? { audioInputDeviceId: deviceId } : {}),
        ...(type === 'output' ? { audioOutputDeviceId: deviceId } : {}),
      });
    } catch (err) {
      console.error('Failed to save device:', err);
      toast.error('Failed to save device preference');
    }
  };

  const stopMicTest = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
    }
    setMicLevel(0);
    setTestingMic(false);
  }, []);

  const startMicTest = async () => {
    if (testingMic) { stopMicTest(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInput ? { deviceId: { exact: selectedInput } } : true,
      });
      micStreamRef.current = stream;
      setTestingMic(true);

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(avg / 128, 1));
        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();

      setTimeout(() => stopMicTest(), 5000);
    } catch {
      toast.error('Could not access microphone');
    }
  };

  const testSpeaker = async () => {
    try {
      const ctx = new AudioContext();
      if (selectedOutput && ctx.setSinkId) {
        await ctx.setSinkId(selectedOutput);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 300);
    } catch {
      toast.error('Could not play test tone');
    }
  };

  // Account handlers
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

  const handleUpdateEmail = async () => {
    if (!email.trim() || !emailPassword) return;
    setSavingEmail(true);
    try {
      await updateEmailAddress(email.trim(), emailPassword);
      setEmailPassword('');
      toast.success('Email updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update email');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) return;
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSavingPw(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) return;
    setDeleting(true);
    try {
      await deleteAccount(deletePw);
      toast.success('Account deleted');
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  // Privacy handlers
  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      await revokeAllSessions(token);
      toast.success('All sessions revoked — logging out');
      setTimeout(() => logout(), 1000);
    } catch (err) {
      toast.error(err.message || 'Failed to revoke sessions');
    } finally {
      setRevoking(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportUserData(user.uid);
      toast.success('Data exported');
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className={classes.settingsPage}>
        <div className={classes.loaderWrap}>
          <Loader2 size={32} className={classes.spinner} />
        </div>
      </div>
    );
  }

  const sessionMeta = (() => {
    try {
      const ua = navigator.userAgent;
      let browser = 'Unknown browser';
      if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
      else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
      else if (ua.includes('Firefox')) browser = 'Firefox';
      else if (ua.includes('Edg')) browser = 'Edge';
      const os = ua.includes('Mac') ? 'macOS' : ua.includes('Win') ? 'Windows' : ua.includes('Linux') ? 'Linux' : 'Unknown OS';
      return `${browser} on ${os}`;
    } catch { return 'Unknown'; }
  })();

  return (
    <div className={classes.settingsPage}>
      <div className={classes.header}>
        <div className={classes.iconBox}><Settings size={24} /></div>
        <div>
          <h2>Settings</h2>
          <p>Manage your devices, account, and privacy</p>
        </div>
      </div>

      {/* ── Audio Devices ── */}
      <div className={classes.card}>
        <h3><Mic size={18} /> Audio Devices</h3>

        <div className={classes.fieldGroup}>
          <label>Microphone</label>
          <select
            value={selectedInput}
            onChange={(e) => handleDeviceChange('input', e.target.value)}
            className={classes.select}
          >
            <option value="">System Default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <div className={classes.testRow}>
            <button type="button" className={classes.testBtn} onClick={startMicTest}>
              {testingMic ? 'Stop Test' : 'Test Microphone'}
            </button>
            {testingMic && (
              <div className={classes.meterTrack}>
                <div className={classes.meterFill} style={{ width: `${micLevel * 100}%` }} />
              </div>
            )}
          </div>
        </div>

        <div className={classes.fieldGroup}>
          <label>Speaker</label>
          <select
            value={selectedOutput}
            onChange={(e) => handleDeviceChange('output', e.target.value)}
            className={classes.select}
          >
            <option value="">System Default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <button type="button" className={classes.testBtn} onClick={testSpeaker}>
            <Volume2 size={14} /> Test Speaker
          </button>
        </div>
      </div>

      {/* ── Account ── */}
      <div className={classes.card}>
        <h3><User size={18} /> Account</h3>

        <div className={classes.fieldGroup}>
          <label>Display Name</label>
          <div className={classes.inlineField}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={classes.input}
            />
            <button
              type="button"
              className={classes.saveBtn}
              onClick={handleSaveName}
              disabled={savingName || displayName.trim() === user?.name}
            >
              {savingName ? <Loader2 size={14} className={classes.spinner} /> : 'Save'}
            </button>
          </div>
        </div>

        {isPasswordUser && (
          <>
            <div className={classes.fieldGroup}>
              <label>Email Address</label>
              <div className={classes.inlineField}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={classes.input}
                />
              </div>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Current password to confirm"
                className={classes.input}
                style={{ marginTop: 8 }}
              />
              <button
                type="button"
                className={classes.saveBtn}
                onClick={handleUpdateEmail}
                disabled={savingEmail || !emailPassword || email === user?.email}
                style={{ marginTop: 8 }}
              >
                {savingEmail ? <Loader2 size={14} className={classes.spinner} /> : 'Update Email'}
              </button>
            </div>

            <div className={classes.fieldGroup}>
              <label>Change Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="Current password"
                className={classes.input}
              />
              <div className={classes.passwordField}>
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="New password"
                  className={classes.input}
                />
                <button
                  type="button"
                  className={classes.eyeBtn}
                  onClick={() => setShowNewPw(!showNewPw)}
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                className={classes.input}
              />
              <button
                type="button"
                className={classes.saveBtn}
                onClick={handleChangePassword}
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                style={{ marginTop: 8 }}
              >
                {savingPw ? <Loader2 size={14} className={classes.spinner} /> : 'Change Password'}
              </button>
            </div>
          </>
        )}

        {!isPasswordUser && (
          <p className={classes.oauthNote}>
            Email and password are managed by your Google account.
          </p>
        )}
      </div>

      {/* ── Privacy & Security ── */}
      <div className={classes.card}>
        <h3><Shield size={18} /> Privacy & Security</h3>

        <div className={classes.fieldGroup}>
          <div className={classes.toggleRow}>
            <div>
              <span className={classes.toggleLabel}>Two-Factor Authentication</span>
              <span className={classes.comingSoon}>Coming Soon</span>
            </div>
            <button type="button" className={classes.toggle} disabled>
              <span className={classes.toggleThumb} />
            </button>
          </div>
        </div>

        <div className={classes.fieldGroup}>
          <label>Active Session</label>
          <p className={classes.sessionInfo}>{sessionMeta}</p>
          <button
            type="button"
            className={classes.outlineBtn}
            onClick={handleRevokeAll}
            disabled={revoking}
          >
            <LogOut size={14} />
            {revoking ? 'Revoking...' : 'Sign Out All Devices'}
          </button>
        </div>

        <div className={classes.fieldGroup}>
          <label>Export Data</label>
          <button
            type="button"
            className={classes.outlineBtn}
            onClick={handleExport}
            disabled={exporting}
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Download My Data'}
          </button>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      {isPasswordUser && (
        <div className={`${classes.card} ${classes.dangerCard}`}>
          <h3><Trash2 size={18} /> Danger Zone</h3>
          <p className={classes.dangerText}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              type="button"
              className={classes.dangerBtn}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </button>
          ) : (
            <div className={classes.deleteConfirm}>
              <input
                type="password"
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                placeholder="Enter password to confirm"
                className={classes.input}
              />
              <div className={classes.deleteActions}>
                <button
                  type="button"
                  className={classes.dangerBtn}
                  onClick={handleDeleteAccount}
                  disabled={deleting || !deletePw}
                >
                  {deleting ? <Loader2 size={14} className={classes.spinner} /> : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  className={classes.cancelBtn}
                  onClick={() => { setShowDeleteConfirm(false); setDeletePw(''); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
