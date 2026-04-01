import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Shield, HeartPulse, Umbrella, AlertCircle, ChevronLeft, PhoneOff, Activity } from 'lucide-react';
import classes from './TakeCallsPage.module.css';

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
      // Prompt for permission to get real device labels
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

  useEffect(() => {
    getDevices();
    return () => stopMic();
  }, []);

  useEffect(() => {
    if (selectedMic) {
      startMic(selectedMic);
    }
  }, [selectedMic]);

  const stopMic = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const startMic = async (deviceId) => {
    stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined } 
      });
      mediaStreamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        let average = sum / dataArray.length;
        let percent = Math.min(100, Math.round((average / 128) * 100));
        
        setMicLevel(percent);
        if (percent > 10) {
           setMicTested(true);
        }
        
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (err) {
      console.error('Mic start error:', err);
    }
  };

  const playTestSound = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Create a pleasant chirp
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Route to specific speaker if browser supports it
    if (selectedSpeaker && typeof audioCtx.setSinkId === 'function') {
      audioCtx.setSinkId(selectedSpeaker).catch(console.error);
    }

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
    
    setSpeakerTested(true);
  };

  const isReady = micTested && speakerTested;

  return (
    <div className={classes.stepCard}>
      <div className={classes.micIconBig}>
        <Mic size={32} />
      </div>
      <h2>Test Your Microphone</h2>
      <p className={classes.subtitle}>Speak into your microphone to make sure it's working properly</p>
      
      {audioError && <p style={{color: 'var(--accent-red)', fontSize: '14px', marginBottom: '16px'}}>{audioError}</p>}

      <div className={classes.levelContainer}>
        <div className={classes.levelHeader}>
          <span>Input Level</span>
          <span className={classes.levelPercent}>{micLevel}%</span>
        </div>
        <div className={classes.progressBar}>
          <div className={classes.progressFill} style={{ width: `${micLevel}%` }}></div>
          <div className={classes.progressMarker} style={{ left: '10%' }}></div>
        </div>
        <p className={classes.testLabel}>Say something to test your microphone</p>
      </div>

      {micTested ? (
         <div className={classes.successBox}>
            <CheckCircle2 size={16} /> Microphone detected!
         </div>
      ) : (
         <div className={classes.successBox} style={{ opacity: 0.5, borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <Mic size={16} /> Waiting for audio input...
         </div>
      )}

      <div className={classes.speakerTest}>
        <div className={classes.speakerHeader}>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}><Volume2 size={16} /> Test Your Speaker</div>
          <button className={classes.speakerBtn} onClick={playTestSound}>
             <Volume2 size={14} /> Play Test Sound
          </button>
        </div>
        {!speakerTested && (
           <div className={classes.speakerWarning}>
             <AlertCircle size={14} /> Click to test your speaker
           </div>
        )}
        {speakerTested && (
           <div className={classes.successBox} style={{marginTop: '12px', marginBottom: 0}}>
              <CheckCircle2 size={16} /> Sound played successfully
           </div>
        )}
      </div>

      <div className={classes.deviceSelects}>
        <div className={classes.selectGroup}>
          <label><Mic size={14} /> Microphone</label>
          <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}>
            {micDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.substr(0,5)}`}</option>)}
            {micDevices.length === 0 && <option value="">No microphones found</option>}
          </select>
        </div>
        <div className={classes.selectGroup}>
          <label><Volume2 size={14} /> Speaker</label>
          <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)}>
            {speakerDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.substr(0,5)}`}</option>)}
            {speakerDevices.length === 0 && <option value="">Default Speaker</option>}
          </select>
        </div>
        <button className={classes.refreshBtn} onClick={getDevices}>Refresh Devices</button>
      </div>

      <button 
         className={classes.continueBtn} 
         onClick={onNext}
         disabled={!isReady}
         style={{ opacity: isReady ? 1 : 0.5, cursor: isReady ? 'pointer' : 'not-allowed' }}
      >
         Continue →
      </button>
      {!isReady && <p className={classes.continueSub}>Test your microphone and speaker to continue</p>}
    </div>
  );
};

const CheckCircle2 = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

