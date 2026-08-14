import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, Volume2, Shield, HeartPulse, Umbrella, AlertCircle,
  ChevronLeft, ChevronDown, PhoneOff, Activity, ShieldCheck, Users,
  PhoneIncoming, DollarSign, Clock, Phone, CheckCircle2, MapPin, PhoneOutgoing, Tv,
  Plus, Trash2, Save, Pencil
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useSubtlePageMotion } from '../hooks/useSubtlePageMotion';
import classes from './TakeCallsPage.module.css';
import { initializeTwilioDevice } from '../services/twilioService';
import useDialerStore from '../store/useDialerStore';
import useAuthStore from '../store/authStore';
import { useAudioSettingsStore } from '../store/audioSettingsStore';
import { apiFetch } from '../services/apiClient';
import { stripeService } from '../services/stripeService';
import { getProfile, saveProfile, updateMyCallLogDisposition } from '../services/profileService';
import { fetchCampaignPricing } from '../services/dashboardService';
import { CallLogDispositionBadge } from '../components/callLogs/CallLogStatusCells';

// All 50 US States
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// Icons for the wizard step rail (Microphone, Campaign, Licensed States, Review)
const STEP_ICONS = [Mic, PhoneIncoming, MapPin, Phone];

// ─── Step 1: Mic & Speaker Test ─────────────────────────────────────────────
const StepOne = ({ onNext }) => {
  const user = useAuthStore((s) => s.user);
  const audioInputDeviceId = useAudioSettingsStore((s) => s.audio.audioInputDeviceId);
  const audioOutputDeviceId = useAudioSettingsStore((s) => s.audio.audioOutputDeviceId);
  const micGain = useAudioSettingsStore((s) => s.audio.micGain);
  const speakerVolume = useAudioSettingsStore((s) => s.audio.speakerVolume);
  const noiseSuppression = useAudioSettingsStore((s) => s.audio.noiseSuppression);
  const echoCancellation = useAudioSettingsStore((s) => s.audio.echoCancellation);
  const hydrate = useAudioSettingsStore((s) => s.hydrate);
  const saveAudioDebounced = useAudioSettingsStore((s) => s.saveAudioDebounced);
  const flushDebouncedSave = useAudioSettingsStore((s) => s.flushDebouncedSave);

  const [micDevices, setMicDevices] = useState([]);
  const [speakerDevices, setSpeakerDevices] = useState([]);
  const [micLevel, setMicLevel] = useState(0);
  const [micTested, setMicTested] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationRef = useRef(null);
  const gainNodeRef = useRef(null);

  const stopMic = useCallback(() => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    gainNodeRef.current = null;
    analyserRef.current = null;
  }, []);

  const enumerateAndValidate = useCallback(async (uid) => {
    setAudioError('');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const speakers = devices.filter((d) => d.kind === 'audiooutput');
      setMicDevices(mics);
      setSpeakerDevices(speakers);

      const st = useAudioSettingsStore.getState().audio;
      const patch = {};
      if (st.audioInputDeviceId && !mics.some((d) => d.deviceId === st.audioInputDeviceId)) {
        patch.audioInputDeviceId = '';
        toast('Saved microphone is unavailable. Using System Default.');
      }
      if (st.audioOutputDeviceId && !speakers.some((d) => d.deviceId === st.audioOutputDeviceId)) {
        patch.audioOutputDeviceId = '';
        toast('Saved speaker is unavailable. Using System Default.');
      }
      if (Object.keys(patch).length && uid) {
        useAudioSettingsStore.getState().saveAudioDebounced(uid, patch);
      }
    } catch (err) {
      setAudioError('Microphone permission denied or no devices found.');
      if (err?.name !== 'NotAllowedError') {
        console.error('enumerateAndValidate:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await hydrate(user.uid);
      } catch (e) {
        console.error('StepOne hydrate failed:', e);
      }
      if (cancelled) return;
      await enumerateAndValidate(user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, hydrate, enumerateAndValidate]);

  useEffect(() => () => {
    const uid = user?.uid;
    if (uid) flushDebouncedSave(uid);
  }, [user?.uid, flushDebouncedSave]);

  const startMicPipeline = useCallback(async () => {
    stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(audioInputDeviceId ? { deviceId: { exact: audioInputDeviceId } } : {}),
          noiseSuppression,
          echoCancellation,
        },
      });
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      const gainPct = useAudioSettingsStore.getState().audio.micGain ?? 100;
      gainNode.gain.value = gainPct / 100;
      gainNodeRef.current = gainNode;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(gainNode).connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
        const percent = Math.min(100, Math.round((sum / dataArray.length / 128) * 100));
        setMicLevel(percent);
        if (percent > 10) setMicTested(true);
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error('Mic start error:', err);
    }
  }, [stopMic, audioInputDeviceId, noiseSuppression, echoCancellation]);

  useEffect(() => {
    startMicPipeline();
    return () => stopMic();
  }, [startMicPipeline, stopMic]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (micGain ?? 100) / 100;
    }
  }, [micGain]);

  const handleMicSelect = (e) => {
    const v = e.target.value;
    if (!user?.uid) return;
    saveAudioDebounced(user.uid, { audioInputDeviceId: v });
  };

  const handleSpeakerSelect = (e) => {
    const v = e.target.value;
    if (!user?.uid) return;
    saveAudioDebounced(user.uid, { audioOutputDeviceId: v });
  };

  const playTestSound = () => {
    try {
      const vol = (speakerVolume || 15) / 100;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.1 * vol, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01 * vol, audioCtx.currentTime + 0.3);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      if (audioOutputDeviceId && typeof audioCtx.setSinkId === 'function') {
        const targetDeviceId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;
        try {
          const promise = audioCtx.setSinkId(targetDeviceId);
          if (promise && promise.catch) {
            promise.catch(() => { });
          }
        } catch (err) {
          console.warn('Ignored synchronous setSinkId error:', err);
        }
      }
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
      setSpeakerTested(true);
    } catch (err) {
      console.error('Speaker test error:', err);
    }
  };

  const refreshDevices = () => {
    if (user?.uid) enumerateAndValidate(user.uid);
  };

  const isReady = micTested && speakerTested;

  return (
    <div className={classes.stepCard}>
      <div className={classes.stepHead}>
        <div className={classes.iconBox}><Mic size={20} /></div>
        <h2>Test Your Microphone</h2>
        <p className={classes.subtitle}>Speak into your microphone to make sure it's working properly.</p>
      </div>
      {audioError && <p className={classes.errorText}>{audioError}</p>}

      <div className={`glass ${classes.sectionCard}`}>
        <div className={classes.levelContainer}>
          <div className={classes.levelHeader}><span>Input Level</span><span className={classes.levelPercent}>{micLevel}%</span></div>
          <div className={classes.progressBar}>
            <div className={classes.progressFill} style={{ width: `${micLevel}%` }} />
            <div className={classes.progressMarker} />
          </div>
          <p className={classes.testLabel}>Say something to test your microphone</p>
        </div>

        {micTested
          ? <div className={classes.successBox}><CheckCircle2 size={16} /> Microphone detected</div>
          : <div className={`${classes.successBox} ${classes.pendingBox}`}><Mic size={16} /> Waiting for audio input...</div>
        }
      </div>

      <div className={`glass ${classes.sectionCard}`}>
        <div className={classes.speakerHeader}>
          <div className={classes.inlineLabel}><Volume2 size={16} /> Test Your Speaker</div>
          <button className={classes.outlineBtn} onClick={playTestSound}><Volume2 size={14} /> Play Test Sound</button>
        </div>
        {!speakerTested && <div className={classes.speakerWarning}><AlertCircle size={14} /> Click to test your speaker</div>}
        {speakerTested && <div className={classes.successBox}><CheckCircle2 size={16} /> Sound played successfully</div>}
      </div>

      <div className={`glass ${classes.sectionCard}`}>
        <div className={classes.deviceSelects}>
          <div className={classes.selectGroup}>
            <label><Mic size={14} /> Microphone</label>
            <select value={audioInputDeviceId} onChange={handleMicSelect}>
              <option value="">System Default</option>
              {micDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.substr(0, 5)}`}</option>)}
              {micDevices.length === 0 && <option value="" disabled>No microphones found</option>}
            </select>
          </div>
          <div className={classes.selectGroup}>
            <label><Volume2 size={14} /> Speaker</label>
            <select value={audioOutputDeviceId} onChange={handleSpeakerSelect}>
              <option value="">System Default</option>
              {speakerDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.substr(0, 5)}`}</option>)}
              {speakerDevices.length === 0 && <option value="" disabled>Default Speaker</option>}
            </select>
          </div>
          <button type="button" className={classes.outlineBtn} onClick={refreshDevices}>Refresh Devices</button>
        </div>
      </div>

      <div className={`glass ${classes.stickyActionBar}`}>
        <p className={classes.continueSub}>
          {isReady ? 'Ready to continue.' : 'Test your microphone and speaker to continue.'}
        </p>
        <button type="button" className={classes.primaryBtn} onClick={onNext} disabled={!isReady}>Continue</button>
      </div>
    </div>
  );
};

