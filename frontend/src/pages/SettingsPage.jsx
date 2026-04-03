import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings, Mic, Volume2, Shield, Download, LogOut,
  Trash2, Loader2,
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
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [loading, setLoading] = useState(true);

  // Audio state
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [micGain, setMicGain] = useState(100);
  const [testingMic, setTestingMic] = useState(false);
  const micStreamRef = useRef(null);
  const micAnimRef = useRef(null);
  const gainNodeRef = useRef(null);

  // Danger zone state
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
        if (saved.micGain != null) setMicGain(saved.micGain);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
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

  const handleGainChange = async (value) => {
    setMicGain(value);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value / 100;
    }
    try {
      await saveSettings(user.uid, { micGain: value });
    } catch (err) {
      console.error('Failed to save mic gain:', err);
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
    gainNodeRef.current = null;
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
      const gainNode = ctx.createGain();
      gainNode.gain.value = micGain / 100;
      gainNodeRef.current = gainNode;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(gainNode).connect(analyser);
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
          <p>Manage your devices and privacy</p>
        </div>
      </div>

      <div className={classes.twoCol}>
        {/* ── Audio Devices (left) ── */}
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
            <div className={classes.gainRow}>
              <label className={classes.gainLabel}>Gain</label>
              <input
                type="range"
                min={0}
                max={200}
                value={micGain}
                onChange={(e) => handleGainChange(Number(e.target.value))}
                className={classes.gainSlider}
              />
              <span className={classes.gainValue}>{micGain}%</span>
            </div>
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

        {/* ── Privacy & Security (right) ── */}
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
