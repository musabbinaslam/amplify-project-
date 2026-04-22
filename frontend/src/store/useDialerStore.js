import { create } from 'zustand';

const useDialerStore = create((set, get) => ({
  // Core State
  device: null,
  socket: null,
  callState: 'offline', // 'offline' | 'idle' (ready) | 'ringing' | 'active'
  activeCall: null,
  
  // Agent Context
  agentIdentity: null,
  activeCampaign: null,
  licensedStates: [],

  // UI State
  isMuted: false,
  callDuration: 0,
  incomingCallerId: null,
  leadData: null,

  // Lifecycle handle for live-applying audio settings to the Twilio device.
  // Set by twilioService after device registration, invoked on teardown.
  audioSettingsUnsubscribe: null,

  // Actions
  setDevice: (device) => set({ device }),
  setSocket: (socket) => set({ socket }),
  setAudioSettingsUnsubscribe: (unsub) => {
    const { audioSettingsUnsubscribe } = get();
    if (audioSettingsUnsubscribe) {
      try { audioSettingsUnsubscribe(); } catch (e) { /* noop */ }
    }
    set({ audioSettingsUnsubscribe: unsub });
  },
  setCallState: (state) => set({ callState: state }),
  setActiveCall: (call) => set({ activeCall: call }),
  setAgentContext: (identity, campaign, states = []) => set({ 
    agentIdentity: identity, 
    activeCampaign: campaign,
    licensedStates: states
  }),
  setIncomingCall: (call, callerId) => {
    // Extract lead custom parameters injected by our backend
    const leadData = {};
    if (call.customParameters) {
        call.customParameters.forEach((val, key) => {
            if (key.startsWith('lead_')) {
                leadData[key.replace('lead_', '')] = val;
            }
        });
    }

    set({ 
      activeCall: call, 
      callState: 'ringing',
      incomingCallerId: callerId,
      leadData: Object.keys(leadData).length > 0 ? leadData : null
    });
  },
  setMuted: (muted) => set({ isMuted: muted }),
  setCallDuration: (duration) => set({ callDuration: duration }),

  showDispositionFor: (meta) => set({ pendingDisposition: meta }),
  clearPendingDisposition: () => set({ pendingDisposition: null }),
  
  // Cleanup
  resetCallState: () => set({ 
    callState: 'idle', 
    activeCall: null, 
    isMuted: false, 
    callDuration: 0,
    incomingCallerId: null,
    leadData: null
  }),

  // Actions for the Call
  acceptCall: async () => {
    const { activeCall } = get();
    console.log('DEBUG: Attempting to accept call. Call state is:', activeCall?.state);
    
    if (activeCall) {
      try {
        activeCall.accept();
        set({ callState: 'active' });
        console.log('DEBUG: Call accepted successfully.');
      } catch (err) {
        console.error('DEBUG: ERROR ACCEPTING CALL:', err);
        alert('Could not answer call. Check your microphone permissions!');
        
        // Fix: Prevent soft-lock by forcefully rejecting the call back to Twilio
        // so the agent returns to 'idle' and the caller isn't hung in dead-air.
        get().rejectCall();
      }
    } else {
      console.warn('DEBUG: No active call found in store to accept.');
    }
  },

  rejectCall: () => {
    const { activeCall } = get();
    console.log('DEBUG: Rejecting incoming call.');
    if (activeCall) {
       try {
         activeCall.reject();
       } catch (err) {
         console.error('DEBUG: Error rejecting call:', err);
       }
       get().resetCallState();
    }
  },

  hangUp: () => {
    const { activeCall, device } = get();
    if (activeCall) {
      activeCall.disconnect();
    }
    get().resetCallState();
  },

  goOffline: () => {
    const { device, socket, audioSettingsUnsubscribe } = get();
    console.log('DEBUG: Going offline & destroying connections');

    if (audioSettingsUnsubscribe) {
      try { audioSettingsUnsubscribe(); } catch (e) { /* noop */ }
    }

    if (device) {
      try { device.destroy(); } catch(e){}
    }

    if (socket) {
      try { socket.disconnect(); } catch(e){}
    }

    set({
      device: null,
      socket: null,
      audioSettingsUnsubscribe: null,
      callState: 'offline',
      activeCall: null,
      isMuted: false,
      callDuration: 0,
      incomingCallerId: null,
      leadData: null
    });
  },
  
  toggleMute: () => {
    const { activeCall, isMuted } = get();
    if (activeCall) {
      const nextMute = !isMuted;
      console.log('DEBUG: Muting microphone state:', nextMute);
      
      // Depending on the Twilio Voice SDK version, mute() takes a boolean
      if (typeof activeCall.mute === 'function') {
        activeCall.mute(nextMute);
      }
      
      // Fallback: manually pause the browser's MediaStream tracks immediately
      try {
        const localStream = activeCall.getLocalStream ? activeCall.getLocalStream() : activeCall.mediaStream;
        if (localStream && localStream.getAudioTracks) {
          localStream.getAudioTracks().forEach(track => {
            track.enabled = !nextMute;
          });
        }
      } catch (err) {
        console.warn('Fallback stream mute ignored:', err);
      }

      set({ isMuted: nextMute });
    }
  }
}));

export default useDialerStore;
