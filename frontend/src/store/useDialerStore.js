import { create } from 'zustand';

const useDialerStore = create((set, get) => ({
  // Core State
  device: null,
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

  // Actions
  setDevice: (device) => set({ device }),
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
    if (device) {
      device.disconnectAll();
    }
    get().resetCallState();
  },
  
  toggleMute: () => {
    const { activeCall, isMuted } = get();
    if (activeCall) {
      activeCall.mute(!isMuted);
      set({ isMuted: !isMuted });
    }
  }
}));

export default useDialerStore;
