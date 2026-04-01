import { create } from 'zustand';

const useDialerStore = create((set, get) => ({
  // Core State
  device: null,
  callState: 'offline', // 'offline' | 'idle' (ready) | 'ringing' | 'active'
  activeCall: null,
  
  // Agent Context
  agentIdentity: null,
  activeCampaign: null,

  // UI State
  isMuted: false,
  callDuration: 0,
  incomingCallerId: null,

  // Actions
  setDevice: (device) => set({ device }),
  setCallState: (state) => set({ callState: state }),
  setActiveCall: (call) => set({ activeCall: call }),
  setAgentContext: (identity, campaign) => set({ 
    agentIdentity: identity, 
    activeCampaign: campaign 
  }),
  setIncomingCall: (call, callerId) => set({ 
    activeCall: call, 
    callState: 'ringing',
    incomingCallerId: callerId 
  }),
  setMuted: (muted) => set({ isMuted: muted }),
  setCallDuration: (duration) => set({ callDuration: duration }),
  
  // Cleanup
  resetCallState: () => set({ 
    callState: 'idle', 
    activeCall: null, 
    isMuted: false, 
    callDuration: 0,
    incomingCallerId: null
  }),

  // Actions for the Call
  acceptCall: () => {
    const { activeCall } = get();
    if (activeCall && activeCall.status === 'pending') {
      activeCall.accept();
      set({ callState: 'active' });
    }
  },

  rejectCall: () => {
    const { activeCall } = get();
    if (activeCall && activeCall.status === 'pending') {
      activeCall.reject();
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
