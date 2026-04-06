import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, Volume2, Shield, HeartPulse, Umbrella, AlertCircle,
  ChevronLeft, PhoneOff, Activity, ShieldCheck, Users,
  PhoneIncoming, DollarSign, Clock, Phone, CheckCircle2, MapPin
} from 'lucide-react';
import classes from './TakeCallsPage.module.css';
import { initializeTwilioDevice } from '../services/twilioService';
import useDialerStore from '../store/useDialerStore';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../services/apiClient';

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

// ─── Step 1: Mic & Speaker Test ─────────────────────────────────────────────
const StepOne = ({ onNext }) => {
  const [micDevices, setMicDevices] = useState([]);
  const [speakerDevices, setSpeakerDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [micTested, setMicTested] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationRef = useRef(null);

  const getDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      setMicDevices(mics);
      setSpeakerDevices(speakers);
      if (mics.length > 0 && !selectedMic) setSelectedMic(mics[0].deviceId);
      if (speakers.length > 0 && !selectedSpeaker) setSelectedSpeaker(speakers[0].deviceId);
    } catch (err) {
      setAudioError('Microphone permission denied or no devices found.');
    }
  };

  const stopMic = () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const startMic = async (deviceId) => {
    stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined } });
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const percent = Math.min(100, Math.round((sum / dataArray.length / 128) * 100));
        setMicLevel(percent);
        if (percent > 10) setMicTested(true);
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) { console.error('Mic start error:', err); }
  };

  const playTestSound = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
    setSpeakerTested(true);
  };

  useEffect(() => { getDevices(); return () => stopMic(); }, []);
  useEffect(() => { if (selectedMic) startMic(selectedMic); }, [selectedMic]);

  const isReady = micTested && speakerTested;

  return (
    <div className={classes.stepCard}>
      <div className={classes.stepHead}>
        <div className={classes.micIconBig}><Mic size={30} /></div>
        <h2>Test Your Microphone</h2>
        <p className={classes.subtitle}>Speak into your microphone to make sure it's working properly.</p>
      </div>
      {audioError && <p className={classes.errorText}>{audioError}</p>}

      <div className={classes.sectionCard}>
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

      <div className={classes.sectionCard}>
        <div className={classes.speakerHeader}>
          <div className={classes.inlineLabel}><Volume2 size={16} /> Test Your Speaker</div>
          <button className={classes.outlineBtn} onClick={playTestSound}><Volume2 size={14} /> Play Test Sound</button>
        </div>
        {!speakerTested && <div className={classes.speakerWarning}><AlertCircle size={14} /> Click to test your speaker</div>}
        {speakerTested && <div className={classes.successBox}><CheckCircle2 size={16} /> Sound played successfully</div>}
      </div>

      <div className={classes.sectionCard}>
        <div className={classes.deviceSelects}>
          <div className={classes.selectGroup}>
            <label><Mic size={14} /> Microphone</label>
            <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}>
              {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.substr(0, 5)}`}</option>)}
              {micDevices.length === 0 && <option value="">No microphones found</option>}
            </select>
          </div>
          <div className={classes.selectGroup}>
            <label><Volume2 size={14} /> Speaker</label>
            <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)}>
              {speakerDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.substr(0, 5)}`}</option>)}
              {speakerDevices.length === 0 && <option value="">Default Speaker</option>}
            </select>
          </div>
          <button className={classes.outlineBtn} onClick={getDevices}>Refresh Devices</button>
        </div>
      </div>

      <div className={classes.stickyActionBar}>
        <p className={classes.continueSub}>
          {isReady ? 'Ready to continue.' : 'Test your microphone and speaker to continue.'}
        </p>
        <button className={classes.primaryBtn} onClick={onNext} disabled={!isReady}>Continue</button>
      </div>
    </div>
  );
};

