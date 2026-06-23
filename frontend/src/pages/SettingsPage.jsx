import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Settings, Mic, Volume2, Shield, Download, LogOut,
  Trash2, Loader2, RefreshCw, AlertTriangle, SlidersHorizontal,
  Palette, RotateCcw, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import useDialerStore from '../store/useDialerStore';
import { useThemeStore, DEFAULT_BRAND } from '../store/themeStore';
import { exportUserData, revokeAllSessions } from '../services/settingsService';
import { saveProfile, getProfile } from '../services/profileService';
import { usePersistedAudioSettings } from '../hooks/usePersistedAudioSettings';
import CustomSelect from '../components/ui/CustomSelect';
import UnsavedChangesBar from '../components/ui/UnsavedChangesBar';
import PageLoader from '../components/ui/PageLoader';
import classes from './SettingsPage.module.css';

const BRAND_PRESETS = [
  { value: DEFAULT_BRAND, label: 'Green' },
  { value: '#00e3fd', label: 'Cyan' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ff7351', label: 'Orange' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#ffcf33', label: 'Amber' },
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

const SECTION_META = [
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'account', label: 'Account', icon: Trash2, danger: true },
];

const SettingsPage = () => {
  const presets = useSubtlePageMotion();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const {
    audio: staged,
    savedAudio: saved,
    hydrate,
    setAudioPartial: updateStaged,
    resetAudioToSaved,
    saveAudioNow,
  } = usePersistedAudioSettings();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');

  // Audio state
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const micStreamRef = useRef(null);
  const micAnimRef = useRef(null);
  const gainNodeRef = useRef(null);
  const micCtxRef = useRef(null);
  const speakerCtxRef = useRef(null);
  const [deviceState, setDeviceState] = useState('loading');
  const [deviceMessage, setDeviceMessage] = useState('');
  const [hasMediaApi, setHasMediaApi] = useState(true);
  const sinkIdSupported =
    typeof window !== 'undefined'
      && typeof HTMLMediaElement !== 'undefined'
      && 'setSinkId' in HTMLMediaElement.prototype;
  const supportsConstraints = typeof navigator !== 'undefined' && navigator?.mediaDevices?.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints()
    : {};
  const supportsNoiseSuppression = !!supportsConstraints.noiseSuppression;
  const supportsEchoCancellation = !!supportsConstraints.echoCancellation;

  // Danger zone state
  const [deletePw, setDeletePw] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Privacy state
  const [revoking, setRevoking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState('audio');

  const isPasswordUser = user?.authProvider === 'password';
  const canDelete = deletePw.trim().length > 0 && deletePhrase.trim().toUpperCase() === 'DELETE';
  const audioDirty = useMemo(() => {
    if (!saved) return false;
    return JSON.stringify(staged) !== JSON.stringify(saved);
  }, [staged, saved]);

  // Appearance (brand color) state
  const brandColor = useThemeStore((s) => s.brandColor);
  const setBrandColor = useThemeStore((s) => s.setBrandColor);
  const [savedBrand, setSavedBrand] = useState(brandColor);
  const [hexInput, setHexInput] = useState(brandColor);
  const brandDirty = useMemo(
    () => brandColor.toLowerCase() !== (savedBrand || DEFAULT_BRAND).toLowerCase(),
    [brandColor, savedBrand],
  );
  const isDirty = audioDirty || brandDirty;

  const patchStaged = (partial) => {
    updateStaged(partial);
    setSavedLabel('Unsaved changes');
  };

  // Load saved settings & enumerate devices
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        await hydrate(user.uid);
        setSavedLabel('Saved');
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
      try {
        const profile = await getProfile(user.uid);
        const serverHex = HEX_RE.test(profile?.brandColor || '')
          ? profile.brandColor.toLowerCase()
          : DEFAULT_BRAND;
        setSavedBrand(serverHex);
        if (serverHex !== useThemeStore.getState().brandColor) {
          setBrandColor(serverHex);
        }
        setHexInput(useThemeStore.getState().brandColor);
      } catch (err) {
        console.error('Failed to load profile brand color:', err);
      }
      await enumerateDevices();
      setLoading(false);
    })();
  }, [user?.uid, hydrate, setBrandColor]);

  // Keep the hex text field in sync when brandColor changes via swatch / preset
  useEffect(() => {
    setHexInput(brandColor);
  }, [brandColor]);

  const enumerateDevices = async () => {
    if (!navigator?.mediaDevices) {
      setHasMediaApi(false);
      setDeviceState('unsupported');
      setDeviceMessage('Media devices are not supported in this browser.');
      return;
    }
    setHasMediaApi(true);
    setDeviceState('loading');
    setDeviceMessage('Loading devices...');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setInputDevices(inputs);
      setOutputDevices(outputs);
      if (inputs.length === 0) {
        setDeviceState('no-input-devices');
        setDeviceMessage('No microphone detected. Plug in a microphone and click refresh.');
      } else if (outputs.length === 0) {
        setDeviceState('no-output-devices');
        setDeviceMessage('No speaker output detected. You can still use system default audio.');
      } else {
        setDeviceState('ready');
        setDeviceMessage('');
      }
    } catch (err) {
      setDeviceState('permission-blocked');
      setDeviceMessage(
        'Microphone permission is blocked. Enable microphone access in browser site settings, then refresh devices.',
      );
      if (err?.name !== 'NotAllowedError') {
        toast.error('Could not enumerate audio devices');
      }
    }
  };

  const handleGainChange = (value) => {
    patchStaged({ micGain: value });
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value / 100;
    }
  };

  const handleDeviceChange = (type, deviceId) => {
    patchStaged(type === 'input' ? { audioInputDeviceId: deviceId } : { audioOutputDeviceId: deviceId });
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
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopMicTest();
    if (speakerCtxRef.current) {
      speakerCtxRef.current.close().catch(() => {});
      speakerCtxRef.current = null;
    }
  }, [stopMicTest]);

  const startMicTest = async () => {
    if (testingMic) { stopMicTest(); return; }
    if (!hasMediaApi) {
      toast.error('Media API unsupported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(staged.audioInputDeviceId ? { deviceId: { exact: staged.audioInputDeviceId } } : {}),
          noiseSuppression: staged.noiseSuppression,
          echoCancellation: staged.echoCancellation,
        },
      });
      micStreamRef.current = stream;
      setTestingMic(true);

      const ctx = new AudioContext();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = staged.micGain / 100;
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
    } catch {
      toast.error('Could not access microphone');
    }
  };

  const autoCalibrateMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let samples = 0;
      let total = 0;
      const started = performance.now();
      while (performance.now() - started < 1400) {
        analyser.getByteFrequencyData(data);
        total += data.reduce((a, b) => a + b, 0) / data.length;
        samples += 1;
        await new Promise((r) => setTimeout(r, 80));
      }
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      const avg = samples ? total / samples : 45;
      const suggested = avg < 28 ? 150 : avg < 45 ? 125 : avg < 65 ? 105 : 85;
      patchStaged({ micGain: suggested });
      toast.success(`Mic gain calibrated to ${suggested}%`);
    } catch {
      toast.error('Calibration failed. Check microphone permission.');
    }
  };

  const testSpeaker = async () => {
    try {
      if (speakerCtxRef.current) {
        speakerCtxRef.current.close().catch(() => {});
      }
      const ctx = new AudioContext();
      speakerCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = (staged.speakerVolume || 15) / 100;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 420);
      if (staged.audioOutputDeviceId && !sinkIdSupported) {
        toast('Speaker routing selection is not supported in this browser. Using system default.');
      }
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
      // Take agent offline immediately before the logout fires
      const dialerState = useDialerStore.getState();
      if (dialerState.callState !== 'offline') {
        dialerState.goOffline();
      }
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
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!user?.uid || !isDirty) return;
    setSaving(true);
    try {
      if (audioDirty) {
        await saveAudioNow(user.uid);
      }
      if (brandDirty) {
        await saveProfile(user.uid, { brandColor });
        setSavedBrand(brandColor);
      }
      setSavedLabel('Saved');
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (audioDirty && saved) resetAudioToSaved();
    if (brandDirty) {
      setBrandColor(savedBrand || DEFAULT_BRAND);
      setHexInput(savedBrand || DEFAULT_BRAND);
    }
    setSavedLabel('Changes discarded');
  };

  const handlePickBrand = (hex) => {
    setBrandColor(hex);
    setSavedLabel('Unsaved changes');
  };

  const handleHexInput = (value) => {
    setHexInput(value);
    const v = String(value || '').trim().toLowerCase();
    if (HEX_RE.test(v)) {
      setBrandColor(v);
      setSavedLabel('Unsaved changes');
    }
  };

  const handleResetBrand = () => {
    setBrandColor(DEFAULT_BRAND);
    setHexInput(DEFAULT_BRAND);
    setSavedLabel('Unsaved changes');
  };

  if (loading) {
    return <PageLoader />;
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

  const navSections = SECTION_META.filter((s) => s.id !== 'account' || isPasswordUser);

  const sectionDirty = (id) => {
    if (id === 'audio') return audioDirty;
    if (id === 'appearance') return brandDirty;
    return false;
  };

  const renderNavButton = (section, mobile = false) => {
    const Icon = section.icon;
    const active = activeSection === section.id;
    const itemClass = mobile
      ? `${classes.mobileNavItem} ${active ? classes.mobileNavItemActive : ''} ${section.danger ? classes.mobileNavItemDanger : ''}`
      : `${classes.navItem} ${active ? classes.navItemActive : ''} ${section.danger ? classes.navItemDanger : ''}`;

    return (
      <button
        key={section.id}
        type="button"
        className={itemClass}
        onClick={() => setActiveSection(section.id)}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={16} />
        {section.label}
        {sectionDirty(section.id) && <span className={classes.navDirtyDot} aria-label="Unsaved changes" />}
      </button>
    );
  };

  const renderAudioSection = () => (
    <>
      <div className={classes.sectionIntro}>
        <div className={classes.sectionIntroRow}>
          <div>
            <h3>Audio</h3>
            <p>Configure your microphone and speaker for calls. Changes apply when you save.</p>
          </div>
          <button type="button" className={classes.ghostBtn} onClick={enumerateDevices}>
            <RefreshCw size={14} />
            Refresh devices
          </button>
        </div>
      </div>

      <div className={classes.audioGrid}>
        <div className={classes.audioPanel}>
          <div className={classes.audioPanelHead}>
            <div className={classes.audioPanelIcon}><Mic size={18} /></div>
            <h4>Microphone</h4>
          </div>
          <CustomSelect
            className={classes.profileSelect}
            options={[
              { value: '', label: 'System Default' },
              ...inputDevices.map((d) => ({ value: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` })),
            ]}
            value={staged.audioInputDeviceId}
            onChange={(v) => handleDeviceChange('input', v)}
            placeholder="System Default"
          />
          <div className={classes.gainRow}>
            <span className={classes.gainLabel}>Gain</span>
            <input
              type="range"
              min={0}
              max={200}
              value={staged.micGain}
              onChange={(e) => handleGainChange(Number(e.target.value))}
              className={classes.gainSlider}
              aria-label="Microphone gain"
            />
            <span className={classes.gainValue}>{staged.micGain}%</span>
          </div>
          <div className={classes.btnRow}>
            <button type="button" className={classes.testBtn} onClick={startMicTest}>
              {testingMic ? 'Stop test' : 'Test mic'}
            </button>
            <button type="button" className={classes.testBtn} onClick={autoCalibrateMic}>
              <SlidersHorizontal size={14} />
              Calibrate
            </button>
            {testingMic && (
              <div className={classes.meterTrack}>
                <div className={classes.meterFill} style={{ width: `${micLevel * 100}%` }} />
              </div>
            )}
          </div>
          <div className={classes.toggleGrid}>
            <label className={classes.switchRow}>
              <input
                type="checkbox"
                className={classes.switchCheckbox}
                checked={staged.noiseSuppression}
                disabled={!supportsNoiseSuppression}
                onChange={(e) => patchStaged({ noiseSuppression: e.target.checked })}
              />
              <span className={classes.switchText}>Noise suppression</span>
            </label>
            <label className={classes.switchRow}>
              <input
                type="checkbox"
                className={classes.switchCheckbox}
                checked={staged.echoCancellation}
                disabled={!supportsEchoCancellation}
                onChange={(e) => patchStaged({ echoCancellation: e.target.checked })}
              />
              <span className={classes.switchText}>Echo cancellation</span>
            </label>
          </div>
          {(!supportsNoiseSuppression || !supportsEchoCancellation) && (
            <p className={classes.hintText}>
              Some audio enhancements are unsupported in this browser and will be skipped.
            </p>
          )}
        </div>

        <div className={classes.audioPanel}>
          <div className={classes.audioPanelHead}>
            <div className={classes.audioPanelIcon}><Volume2 size={18} /></div>
            <h4>Speaker</h4>
          </div>
          <CustomSelect
            className={classes.profileSelect}
            options={[
              { value: '', label: 'System Default' },
              ...outputDevices.map((d) => ({ value: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 8)}` })),
            ]}
            value={staged.audioOutputDeviceId}
            onChange={(v) => handleDeviceChange('output', v)}
            placeholder="System Default"
          />
          <div className={classes.gainRow}>
            <span className={classes.gainLabel}>Vol</span>
            <input
              type="range"
              min={0}
              max={100}
              value={staged.speakerVolume}
              onChange={(e) => patchStaged({ speakerVolume: Number(e.target.value) })}
              className={classes.gainSlider}
              aria-label="Speaker volume"
            />
            <span className={classes.gainValue}>{staged.speakerVolume}%</span>
          </div>
          <button type="button" className={classes.testBtn} onClick={testSpeaker}>
            <Volume2 size={14} /> Test speaker
          </button>
          {!sinkIdSupported && (
            <p className={classes.hintText}>Output routing is unsupported — system default will be used.</p>
          )}
        </div>
      </div>

      {deviceState !== 'ready' && (
        <div className={classes.deviceBanner}>
          <AlertTriangle size={16} />
          <div className={classes.deviceBannerBody}>
            <strong>{deviceState === 'loading' ? 'Loading devices...' : 'Audio setup attention needed'}</strong>
            <p>{deviceMessage}</p>
          </div>
          <button type="button" className={classes.ghostBtn} onClick={enumerateDevices}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
    </>
  );

  const renderPrivacySection = () => (
    <>
      <div className={classes.sectionIntro}>
        <h3>Privacy & Security</h3>
        <p>Manage sessions, authentication, and your personal data.</p>
      </div>

      <div className={classes.settingGroup}>
        <p className={classes.groupTitle}>Security</p>
        <div className={classes.settingList}>
          <div className={classes.settingRow}>
            <div className={classes.toggleRow}>
              <div>
                <span className={classes.toggleLabel}>Two-factor authentication</span>
                <span className={classes.comingSoon}>Coming soon</span>
              </div>
              <button type="button" className={classes.toggle} disabled aria-label="Two-factor authentication">
                <span className={classes.toggleThumb} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={classes.settingGroup}>
        <p className={classes.groupTitle}>Sessions</p>
        <div className={classes.settingList}>
          <div className={classes.settingRow}>
            <div className={classes.settingRowLabel}>
              <strong>Current session</strong>
              <span>{sessionMeta}</span>
            </div>
            <div className={classes.settingRowControl}>
              <button
                type="button"
                className={classes.ghostBtn}
                onClick={handleRevokeAll}
                disabled={revoking}
              >
                <LogOut size={14} />
                {revoking ? 'Revoking...' : 'Sign out all devices'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={classes.settingGroup}>
        <p className={classes.groupTitle}>Your data</p>
        <div className={classes.settingList}>
          <div className={classes.settingRow}>
            <div className={classes.settingRowLabel}>
              <strong>Export account data</strong>
              <span>Download a copy of your profile, settings, and activity.</span>
            </div>
            <div className={classes.settingRowControl}>
              <button
                type="button"
                className={classes.ghostBtn}
                onClick={handleExport}
                disabled={exporting}
              >
                <Download size={14} />
                {exporting ? 'Exporting...' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const renderAppearanceSection = () => (
    <>
      <div className={classes.sectionIntro}>
        <div className={classes.sectionIntroRow}>
          <div>
            <h3>Appearance</h3>
            <p>Choose an accent color — it updates buttons, the sidebar, and focus rings instantly.</p>
          </div>
          <button
            type="button"
            className={classes.ghostBtn}
            onClick={handleResetBrand}
            disabled={brandColor.toLowerCase() === DEFAULT_BRAND.toLowerCase()}
            title="Reset to default green"
          >
            <RotateCcw size={14} />
            Reset default
          </button>
        </div>
      </div>

      <div className={classes.appearanceLayout}>
        <div className={classes.colorHero}>
          <div className={classes.colorHeroTop}>
            <h4>Accent color</h4>
            <span className={classes.currentSwatch} style={{ background: brandColor }} aria-hidden="true" />
          </div>

          <div className={classes.swatchStrip}>
            {BRAND_PRESETS.map((p) => {
              const active = brandColor.toLowerCase() === p.value.toLowerCase();
              return (
                <button
                  key={p.value}
                  type="button"
                  className={`${classes.swatchBtn} ${active ? classes.swatchBtnActive : ''}`}
                  onClick={() => handlePickBrand(p.value)}
                  aria-label={`${p.label} (${p.value})`}
                  title={`${p.label} — ${p.value}`}
                >
                  <span className={classes.swatchBtnInner} style={{ background: p.value }}>
                    {active && <Check size={16} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={classes.customColorRow}>
            <label
              className={classes.colorPickerPill}
              style={{
                background: `linear-gradient(135deg, ${brandColor} 0%, color-mix(in srgb, ${brandColor} 70%, #000) 100%)`,
              }}
            >
              <input
                type="color"
                value={brandColor}
                onChange={(e) => handleHexInput(e.target.value)}
                className={classes.colorInput}
                aria-label="Pick custom color"
              />
              <Palette size={14} strokeWidth={2.5} className={classes.colorPickerIcon} />
            </label>
            <div className={classes.hexField}>
              <span className={classes.hexPrefix}>HEX</span>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => handleHexInput(e.target.value)}
                className={classes.hexInput}
                placeholder="25f425"
                spellCheck="false"
                maxLength={7}
              />
            </div>
          </div>
        </div>

        <div className={classes.previewPanel}>
          <div className={classes.previewHeader}>
            <span className={classes.previewLabel}>Live preview</span>
            <span className={`${classes.previewDot} ${reduceMotion ? classes.previewDotReduced : ''}`} />
          </div>
          <div className={classes.previewNavRow}>
            <div className={classes.previewNavRail} />
            <div className={classes.previewNavIcon}><Palette size={14} /></div>
            <div className={classes.previewNavLabel}>Dashboard</div>
          </div>
          <div className={classes.previewActionRow}>
            <button type="button" className={classes.previewPrimaryBtn}>
              <Check size={13} strokeWidth={3} />
              Save changes
            </button>
            <span className={classes.previewChip}>Active</span>
          </div>
          <div className={classes.previewInputWrap}>
            <input type="text" defaultValue="Focus to see the ring" className={classes.previewInput} readOnly />
          </div>
          <div className={classes.previewProgressTrack}>
            <div className={classes.previewProgressFill} />
          </div>
        </div>
      </div>
    </>
  );

  const renderAccountSection = () => (
    <>
      <div className={classes.sectionIntro}>
        <h3>Account</h3>
        <p>Permanently remove your account and all associated data.</p>
      </div>

      <div className={classes.dangerPanel}>
        <h4><Trash2 size={16} /> Delete account</h4>
        <p className={classes.dangerText}>
          This action cannot be undone. Your profile, scripts, integrations, and settings will be permanently deleted.
        </p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            className={classes.dangerBtn}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete account
          </button>
        ) : (
          <div className={classes.deleteConfirm}>
            <div className={classes.deleteChecklist}>
              <p>Before deleting:</p>
              <ul>
                <li>Your account and settings are permanently removed</li>
                <li>Profile, scripts, and integrations are deleted</li>
                <li>Process typically completes within a few minutes</li>
              </ul>
            </div>
            <input
              type="text"
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              placeholder='Type "DELETE" to continue'
              className={classes.input}
            />
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
                className={`${classes.dangerBtn} ${classes.dangerBtnPrimary}`}
                onClick={handleDeleteAccount}
                disabled={deleting || !canDelete}
              >
                {deleting ? <Loader2 size={14} className={classes.spinner} /> : 'Confirm delete'}
              </button>
              <button
                type="button"
                className={classes.cancelBtn}
                onClick={() => { setShowDeleteConfirm(false); setDeletePw(''); setDeletePhrase(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'privacy': return renderPrivacySection();
      case 'appearance': return renderAppearanceSection();
      case 'account': return renderAccountSection();
      default: return renderAudioSection();
    }
  };

  return (
    <>
      <motion.div
        className={classes.page}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={classes.pageHeader} variants={presets.child}>
          <div className={classes.pageHeaderMain}>
            <div className={classes.iconBox} aria-hidden="true"><Settings size={22} /></div>
            <div>
              <h2>Settings</h2>
              <p>Devices, privacy, and personalization</p>
            </div>
          </div>
          <div className={classes.headerMeta}>
            <span className={isDirty ? classes.unsavedPill : classes.savedPill}>
              {isDirty ? 'Unsaved changes' : savedLabel || 'Saved'}
            </span>
          </div>
        </motion.div>

        <div className={classes.mobileNav} role="tablist" aria-label="Settings sections">
          {navSections.map((s) => renderNavButton(s, true))}
        </div>

        <motion.div className={`glass ${classes.workspace}`} variants={presets.child}>
          <div className={classes.workspaceMain}>
            <nav className={classes.sectionNav} aria-label="Settings sections">
              <p className={classes.navLabel}>Preferences</p>
              {navSections.map((s) => renderNavButton(s))}
            </nav>

            <div className={classes.contentPanel} role="tabpanel">
              {renderActiveSection()}
            </div>
          </div>

          {isDirty && (
            <div className={classes.unsavedWrap}>
              <UnsavedChangesBar
                visible
                onDiscard={handleDiscardChanges}
                onSave={handleSaveChanges}
                saving={saving}
              />
            </div>
          )}
        </motion.div>
      </motion.div>
    </>
  );
};

export default SettingsPage;