const StepTwo = ({ onNext, onBack }) => {
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState('');

  if (!activeCategory) {
    return (
      <div className={classes.stepCard}>
        <h2>Select Category</h2>
        <p className={classes.subtitle}>What type of insurance calls do you want to take?</p>
        <div className={classes.categoryGrid}>
          <div 
             className={classes.categoryOption}
             onClick={() => setActiveCategory('life')}
          >
            <div className={classes.catIconBox}><Umbrella size={24} /></div>
            <h3>Life Insurance</h3>
          </div>
          <div 
             className={classes.categoryOption}
             onClick={() => setActiveCategory('health')}
          >
            <div className={classes.catIconBox}><HeartPulse size={24} /></div>
            <h3>Health Insurance</h3>
          </div>
        </div>
        <div className={classes.navBtnsRow}>
           <button className={classes.backBtn} onClick={onBack}>← Back</button>
           <button 
             className={classes.continueBtn}
             disabled={true}
             style={{ opacity: 0.5, cursor: 'not-allowed', width: 'auto', marginBottom: 0, paddingLeft: '32px', paddingRight: '32px' }}
           >
             Continue →
           </button>
        </div>
      </div>
    );
  }

  const campaigns = activeCategory === 'life' 
    ? [ { id: 'final_expense', title: 'Final Expense', subtitle: 'Final expense and burial insurance', price: '$60/call', buffer: '90s buffer', icon: Umbrella } ]
    : [
        { id: 'aca', title: 'ACA', subtitle: 'Affordable Care Act marketplace plans', price: '$50/call', buffer: '90s buffer', icon: Shield },
        { id: 'medicare', title: 'Medicare', subtitle: 'Medicare Advantage & Supplement plans', price: '$35/call', buffer: '25s buffer', icon: HeartPulse }
      ];

  return (
    <div className={classes.stepCard} style={{ maxWidth: '650px' }}>
      <h2>Choose Your Campaign</h2>
      <p className={classes.subtitle}>Select the campaign you'd like to receive calls from</p>
      
      <div className={classes.changeCatBtn} onClick={() => { setActiveCategory(null); setSelectedCampaign(''); }}>
         <ChevronLeft size={16} /> Change Category
      </div>

      <div className={classes.campaignsList}>
         {campaigns.map(c => (
            <div 
               key={c.id}
               className={`${classes.campaignSelectCard} ${selectedCampaign === c.id ? classes.campaignSelectActive : ''}`}
               onClick={() => setSelectedCampaign(c.id)}
            >
               <div className={classes.campaignIconCol}>
                 <div className={classes.campIconWrapper}>
                   <c.icon size={24} />
                 </div>
               </div>
               <div className={classes.campaignInfoCol}>
                  <h3>{c.title}</h3>
                  <p className={classes.campaignDesc}>{c.subtitle}</p>
                  <div className={classes.campaignMetrics}>
                     <span className={classes.campaignPrice}>{c.price}</span>
                     <span className={classes.campaignBuffer}>{c.buffer}</span>
                  </div>
                  <p className={classes.campaignDisclaimer}>Disclaimer: To maintain high-intent call quality, some calls may be pre-screened through our pre-screening line. All callers originate from paid advertising and have called in requesting information.</p>
               </div>
               <div className={classes.campaignRadio}>
                  <div className={`${classes.radioCircle} ${selectedCampaign === c.id ? classes.radioActive : ''}`}>
                    {selectedCampaign === c.id && <div className={classes.radioInner} />}
                  </div>
               </div>
            </div>
         ))}
      </div>

      <div className={classes.navBtnsRow} style={{ marginTop: '32px' }}>
         <button className={classes.backBtnDark} onClick={onBack}>← Back</button>
         <button 
           className={classes.continueBtnGreen} 
           onClick={() => onNext(selectedCampaign)}
           disabled={!selectedCampaign}
           style={{ opacity: selectedCampaign ? 1 : 0.5, cursor: selectedCampaign ? 'pointer' : 'not-allowed' }}
         >
           Continue →
         </button>
      </div>
    </div>
  );
};