// Icon map — keeps icons stable even when campaigns are added dynamically
const CAMPAIGN_ICON_MAP = {
  fe_inbounds_short: Umbrella,
  fe_inbounds: PhoneIncoming,
  fe_tv_calls: Tv,
  medicare_transfers: HeartPulse,
  medicare_inbound_1: Shield,
  medicare_inbound_2: ShieldCheck,
  aca_transfers: Users,
};

// ─── Step 2: Campaign Selection ──────────────────────────────────────────────
const StepTwo = ({ onNext, onBack, selected = '', pausedCampaigns = {}, liveCampaigns = [] }) => {
  const [selectedCampaign, setSelectedCampaign] = useState(selected);
  // Use agency-filtered campaigns from /api/users/me/campaigns — never the hardcoded catalog.
  const campaigns = (liveCampaigns || []).map((c) => ({
    id: c.id,
    title: c.label || c.id,
    subtitle: c.label || c.id,
    price: `$${Number(c.price) || 0}`,
    buffer: `${Number(c.buffer) || 0}s buffer`,
    icon: CAMPAIGN_ICON_MAP[c.id] || PhoneIncoming,
  }));

  return (
    <div className={`${classes.stepCard} ${classes.stepCardWide}`}>
      <div className={classes.stepHead}>
        <h2>Choose Your Campaign</h2>
      </div>
      <p className={classes.subtitle}>Select the campaign you'd like to receive calls from</p>
      <div className={`glass ${classes.sectionCard}`}>
        {campaigns.length === 0 ? (
          <div className={classes.emptyState}>
            <p>No campaigns are assigned to your agency yet.</p>
            <p className={classes.continueSub}>Contact your agency admin to get access to campaigns.</p>
          </div>
        ) : (
          <div className={classes.campaignsList}>
            {campaigns.map((c) => {
              const isPaused = Boolean(pausedCampaigns[c.id]);
              return (
                <div key={c.id}
                  className={`glass ${classes.campaignSelectCard} ${selectedCampaign === c.id ? classes.campaignSelectActive : ''}`}
                  style={isPaused ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                  onClick={() => { if (!isPaused) setSelectedCampaign(c.id); }}>
                  <div className={classes.campaignIconCol}><div className={classes.campIconWrapper}><c.icon size={24} /></div></div>
                  <div className={classes.campaignInfoCol}>
                    <h3>{c.title}</h3>
                    <p className={classes.campaignDesc}>{c.subtitle}</p>
                    <div className={classes.campaignMetrics}>
                      <span className={classes.campaignPrice}>{c.price}</span>
                      <span className={classes.campaignBuffer}>{c.buffer}</span>
                    </div>
                    {isPaused && (
                      <p className={classes.warningText} style={{ marginTop: 6 }}>
                        Paused by admin
                      </p>
                    )}
                  </div>
                  <div className={classes.campaignRadio}>
                    <div className={`${classes.radioCircle} ${selectedCampaign === c.id ? classes.radioActive : ''}`}>
                      {selectedCampaign === c.id && <div className={classes.radioInner} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`glass ${classes.stickyActionBar}`}>
        <button className={classes.ghostBtn} onClick={onBack}>Back</button>
        <button className={classes.primaryBtn} onClick={() => onNext(selectedCampaign)} disabled={!selectedCampaign || Boolean(pausedCampaigns[selectedCampaign]) || campaigns.length === 0}>
          Continue
        </button>
      </div>
    </div>
  );
};

// ─── Step 3: Licensed States ─────────────────────────────────────────────────
const StepThree = ({ onNext, onBack, statePresets = [], onSavePresets, selectedPresetId = null }) => {
  // Picker mode lists saved categories; editor mode builds a new one.
  const hasPresets = statePresets.length > 0;
  const [mode, setMode] = useState(hasPresets ? 'picker' : 'editor');
  const [selectedStates, setSelectedStates] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const reduceMotion = useReducedMotion();

  const paneVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1], when: 'beforeChildren', staggerChildren: 0.04 } },
    exit: { opacity: 0, y: reduceMotion ? 0 : -12, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
  };
  const cardVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, scale: reduceMotion ? 1 : 0.9, transition: { duration: 0.16 } },
  };

  const toggleState = (code) => {
    setSelectedStates(prev =>
      prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]
    );
  };

  const selectAll = () => setSelectedStates(US_STATES.map(s => s.code));
  const clearAll = () => setSelectedStates([]);

  const filtered = US_STATES.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  const openEditor = () => {
    setSelectedStates([]);
    setSearch('');
    setCategoryName('');
    setEditingId(null);
    setMode('editor');
  };

  const openEditFor = (preset) => {
    setSelectedStates(preset.states || []);
    setSearch('');
    setCategoryName(preset.name || '');
    setEditingId(preset.id);
    setMode('editor');
  };

  const saveCategory = async () => {
    const name = categoryName.trim();
    if (!name) {
      toast.error('Give this category a name first.');
      return;
    }
    if (selectedStates.length === 0) {
      toast.error('Select at least one state.');
      return;
    }
    const next = editingId
      ? statePresets.map(p => (p.id === editingId ? { ...p, name, states: selectedStates } : p))
      : [...statePresets, { id: (crypto?.randomUUID?.() || `preset_${Date.now()}`), name, states: selectedStates }];
    setIsSaving(true);
    try {
      await onSavePresets?.(next);
      toast.success(editingId ? `Updated "${name}".` : `Saved "${name}".`);
      setEditingId(null);
      setMode('picker');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePreset = (id) => {
    onSavePresets?.(statePresets.filter(p => p.id !== id));
  };

  const trimmedName = categoryName.trim();
  const needsNameAttention = !trimmedName;
  const canSave = trimmedName && selectedStates.length > 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {mode === 'picker' ? (
        // ── Picker mode: choose a saved category to instantly go live ──────────
        <motion.div
          key="picker"
          className={`${classes.stepCard} ${classes.stepCardWide}`}
          variants={paneVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className={classes.stepHead}>
            <div className={classes.iconBox}><MapPin size={20} /></div>
            <h2>Licensed States</h2>
          </div>
          <p className={classes.subtitle}>Pick a saved state category to apply it and continue, or create a new one.</p>

          <div className={classes.presetLayout}>
            <div className={classes.presetList}>
              <AnimatePresence mode="popLayout">
                {statePresets.map(preset => {
                  const isSelected = preset.id === selectedPresetId;
                  return (
                    <motion.div
                      key={preset.id}
                      layout
                      className={`glass ${classes.presetCard} ${isSelected ? classes.presetCardActive : ''}`}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      whileHover={reduceMotion ? undefined : { y: -3 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <button
                        className={classes.presetCardMain}
                        onClick={() => onNext(preset.states, preset.id)}
                        title={`Apply ${preset.name} and continue`}
                      >
                        <span className={classes.presetName}>{preset.name}</span>
                        <span className={classes.presetMeta}>
                          {isSelected && <CheckCircle2 size={12} />} {preset.states.length} state{preset.states.length !== 1 ? 's' : ''}{isSelected ? ' · Selected' : ''}
                        </span>
                        <span className={classes.presetCodes}>{preset.states.join(', ')}</span>
                      </button>
                      <div className={classes.presetActions}>
                        <motion.button
                          className={classes.presetIconBtn}
                          onClick={() => openEditFor(preset)}
                          title={`Edit ${preset.name}`}
                          aria-label={`Edit ${preset.name}`}
                          whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                        >
                          <Pencil size={14} />
                        </motion.button>
                        <motion.button
                          className={`${classes.presetIconBtn} ${classes.presetDeleteBtn}`}
                          onClick={() => deletePreset(preset.id)}
                          title={`Delete ${preset.name}`}
                          aria-label={`Delete ${preset.name}`}
                          whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                        >
                          <Trash2 size={14} />
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <motion.div className={`glass ${classes.presetAddBox}`} variants={cardVariants}>
              <div className={classes.presetAddIcon}><Plus size={22} /></div>
              <h3>New category</h3>
              <p>Build a fresh set of licensed states and save it for next time.</p>
              <motion.button
                className={classes.primaryBtn}
                onClick={openEditor}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              >
                <Plus size={16} /> Add category
              </motion.button>
            </motion.div>
          </div>

          <div className={`glass ${classes.stickyActionBar}`}>
            <button className={classes.ghostBtn} onClick={onBack}>Back</button>
            <span className={classes.actionBarHint}>Select a category above to continue</span>
          </div>
        </motion.div>
      ) : (
        // ── Editor mode: build and save a category ─────────────────────────────
        <motion.div
          key="editor"
          className={`${classes.stepCard} ${classes.stepCardWide}`}
          variants={paneVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className={classes.stepHead}>
            <div className={classes.iconBox}><MapPin size={20} /></div>
            <h2>{editingId ? 'Edit State Category' : (hasPresets ? 'New State Category' : 'Licensed States')}</h2>
          </div>
          <p className={classes.subtitle}>Select every state you are licensed to sell insurance in, then save this as a reusable category.</p>

          <div className={`glass ${classes.sectionCard}`}>
            <div className={classes.categoryNameGroup}>
              <label className={classes.categoryNameLabel} htmlFor="state-category-name">
                Category name<span className={classes.requiredMark} aria-hidden="true">*</span>
              </label>
              <input
                id="state-category-name"
                className={`${classes.presetNameInput} ${needsNameAttention ? classes.presetNameInputAttention : ''}`}
                type="text"
                placeholder="e.g. Southeast, My License Set"
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                maxLength={40}
                required
                aria-required="true"
                autoComplete="off"
              />
            </div>

            <div className={classes.statesToolbar}>
              <input
                className={classes.stateSearch}
                type="text"
                placeholder="Search states..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className={classes.outlineBtn} onClick={selectAll}>Select All</button>
              <button className={classes.ghostBtn} onClick={clearAll}>Clear</button>
            </div>

            <div className={classes.stateCounter}>
              {selectedStates.length === 0
                ? <span className={classes.warningText}>No states selected — you won't receive any calls.</span>
                : <span><strong>{selectedStates.length}</strong> state{selectedStates.length !== 1 ? 's' : ''} selected: {selectedStates.join(', ')}</span>
              }
            </div>

            <div className={classes.statesGrid}>
              {filtered.map(state => {
                const isSelected = selectedStates.includes(state.code);
                return (
                  <motion.button
                    key={state.code}
                    className={`${classes.stateChip} ${isSelected ? classes.stateChipActive : ''}`}
                    onClick={() => toggleState(state.code)}
                    title={state.name}
                    whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  >
                    <span className={classes.stateCode}>{state.code}</span>
                    <span className={classes.stateName}>{state.name}</span>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.span
                          className={classes.stateCheck}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.15 }}
                        >
                          <CheckCircle2 size={12} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className={`glass ${classes.stickyActionBar}`}>
            <button className={classes.ghostBtn} onClick={() => { setEditingId(null); hasPresets ? setMode('picker') : onBack(); }}>Back</button>
            <motion.button
              className={classes.primaryBtn}
              onClick={saveCategory}
              disabled={isSaving || !canSave}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            >
              <Save size={16} /> {isSaving ? 'Saving…' : (editingId ? 'Save changes' : 'Save category')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Step 4: Review Rules & Go Live ─────────────────────────────────────────
const StepFour = ({ onBack, onGoLive, isConnecting, campaign, licensedStates, walletBalance, liveCampaigns = [] }) => {
  const selected = liveCampaigns.find((c) => c.id === campaign);
  const requiredBalance = Number(selected?.price) || 0;
  const hasBalance = walletBalance >= requiredBalance;
  const campaignLabel = selected
    ? `${selected.label} ($${Number(selected.price).toFixed(0)} / ${selected.buffer}s)`
    : campaign;

  return (
    <div className={classes.stepCard}>
      <div className={classes.stepHead}>
        <div className={classes.iconBox}><Phone size={20} /></div>
        <h2>Review & Go Live</h2>
      </div>
      <p className={classes.subtitle}>Confirm your setup before going live</p>

      <div className={`glass ${classes.sectionCard}`}>
        <div className={classes.summaryBox}>
          <div className={`glass ${classes.summaryRow}`}>
            <span className={classes.summaryLabel}>Campaign</span>
            <span className={classes.summaryValue}>{campaignLabel}</span>
          </div>
          <div className={`glass ${classes.summaryRow}`}>
            <span className={classes.summaryLabel}>Licensed States</span>
            <span className={`${classes.summaryValue} ${classes.summaryValueAccent}`}>
              {licensedStates.length} state{licensedStates.length !== 1 ? 's' : ''}: {licensedStates.join(', ')}
            </span>
          </div>
        </div>

        <div className={classes.rulesList}>
          <div className={classes.ruleItem}><div className={classes.ruleNum}>1</div><p>Follow the script to properly qualify the prospect.</p></div>
          <div className={classes.ruleItem}><div className={classes.ruleNum}>2</div><p>Do not quote prices or plans within the campaign buffer time.</p></div>
          <div className={classes.ruleItem}><div className={classes.ruleNum}>3</div><p>Do not share personal contact information within the buffer time.</p></div>
        </div>

        <div className={classes.warningBox}>
          <AlertCircle size={18} />
          <p>You will ONLY receive calls from your {licensedStates.length} selected states. If you're missing a state, go back and add it.</p>
        </div>
        {!hasBalance && (
          <div className={classes.errorBanner}>
            <AlertCircle size={24} />
            <div className={classes.errorBannerText}>
              <p>Insufficient Credits</p>
              <span>Your wallet balance is lower than the required campaign price. You must add credits before you can go live.</span>
            </div>
          </div>
        )}
      </div>

      <div className={`glass ${classes.stickyActionBar}`}>
        <button className={classes.ghostBtn} onClick={onBack} disabled={isConnecting}>Back</button>
        {hasBalance ? (
          <button className={classes.primaryBtn} onClick={onGoLive} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'I Agree, Go Live'}
          </button>
        ) : (
          <button className={`${classes.primaryBtn} ${classes.errorBannerBtn}`} onClick={() => window.location.href = '/app/billing'}>
            Go Admin Top Up
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Post-Call Disposition Modal ─────────────────────────────────────────────
const DispositionModal = ({ callSid, onComplete }) => {
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const options = [
    { id: 'not_interested', label: 'Not interested' },
    { id: 'callback', label: 'Call back' },
    { id: 'busy', label: 'Busy' },
    { id: 'policy_closed', label: 'Policy Closed' },
    { id: 'dead_air', label: 'Dead Air' }
  ];

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      if (callSid !== 'test-sid') {
        await apiFetch(`/api/voice/logs/${callSid}`, {
          method: 'PATCH',
          body: { disposition: selected }
        });
      }
      toast.success('Disposition saved');
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save disposition. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.callOverlay}>
      <div className={`glass ${classes.dispositionModal}`}>
        <h3>Call Completed</h3>
        <p>Please select a disposition for the call that just ended.</p>
        <div className={classes.dispositionOptions}>
          {options.map(opt => (
            <button
              key={opt.id}
              className={`${classes.dispositionOptionBtn} ${selected === opt.id ? classes.dispositionSelected : ''}`}
              onClick={() => setSelected(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          className={`${classes.primaryBtn} ${classes.dispositionSubmitBtn}`}
          onClick={handleSubmit}
          disabled={!selected || submitting}
        >
          {submitting ? 'Saving...' : 'Submit & Ready'}
        </button>
      </div>
    </div>
  );
};

// ─── Call History Table ──────────────────────────────────────────────────────
const CallHistory = ({ logs, onDispositionUpdate }) => {
  const [updatingId, setUpdatingId] = useState(null);

  const handleUpdate = async (logId, val) => {
    setUpdatingId(logId);
    await onDispositionUpdate(logId, val);
    setUpdatingId(null);
  };

  if (!logs || logs.length === 0) {
    return (
      <div className={classes.logsTableWrapper}>
        <div className={classes.emptyLogs}>
          <Activity size={22} />
          <p>Listening — no calls yet</p>
          <span>Inbound calls will show up here as they come in.</span>
        </div>
      </div>
    );
  }
  return (
    <div className={classes.logsTableWrapper}>
      <div className={classes.logsHeader}>
        <span className={classes.colCampaign}>Campaign</span>
        <span className={classes.colCaller}>Caller</span>
        <span className={classes.colDuration}>Duration</span>
        <span className={classes.colStatus}>Status</span>
        <span className={classes.colStatus}>Disposition</span>
      </div>
      <div className={classes.logsList}>
        {logs.map((log) => (
          <div key={log.id} className={classes.logItem}>
            <div className={classes.colCampaign}><span className={classes.campaignTag}>{log.campaignLabel}</span></div>
            <div className={classes.colCaller}>
              {log.isBillable ? log.from : (log.from ? log.from.slice(0, -4) + 'XXXX' : '—')}
            </div>
            <div className={classes.colDuration}><Clock size={14} />{Math.floor(log.duration / 60)}:{(log.duration % 60).toString().padStart(2, '0')}</div>
            <div className={classes.colStatus}>
              {log.isBillable ? (
                <span className={classes.badgeSale}><DollarSign size={12} /> Billable (${log.cost})</span>
              ) : log.status === 'completed' ? (
                <span className={classes.badgeAnswered}>Answered</span>
              ) : (
                <span className={classes.badgeMissed}>Missed</span>
              )}
            </div>
            <div className={classes.colStatus}>
              <CallLogDispositionBadge
                log={log}
                editable={true}
                loading={updatingId === log.id}
                onUpdate={handleUpdate}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LiveStatesPanel = ({ states }) => {
  const [expanded, setExpanded] = useState(false);
  if (!states?.length) return null;

  return (
    <>
      <button
        type="button"
        className={classes.liveStatesToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={classes.liveStatesLabel}><MapPin size={12} /> Licensed States</span>
        <span className={classes.liveStatesCount}>{states.length}</span>
        <ChevronDown size={16} className={`${classes.liveStatesChevron} ${expanded ? classes.liveStatesChevronOpen : ''}`} />
      </button>
      <div
        className={`${classes.liveStateChipsWrap} ${expanded ? classes.liveStateChipsWrapOpen : ''}`}
        aria-hidden={!expanded}
      >
        <div className={classes.liveStateChipsInner}>
          <div className={classes.liveStateChips}>
            {states.map((s) => (
              <span key={s} className={classes.liveStateChip}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── ACA Transfer Panel ──────────────────────────────────────────────────────
const AcaTransferPanel = () => {
  const { transferStatus, brokerCallSid, conferenceName, setTransferState } = useDialerStore();
  const [digits, setDigits] = useState('');

  const handleTransfer = async () => {
    try {
      setTransferState('transferring');
      const res = await apiFetch('/api/voice/initiate-transfer', { method: 'POST' });
      if (res && res.success) {
        setTransferState('transferred', res.brokerCallSid, res.conferenceName);
        toast.success('Broker joined the conference');
      } else {
        throw new Error(res?.error || 'Transfer failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to transfer call: ' + (err.message || ''));
      setTransferState('idle');
    }
  };

  const sendDigit = (digit) => {
    if (!brokerCallSid) return;
    setDigits(prev => prev + digit);
    const { activeCall } = useDialerStore.getState();
    if (activeCall && typeof activeCall.sendDigits === 'function') {
      activeCall.sendDigits(digit);
    } else {
      console.warn('DTMF not supported on this active call object');
    }
  };

  if (transferStatus === 'idle') {
    return (
      <div className={`glass ${classes.acaTransferCard}`}>
        <h3>Marketplace Transfer</h3>
        <p>Transfer the caller to the Marketplace broker line when ready.</p>
        <button className={classes.primaryBtn} onClick={handleTransfer}>
          <PhoneOutgoing size={18} /> Transfer Marketplace Agent
        </button>
      </div>
    );
  }

  return (
    <div className={`glass ${classes.acaTransferCard}`}>
      <h3>Marketplace Broker Line</h3>
      <div className={classes.transferStatusBadge}>
        <span className={classes.liveDot} />
        {transferStatus === 'transferring' ? 'Dialing Broker...' : 'Broker in Call'}
      </div>

      <div className={classes.dialpadContainer} style={{ opacity: transferStatus === 'transferred' ? 1 : 0.5, pointerEvents: transferStatus === 'transferred' ? 'auto' : 'none' }}>
        <p>Use the dialpad to respond to the broker IVR and enter your NPN.</p>
        <div className={classes.digitsDisplay}>{digits || '...'}</div>
        <div className={classes.dialGrid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(d => (
            <button key={d} className={classes.dialBtn} onClick={() => sendDigit(d)}>{d}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────
const TakeCallsPage = () => {
  const presets = useSubtlePageMotion();
  const { callState, activeCampaign, licensedStates, leadData, hangUp, goOffline, pendingDispositionCall, clearPendingDisposition, transferStatus } = useDialerStore();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState(1);
  const [campaign, setCampaign] = useState('');
  const [wizardStates, setWizardStates] = useState([]);
  const [wizardPresetId, setWizardPresetId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [history, setHistory] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [pausedCampaigns, setPausedCampaigns] = useState({});
  const [liveCampaigns, setLiveCampaigns] = useState([]);
  const [statePresets, setStatePresets] = useState([]);
  const reduceMotion = useReducedMotion();

  // Direction-aware step navigation (forward slides left, back slides right).
  const goStep = (n) => {
    setStepDirection(n >= step ? 1 : -1);
    setStep(n);
  };

  const stepVariants = {
    enter: (dir) => ({ opacity: 0, x: reduceMotion ? 0 : (dir > 0 ? 48 : -48) }),
    center: { opacity: 1, x: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
    exit: (dir) => ({ opacity: 0, x: reduceMotion ? 0 : (dir > 0 ? -48 : 48), transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }),
  };

  const titles = ['Microphone Test', 'Select Campaign', 'Licensed States', 'Review & Go Live'];

  const fetchData = async () => {
    try {
      const logsData = await apiFetch('/api/voice/logs');
      setHistory(logsData || []);

      const walletData = await stripeService.getWallet();
      if (walletData) setWalletBalance(walletData.balance);

      const profile = await getProfile(user?.uid);
      if (profile && Array.isArray(profile.statePresets)) {
        setStatePresets(profile.statePresets);
      }

      try {
        const campaigns = await fetchCampaignPricing();
        const pausedMap = {};
        campaigns.forEach((row) => {
          if (row?.id) pausedMap[row.id] = Boolean(row.paused);
        });
        setPausedCampaigns(pausedMap);
        setLiveCampaigns(campaigns);
      } catch {
        // Non-blocking: keep wizard usable even if pricing fetch fails.
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const persistPresets = async (next) => {
    setStatePresets(next);
    try {
      await saveProfile(user?.uid, { statePresets: next });
    } catch (err) {
      console.error('Failed to save state categories:', err);
      toast.error('Failed to save category. Please try again.');
    }
  };

  const pollingTimerRef = useRef(null);

  useEffect(() => {
    fetchData();
    pollingTimerRef.current = setInterval(fetchData, 10000);

    const onWalletUpdated = (e) => {
      if (e.detail !== undefined && e.detail !== null) {
        setWalletBalance(e.detail);
        return;
      }
      stripeService.getWallet().then((walletData) => {
        if (walletData) setWalletBalance(walletData.balance);
      }).catch(() => { });
    };
    window.addEventListener('wallet_updated', onWalletUpdated);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      window.removeEventListener('wallet_updated', onWalletUpdated);
    };
  }, []);

  const handleGoLive = async () => {
    if (pausedCampaigns[campaign]) {
      toast.error('This campaign is currently paused by admin. Please choose another campaign.');
      return;
    }
    const selected = liveCampaigns.find((c) => c.id === campaign);
    const requiredBalance = Number(selected?.price) || 0;

    if (walletBalance < requiredBalance) {
      alert("Low balance for the selected campaign. Please top up your wallet.");
      return;
    }
    try {
      setIsConnecting(true);
      // Use Firebase UID as the Twilio identity so call logs are saved per-user
      const { user } = useAuthStore.getState();
      const agentId = user?.uid || `agent_${Math.floor(Math.random() * 10000)}`;
      await initializeTwilioDevice(agentId, campaign, wizardStates);
    } catch (err) {
      console.error('Failed to go live:', err);
      if (err?.code === 'INSUFFICIENT_BALANCE') {
        toast.error('Low balance for the selected campaign. Please add credits before going live.', { duration: 6000 });
      } else {
        const errorText = err?.message || 'Unknown error occurred';
        toast.error('Failed to connect: ' + errorText, { duration: 5000 });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // ── Active Dialer View ──────────────────────────────────────────────────
  if (callState !== 'offline' && callState !== 'error') {
    const isRinging = callState === 'ringing';
    // Live Wallet Budget Calculation
    const remainingBudget = walletBalance / 100;

    return (
      <motion.div
        className={`${classes.page} ${classes.activeDialerLayout} ${isRinging ? classes.blurred : ''}`}
        variants={presets.root}
        initial="hidden"
        animate="visible"
      >
        <motion.div className={classes.pageHeader} variants={presets.child}>
          <div>
            <h1>Take Calls</h1>
          </div>
        </motion.div>

        {activeCampaign === 'fe_inbounds' && (
          <motion.div variants={presets.child} className={classes.readBanner}>
            <strong style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertCircle size={20} /> FE Inbounds 90s Qualifiers
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>What to ASK (Must answer YES/NO):</strong>
                <ul style={{ paddingLeft: '20px', margin: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.9 }}>
                  <li><strong>Not a free program, you have to pay a monthly premium?</strong> (YES)</li>
                  <li><strong>Between ages 50-80?</strong> (YES)</li>
                  <li><strong>Active checking or savings account?</strong> (YES)</li>
                  <li><strong>In a nursing facility?</strong> (NO)</li>
                  <li><strong>Verify License State </strong> (Must)</li>
                </ul>
                <div style={{ fontWeight: 'bold', marginTop: '12px' }}>
                  * Ask state & drop within buffer if you are not licensed in that state. NO refunds after.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>What NOT to SAY:</strong>
                <ul style={{ paddingLeft: '20px', margin: '0 0 10px 0', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '6px', opacity: 0.9 }}>
                  <li>Don't mention price/ballpark within buffer.</li>
                  <li>Don't quote within buffer.</li>
                  <li>Don't ask for Bank details within buffer.</li>
                </ul>
                <div style={{ fontWeight: 'bold', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span>* Drops within buffer (other than qualifiers) result in a ban.</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeCampaign === 'fe_inbounds_short' && (
          <motion.div variants={presets.child} className={classes.readBanner}>
            <strong style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertCircle size={20} /> FE Short duration
            </strong>
            <div style={{ fontSize: '15px' }}>
              <ul style={{ paddingLeft: '20px', margin: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.9 }}>
                <li><strong>Ask for the state within the buffer.</strong> Disconnect before the buffer ends if you are not licensed. There are NO refunds after the buffer.</li>
                <li><strong>All sales are final once the call goes over buffer.</strong> It’s billable and non-refundable unless it was dead air.</li>
                <li><strong>Our system routes calls based on area codes.</strong> If you get someone from a state you’re not licensed in once in a while, we can’t do anything about it and it’s not refundable.</li>
              </ul>
            </div>
          </motion.div>
        )}

        {['fe_tv_calls', 'fe_tv_70'].includes(activeCampaign) && (
          <motion.div variants={presets.child} className={classes.readBanner}>
            <strong style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertCircle size={20} /> FE TV Calls
            </strong>
            <div style={{ fontSize: '15px' }}>
              <ul style={{ paddingLeft: '20px', margin: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.9 }}>
                <li><strong>All sales are final once the call goes over buffer.</strong> It’s billable and non-refundable.</li>
                <li><strong>Our system routes calls based on area codes.</strong> If you get someone from a state you’re not licensed in once in a while, we can’t do anything about it and it’s not refundable.</li>
                <li><strong>Disconnect before the buffer ends if you are not licensed. There are NO refunds after the buffer. To avoid this, ask the state within the buffer.</strong></li>
              </ul>
            </div>
          </motion.div>
        )}

        <motion.div
          className={`glass ${classes.liveCommandBar} ${callState === 'active' ? classes.liveCommandBarOnCall : ''} ${pendingDispositionCall && callState !== 'active' ? classes.liveCommandBarDisposition : ''}`}
          variants={presets.child}
        >
          <div className={classes.liveCommandStatus}>
            <div className={`${classes.liveBadge} ${callState === 'active' ? classes.liveBadgeOnCall : ''}`}>
              <div className={classes.liveDot} />
              {callState === 'active' ? 'On Call' : pendingDispositionCall ? 'Disposition' : 'Dialer Active'}
            </div>
            <div className={classes.liveCommandCopy}>
              <h2>
                {callState === 'active'
                  ? 'Currently On Call'
                  : pendingDispositionCall
                    ? 'Complete Disposition'
                    : 'Listening for Calls'}
              </h2>
              <p>
                {callState === 'active'
                  ? 'Stay focused on the prospect. Follow your script.'
                  : pendingDispositionCall
                    ? 'Submit a disposition for your last call before you can receive new calls.'
                    : 'You are connected to the CallsFlow engine. Stand by for inbound calls.'}
              </p>
            </div>
          </div>

          <div className={classes.liveCommandMeta}>
            <div className={classes.liveMetaItem}>
              <span className={classes.liveMetaLabel}>Campaign</span>
              <span className={classes.liveMetaValue}>{activeCampaign?.replace(/_/g, ' ').toUpperCase() || '---'}</span>
            </div>
            <div className={classes.liveMetaItem}>
              <span className={classes.liveMetaLabel}>Remaining Budget</span>
              <span className={`${classes.liveMetaValue} ${classes.budgetGreen}`}>${remainingBudget.toFixed(2)}</span>
            </div>
          </div>

          <div className={classes.liveCommandActions}>
            {callState === 'active' ? (
              <button
                className={`${classes.dangerBtn} ${classes.hangUpBtn}`}
                onClick={async () => {
                  console.log('[EndCall] activeCampaign:', activeCampaign, 'callState:', callState);
                  try { await apiFetch('/api/voice/kill-call', { method: 'POST' }); } catch (e) { console.error('[EndCall] kill-call failed:', e); }
                  hangUp();
                }}
              >
                <PhoneOff size={18} /> End Call
              </button>
            ) : (
              <button className={classes.dangerBtn} onClick={goOffline}>
                <PhoneOff size={18} /> Pause & Go Offline
              </button>
            )}
          </div>
        </motion.div>

        <motion.div className={classes.liveWorkspace} variants={presets.child}>
          {callState === 'active' && activeCampaign === 'aca_transfers' && (
            <AcaTransferPanel />
          )}
          <div className={`glass ${classes.liveHistoryCol}`}>
            <div className={classes.liveHistoryHeader}>
              <h3 className={classes.logsTitle}>Recent Activity</h3>
              <LiveStatesPanel states={licensedStates} />
            </div>
            <CallHistory
              logs={history}
              onDispositionUpdate={async (logId, val) => {
                try {
                  await updateMyCallLogDisposition(logId, val);
                  setHistory((prev) => prev.map((l) => (l.id === logId ? { ...l, disposition: val } : l)));
                  toast.success('Disposition updated');
                } catch (err) {
                  toast.error('Failed to update disposition');
                }
              }}
            />
          </div>
        </motion.div>

        {pendingDispositionCall && (
          <DispositionModal
            callSid={pendingDispositionCall}
            onComplete={() => {
              clearPendingDisposition();
              fetchData(); // refresh history to show disposition immediately
            }}
          />
        )}
      </motion.div>
    );
  }

  // ── Setup Wizard View ────────────────────────────────────────────────────
  return (
    <motion.div
      className={classes.page}
      variants={presets.root}
      initial="hidden"
      animate="visible"
    >
      <motion.div className={classes.pageHeader} variants={presets.child}>
        <div>
          <h1>Take Calls</h1>
          <p>Complete setup to start receiving inbound calls.</p>
        </div>
      </motion.div>

      {/* ── Flagged Account Banner ───────────────────────────────────── */}
      {user?.flagged && (
        <motion.div className={classes.flaggedBanner} variants={presets.child}>
          <div className={classes.flaggedBannerIcon}>
            <AlertCircle size={24} />
          </div>
          <div className={classes.flaggedBannerBody}>
            <strong className={classes.flaggedBannerTitle}>Account Flagged</strong>
            <p>
              {user?.flagReason
                ? `Your account has been flagged: ${user.flagReason}.`
                : 'Your account has been flagged due to inactivity or a low billable rate.'}{' '}
              Please contact{' '}
              <a href="mailto:admin@callsflow.io" className={classes.flaggedBannerLink}>
                admin@callsflow.io
              </a>{' '}
              to resume your activity.
            </p>
          </div>
        </motion.div>
      )}

      {!user?.flagged && (
        <motion.div className={`glass ${classes.wizardShell}`} variants={presets.child}>

          <div className={classes.wizardGrid}>
            <aside className={classes.wizardRail}>
              <div className={classes.railHeader}>
                <span className={classes.railEyebrow}>Go Live Setup</span>
                <p className={classes.railSub}>Finish these steps to start receiving inbound calls.</p>
              </div>
              <div className={classes.railSteps}>
                {titles.map((title, i) => {
                  const n = i + 1;
                  const Icon = STEP_ICONS[i];
                  const isActive = step === n;
                  const isDone = step > n;
                  const canJump = isDone;
                  return (
                    <button
                      key={title}
                      type="button"
                      className={`${classes.railStep} ${isActive ? classes.railStepActive : ''} ${isDone ? classes.railStepDone : ''}`}
                      onClick={() => canJump && goStep(n)}
                      disabled={!canJump}
                    >
                      <span className={classes.railIcon}>
                        {isDone ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                      </span>
                      <span className={classes.railText}>
                        <span className={classes.railStepLabel}>Step {n}</span>
                        <span className={classes.railTitle}>{title}</span>
                      </span>
                      <span className={classes.railStatus}>
                        {isDone ? 'Done' : isActive ? 'In progress' : 'Up next'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className={classes.wizardMain}>
              <div className={classes.mainTopbar}>
                <span className={classes.stepCount}>Step {step} of 4: {titles[step - 1]}</span>
                <div className={classes.mainProgress}>
                  <motion.div
                    className={classes.mainProgressFill}
                    initial={false}
                    animate={{ width: `${(step / 4) * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>

              <div className={classes.stepContent}>
                <AnimatePresence mode="wait" custom={stepDirection} initial={false}>
                  <motion.div
                    key={step}
                    className={classes.stepContentInner}
                    custom={stepDirection}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {step === 1 && <StepOne onNext={() => goStep(2)} />}
                    {step === 2 && <StepTwo selected={campaign} pausedCampaigns={pausedCampaigns} liveCampaigns={liveCampaigns} onNext={(sel) => { setCampaign(sel); goStep(3); }} onBack={() => goStep(1)} />}

                    {step === 3 && <StepThree onNext={(states, presetId) => { setWizardStates(states); setWizardPresetId(presetId ?? null); goStep(4); }} onBack={() => goStep(2)} statePresets={statePresets} onSavePresets={persistPresets} selectedPresetId={wizardPresetId} />}
                    {step === 4 && <StepFour onBack={() => goStep(3)} onGoLive={handleGoLive} isConnecting={isConnecting} campaign={campaign} licensedStates={wizardStates} walletBalance={walletBalance} liveCampaigns={liveCampaigns} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      )} {/* end !user?.flagged wizard guard */}
      {pendingDispositionCall && (
        <DispositionModal
          callSid={pendingDispositionCall}
          onComplete={() => {
            clearPendingDisposition();
            fetchData();
          }}
        />
      )}
    </motion.div>
  );
};

export default TakeCallsPage;