// ─── Step 2: Campaign Selection ──────────────────────────────────────────────
const StepTwo = ({ onNext, onBack }) => {
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const campaigns = [
    { id: 'fe_transfers', title: 'FE Transfers', subtitle: 'Live transfer Final Expense leads', price: '$35', buffer: '120s buffer', icon: Umbrella },
    { id: 'fe_inbounds', title: 'FE Inbounds', subtitle: 'Direct inbound Final Expense calls', price: '$25', buffer: '30s buffer', icon: PhoneIncoming },
    { id: 'medicare_transfers', title: 'Medicare Transfers', subtitle: 'Live transfer Medicare leads', price: '$25', buffer: '120s buffer', icon: HeartPulse },
    { id: 'medicare_inbound_1', title: 'Medicare Inbounds (1)', subtitle: 'High-intent Medicare inbound calls', price: '$35', buffer: '90s buffer', icon: Shield },
    { id: 'medicare_inbound_2', title: 'Medicare Inbounds (2)', subtitle: 'Standard Medicare inbound calls', price: '$18', buffer: '15s buffer', icon: ShieldCheck },
    { id: 'aca_transfers', title: 'ACA Transfers', subtitle: 'Live transfer ACA health leads', price: '$30', buffer: '120s buffer', icon: Users },
  ];

  return (
    <div className={`${classes.stepCard} ${classes.stepCardWide}`}>
      <div className={classes.stepHead}>
        <h2>Choose Your Campaign</h2>
      </div>
      <p className={classes.subtitle}>Select the campaign you'd like to receive calls from</p>
      <div className={classes.sectionCard}>
        <div className={classes.campaignsList}>
        {campaigns.map(c => (
          <div key={c.id}
            className={`${classes.campaignSelectCard} ${selectedCampaign === c.id ? classes.campaignSelectActive : ''}`}
            onClick={() => setSelectedCampaign(c.id)}>
            <div className={classes.campaignIconCol}><div className={classes.campIconWrapper}><c.icon size={24} /></div></div>
            <div className={classes.campaignInfoCol}>
              <h3>{c.title}</h3>
              <p className={classes.campaignDesc}>{c.subtitle}</p>
              <div className={classes.campaignMetrics}>
                <span className={classes.campaignPrice}>{c.price}</span>
                <span className={classes.campaignBuffer}>{c.buffer}</span>
              </div>
            </div>
            <div className={classes.campaignRadio}>
              <div className={`${classes.radioCircle} ${selectedCampaign === c.id ? classes.radioActive : ''}`}>
                {selectedCampaign === c.id && <div className={classes.radioInner} />}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className={classes.stickyActionBar}>
        <button className={classes.ghostBtn} onClick={onBack}>Back</button>
        <button className={classes.primaryBtn} onClick={() => onNext(selectedCampaign)} disabled={!selectedCampaign}>
          Continue
        </button>
      </div>
    </div>
  );
};

// ─── Step 3: Licensed States ─────────────────────────────────────────────────
const StepThree = ({ onNext, onBack }) => {
  const [selectedStates, setSelectedStates] = useState([]);
  const [search, setSearch] = useState('');

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

  return (
    <div className={`${classes.stepCard} ${classes.stepCardWide}`}>
      <div className={classes.stepHead}>
        <div className={classes.micIconBig}><MapPin size={30} /></div>
        <h2>Licensed States</h2>
      </div>
      <p className={classes.subtitle}>Select every state you are licensed to sell insurance in. You'll only receive calls from these states.</p>

      <div className={classes.sectionCard}>
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
              <button
                key={state.code}
                className={`${classes.stateChip} ${isSelected ? classes.stateChipActive : ''}`}
                onClick={() => toggleState(state.code)}
                title={state.name}
              >
                <span className={classes.stateCode}>{state.code}</span>
                <span className={classes.stateName}>{state.name}</span>
                {isSelected && <CheckCircle2 size={12} className={classes.stateCheck} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className={classes.stickyActionBar}>
        <button className={classes.ghostBtn} onClick={onBack}>Back</button>
        <button className={classes.primaryBtn} onClick={() => onNext(selectedStates)} disabled={selectedStates.length === 0}>
          Continue
        </button>
      </div>
    </div>
  );
};

// ─── Step 4: Review Rules & Go Live ─────────────────────────────────────────
const StepFour = ({ onBack, onGoLive, isConnecting, campaign, licensedStates }) => {
  const campaignLabels = {
    fe_transfers: 'FE Transfers ($35 / 120s)',
    fe_inbounds: 'FE Inbounds ($25 / 30s)',
    medicare_transfers: 'Medicare Transfers ($25 / 120s)',
    medicare_inbound_1: 'Medicare Inbounds 1 ($35 / 90s)',
    medicare_inbound_2: 'Medicare Inbounds 2 ($18 / 15s)',
    aca_transfers: 'ACA Transfers ($30 / 120s)',
  };

  return (
    <div className={classes.stepCard}>
      <div className={classes.stepHead}>
        <div className={classes.micIconBig}><Phone size={30} /></div>
        <h2>Review & Go Live</h2>
      </div>
      <p className={classes.subtitle}>Confirm your setup before going live</p>

      <div className={classes.sectionCard}>
        <div className={classes.summaryBox}>
          <div className={classes.summaryRow}>
            <span className={classes.summaryLabel}>Campaign</span>
            <span className={classes.summaryValue}>{campaignLabels[campaign] || campaign}</span>
          </div>
          <div className={classes.summaryRow}>
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
      </div>

      <div className={classes.stickyActionBar}>
        <button className={classes.ghostBtn} onClick={onBack} disabled={isConnecting}>Back</button>
        <button className={classes.primaryBtn} onClick={onGoLive} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'I Agree, Go Live'}
        </button>
      </div>
    </div>
  );
};

// ─── Call History Table ──────────────────────────────────────────────────────
const CallHistory = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return <div className={classes.emptyLogs}><p>No recent calls yet. Go live to start taking leads!</p></div>;
  }
  return (
    <div className={classes.logsTableWrapper}>
      <h3 className={classes.logsTitle}>Recent Activity</h3>
      <div className={classes.logsHeader}>
        <span className={classes.colCampaign}>Campaign</span>
        <span className={classes.colCaller}>Caller</span>
        <span className={classes.colDuration}>Duration</span>
        <span className={classes.colStatus}>Status</span>
      </div>
      <div className={classes.logsList}>
        {logs.map((log) => (
          <div key={log.id} className={classes.logItem}>
            <div className={classes.colCampaign}><span className={classes.campaignTag}>{log.campaignLabel}</span></div>
            <div className={classes.colCaller}>{log.from}</div>
            <div className={classes.colDuration}><Clock size={14} />{Math.floor(log.duration / 60)}:{(log.duration % 60).toString().padStart(2, '0')}</div>
            <div className={classes.colStatus}>
              {log.isBillable
                ? <span className={classes.badgeSale}><DollarSign size={12} /> SALE (${log.cost})</span>
                : log.status === 'completed'
                  ? <span className={classes.badgeAnswered}>Answered</span>
                  : <span className={classes.badgeMissed}>Missed</span>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────
const TakeCallsPage = () => {
  const { callState, activeCampaign, agentIdentity, licensedStates, leadData, hangUp } = useDialerStore();
  const [step, setStep] = useState(1);
  const [campaign, setCampaign] = useState('');
  const [wizardStates, setWizardStates] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [history, setHistory] = useState([]);

  const titles = ['Microphone Test', 'Select Campaign', 'Licensed States', 'Review & Go Live'];

  const fetchLogs = async () => {
    try {
      const data = await apiFetch('/api/voice/logs');
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleGoLive = async () => {
    try {
      setIsConnecting(true);
      // Use Firebase UID as the Twilio identity so call logs are saved per-user
      const { user } = useAuthStore.getState();
      const agentId = user?.uid || `agent_${Math.floor(Math.random() * 10000)}`;
      await initializeTwilioDevice(agentId, campaign, wizardStates);
    } catch (err) {
      console.error('Failed to go live:', err);
      const errorText = err.response ? err.response.data : err.message;
      alert('Failed to connect. Error: ' + JSON.stringify(errorText));
    } finally {
      setIsConnecting(false);
    }
  };

  // ── Active Dialer View ──────────────────────────────────────────────────
  if (callState !== 'offline' && callState !== 'error') {
    const isRinging = callState === 'ringing';
    
    // Dynamic Budget Calculation
    const STARTING_BUDGET = 500.00;
    const totalSpent = history.reduce((sum, log) => sum + (log.cost || 0), 0);
    const remainingBudget = Math.max(0, STARTING_BUDGET - totalSpent);

    return (
      <div className={classes.page}>
        {isRinging && (
          <div className={classes.callOverlay}>
            <div className={classes.callCard}>
              <div className={classes.incomingBadge}>INCOMING CALL</div>
              <div className={classes.callerIcon}><Activity size={48} className={classes.pulseIcon} /></div>
              <h2>{activeCampaign?.replace(/_/g, ' ').toUpperCase() || 'Insurance'} Lead</h2>
              <p>Someone is on the line waiting to speak with you.</p>

              <div className={classes.callActions}>
                <button className={classes.acceptBtn} onClick={() => useDialerStore.getState().acceptCall()}>Accept Call</button>
                <button className={classes.declineBtn} onClick={() => useDialerStore.getState().rejectCall()}>Decline</button>
              </div>
            </div>
          </div>
        )}

        <div className={`${classes.activeDialerLayout} ${isRinging ? classes.blurred : ''}`}>
          <div className={classes.pageHeader}>
            <div>
              <h1>Take Calls</h1>
              <p>Monitor live status and handle inbound leads in real time.</p>
            </div>
          </div>

          <div className={classes.topStatsRow}>
            <div className={classes.statBox}>
              <div className={classes.statLabel}>Agent ID</div>
              <div className={classes.statValue}>{agentIdentity || '---'}</div>
            </div>
            <div className={classes.statBox}>
              <div className={classes.statLabel}>Campaign</div>
              <div className={classes.statValue}>{activeCampaign?.replace(/_/g, ' ').toUpperCase() || '---'}</div>
            </div>
            <div className={classes.statBox}>
              <div className={classes.statLabel}>Remaining Budget</div>
              <div className={`${classes.statValue} ${classes.budgetGreen}`}>${remainingBudget.toFixed(2)}</div>
            </div>
          </div>

          <div className={classes.liveStatusCard}>
            <div className={classes.pulsingGlow} />
            <div className={classes.liveBadge}><div className={classes.liveDot} />Dialer Active</div>

            <h2>{callState === 'active' ? 'Currently On Call' : 'Listening for Leads'}</h2>
            <p>
              {callState === 'active'
                ? 'Stay focused on the prospect. Follow your script.'
                : 'You are connected to the AgentCalls engine. Stand by for inbound calls.'}
            </p>

            <div className={classes.actionButtons}>
              {callState === 'active'
                ? <button className={`${classes.dangerBtn} ${classes.hangUpBtn}`} onClick={hangUp}><PhoneOff size={18} /> End Call</button>
                : <button className={classes.dangerBtn} onClick={hangUp}><PhoneOff size={18} /> Pause & Go Offline</button>
              }
            </div>
          </div>

          {licensedStates && licensedStates.length > 0 && (
            <div className={classes.liveStatesCard}>
              <span className={classes.liveStatesLabel}><MapPin size={12} /> Licensed States</span>
              <div className={classes.liveStateChips}>
                {licensedStates.map(s => (
                  <span key={s} className={classes.liveStateChip}>{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className={classes.activeLogsSection}>
            <CallHistory logs={history} />
          </div>
        </div>
      </div>
    );
  }

  // ── Setup Wizard View ────────────────────────────────────────────────────
  return (
    <div className={classes.page}>
      <div className={classes.pageHeader}>
        <div>
          <h1>Take Calls</h1>
          <p>Complete setup to start receiving inbound leads.</p>
        </div>
      </div>

      <div className={classes.wizardShell}>
        <div className={classes.wizardHeader}>
          <span className={classes.stepCount}>Step {step} of 4: {titles[step - 1]}</span>
          <div className={classes.stepDots}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} className={`${classes.dot} ${step >= n ? classes.dotActive : ''}`} />
            ))}
          </div>
        </div>

        <div className={classes.mainProgress}>
          <div className={classes.mainProgressFill} style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        <div className={classes.stepContent}>
          {step === 1 && <StepOne onNext={() => setStep(2)} />}
          {step === 2 && <StepTwo onNext={(sel) => { setCampaign(sel); setStep(3); }} onBack={() => setStep(1)} />}
          {step === 3 && <StepThree onNext={(states) => { setWizardStates(states); setStep(4); }} onBack={() => setStep(2)} />}
          {step === 4 && <StepFour onBack={() => setStep(3)} onGoLive={handleGoLive} isConnecting={isConnecting} campaign={campaign} licensedStates={wizardStates} />}
        </div>
      </div>
    </div>
  );
};

export default TakeCallsPage;