const StepThree = ({ onBack, onGoLive, isConnecting }) => (
  <div className={classes.stepCard}>
    <div className={classes.micIconBig}>
      <PhoneIcon size={32} />
    </div>
    <h2>Review Call Rules</h2>
    <p className={classes.subtitle}>Please acknowledge the following rules before going live</p>
    
    <div className={classes.rulesList}>
      <div className={classes.ruleItem}>
        <div className={classes.ruleNum}>1</div>
        <p>Follow the script to properly qualify the prospect.</p>
      </div>
      <div className={classes.ruleItem}>
        <div className={classes.ruleNum}>2</div>
        <p>Do not quote any prices or plans within the campaign buffer time (90 seconds).</p>
      </div>
      <div className={classes.ruleItem}>
        <div className={classes.ruleNum}>3</div>
        <p>Do not ask for their callback number or give them your personal number within the campaign buffer time (90 seconds).</p>
      </div>
    </div>

    <div className={classes.warningBox}>
      <AlertCircle size={18} />
      <p>After the campaign buffer time (90 seconds), you're free to take control of the conversation however you see fit.</p>
    </div>

    <div className={classes.navBtnsRow}>
      <button className={classes.backBtn} onClick={onBack} disabled={isConnecting}>← Back</button>
      <button 
         className={classes.goLiveBtn} 
         onClick={onGoLive}
         disabled={isConnecting}
         style={{ opacity: isConnecting ? 0.7 : 1, cursor: isConnecting ? 'wait' : 'pointer' }}
      >
        {isConnecting ? 'Connecting to Twilio...' : 'I Agree, Go Live →'}
      </button>
    </div>
  </div>
);

const PhoneIcon = ({ size }) => (
   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
   </svg>
)

import { initializeTwilioDevice } from '../services/twilioService';
import useDialerStore from '../store/useDialerStore';
import { useNavigate } from 'react-router-dom';

const TakeCallsPage = () => {
  const { callState, activeCampaign, hangUp } = useDialerStore();
  const [step, setStep] = useState(1);
  const [campaign, setCampaign] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const titles = ['Microphone Test', 'Select Campaign', 'Review Rules'];

  const handleGoLive = async () => {
    try {
      setIsConnecting(true);
      // Generate a mock identity for the agent for now. In a real app, this comes from an Auth Context or JWT
      const mockAgentId = `agent_${Math.floor(Math.random() * 10000)}`;
      
      await initializeTwilioDevice(mockAgentId, campaign);
      
      // Setup successful, the Zustand store will be updated and trigger the Active View

    } catch (err) {
      console.error('Failed to go live:', err);
      // Give more visibility into the error
      const errorText = err.response ? err.response.data : err.message;
      alert('Failed to connect to phone system. Error: ' + JSON.stringify(errorText));
    } finally {
      setIsConnecting(false);
    }
  };

  if (callState !== 'offline' && callState !== 'error') {
    return (
      <div className={classes.container}>
        <div className={classes.activeDialerContainer}>
          <div className={classes.pulsingGlow} />
          <div className={classes.liveBadge}>
            <div className={classes.liveDot} />
            Dialer Active
          </div>
          <h1>Listening for {activeCampaign || 'Campaign'} Calls</h1>
          <p>
            You are successfully connected to the dialing engine. Keep this window open, 
            and the system will route incoming Trackdrive calls directly to your headset as soon as they become available.
          </p>
          <button className={classes.offlineBtn} onClick={hangUp}>
            <PhoneOff size={20} /> Pause & Go Offline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.container}>
      <div className={classes.wizardHeader}>
        <span className={classes.stepCount}>Step {step} of 3: {titles[step - 1]}</span>
        <div className={classes.stepDots}>
          <div className={`${classes.dot} ${step >= 1 ? classes.dotActive : ''}`} />
          <div className={`${classes.dot} ${step >= 2 ? classes.dotActive : ''}`} />
          <div className={`${classes.dot} ${step >= 3 ? classes.dotActive : ''}`} />
        </div>
      </div>
      
      <div className={classes.mainProgress}>
        <div className={classes.mainProgressFill} style={{ width: `${(step / 3) * 100}%` }}></div>
      </div>

      <div className={classes.stepContent}>
        {step === 1 && <StepOne onNext={() => setStep(2)} />}
        {step === 2 && <StepTwo onNext={(selected) => { setCampaign(selected); setStep(3); }} onBack={() => setStep(1)} />}
        {step === 3 && <StepThree onBack={() => setStep(2)} onGoLive={handleGoLive} isConnecting={isConnecting} />}
      </div>
    </div>
  );
};

export default TakeCallsPage;
