import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';
import useDialerStore from '../../store/useDialerStore';
import classes from './DialerOverlay.module.css';

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const DialerOverlay = () => {
  const { 
    callState, 
    activeCall, 
    incomingCallerId, 
    isMuted, 
    callDuration,
    activeCampaign,
    acceptCall,
    rejectCall,
    hangUp,
    goOffline,
    toggleMute
  } = useDialerStore();

  const [ringer, setRinger] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Play a ringer sound when status is 'ringing'
    if (callState === 'ringing') {
      const audio = new Audio('/ringtone.mp3'); // We can add an asset later
      audio.loop = true;
      audio.play().catch(e => console.log('Audio autoplay prevented'));
      setRinger(audio);
    } else {
      if (ringer) {
        ringer.pause();
        ringer.currentTime = 0;
        setRinger(null);
      }
    }
    
    return () => {
      if (ringer) {
        ringer.pause();
      }
    };
  }, [callState]);

  if (callState === 'offline' || callState === 'error') {
    return null; // Don't show if not live
  }

  // Idle state (waiting for calls)
  if (callState === 'idle') {
    return (
      <div className={classes.overlayContainer}>
        <div 
           className={`${classes.idleBadge} ${isCollapsed ? classes.idleBadgeCollapsed : ''}`} 
           onClick={() => setIsCollapsed(!isCollapsed)}
           style={{ cursor: 'pointer', padding: isCollapsed ? '12px' : '16px 32px' }}
           title={isCollapsed ? "Click to expand" : "Click to collapse"}
        >
          <div className={classes.statusDot} style={{ margin: isCollapsed ? '0' : '' }} />
          {!isCollapsed && <span className={classes.idleText}>Listening for {activeCampaign || 'Campaign'} Calls...</span>}
          {!isCollapsed && (
             <button 
                className={classes.hangupBtnSmall} 
                onClick={(e) => { e.stopPropagation(); goOffline(); }} 
                title="Go Offline"
             >
               <PhoneOff size={16} />
             </button>
          )}
        </div>
      </div>
    );
  }

  // Ringing or Active state Card
  return (
    <div className={classes.overlayContainer}>
      <div className={classes.glassCard}>
        {callState === 'ringing' && <div className={classes.pulseWrapper} />}
        
        <div className={classes.header}>
          <span className={classes.title}>
            {callState === 'ringing' ? 'Incoming Call' : 'Active Call'}
          </span>
          <div className={classes.statusIndicator} style={callState === 'ringing' ? { color: 'var(--accent-purple, #A855F7)', background: 'rgba(168, 85, 247, 0.1)' } : {}}>
            <div className={`${classes.statusDot} ${callState === 'ringing' ? classes.statusDotRinging : ''}`} />
            {callState === 'ringing' ? 'Ringing' : 'Connected'}
          </div>
        </div>

        <div className={classes.callerInfo}>
          <div className={`${classes.callerAvatar} ${callState === 'ringing' ? classes.avatarRinging : ''}`}>
             <User size={32} />
          </div>
          <h2 className={classes.callerName}>
            {callState === 'active' ? 'Connected Caller' : 'Incoming Call'}
          </h2>
          <span className={classes.campaignBadge}>Campaign: {activeCampaign || 'Standard'}</span>
        </div>

        {callState === 'active' && (
          <div className={classes.timer}>
            {formatTime(callDuration)}
          </div>
        )}

        {callState === 'ringing' && (
          <div className={classes.controls}>
             <button className={`${classes.actionBtn} ${classes.rejectBtn}`} onClick={rejectCall}>
                <PhoneOff size={24} />
             </button>
             <button className={`${classes.actionBtn} ${classes.acceptBtn}`} onClick={acceptCall}>
                <Phone size={28} />
             </button>
          </div>
        )}

        {callState === 'active' && (
          <div className={classes.controls}>
             <button 
                className={`${classes.actionBtn} ${classes.muteBtn} ${isMuted ? classes.muteBtnActive : ''}`} 
                onClick={toggleMute}
             >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
             </button>
             <button className={`${classes.actionBtn} ${classes.rejectBtn}`} onClick={hangUp}>
                <PhoneOff size={24} />
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DialerOverlay;
