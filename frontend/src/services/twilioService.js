import { Device } from '@twilio/voice-sdk';
import useDialerStore from '../store/useDialerStore';
import useAuthStore from '../store/authStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const initializeTwilioDevice = async (identity, campaign) => {
  const store = useDialerStore.getState();
  
  try {
    const idToken = await useAuthStore.getState().getIdToken();
    const response = await axios.post(
      `${API_URL}/api/voice/token`,
      { identity, campaign },
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    const { token } = response.data;

    // 2. Initialize the Twilio Device
    const device = new Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      fakeLocalDTMF: true,
      enableRingingState: true
    });

    // 3. Register Event Listeners
    device.on('registered', () => {
      console.log('Twilio Device registered successfully');
      store.setDevice(device);
      store.setCallState('idle');
      store.setAgentContext(identity, campaign);
    });

    device.on('error', (twilioError) => {
      console.error('Twilio Device Error:', twilioError);
      store.setCallState('error');
    });

    device.on('incoming', (call) => {
      console.log('Incoming call received!', call);
      
      const callerId = call.parameters.From;
      store.setIncomingCall(call, callerId);
      
      call.on('cancel', () => {
        console.log('Call grabbed or missed');
        store.resetCallState();
      });
      
      call.on('disconnect', () => {
        console.log('Call disconnected');
        store.resetCallState();
      });
      
      call.on('reject', () => {
        console.log('Call rejected');
        store.resetCallState();
      });
      
      // When the agent actually answers the call (transitions from 'pending' to 'open')
      call.on('accept', () => {
         store.setCallState('active');
         store.setActiveCall(call);
         
         // Setup duration tracking if preferred, simple counter
         let seconds = 0;
         const interval = setInterval(() => {
           useDialerStore.getState().setCallDuration(++seconds);
         }, 1000);
         
         call.on('disconnect', () => {
           clearInterval(interval);
         });
      });
    });

    // 4. Register the device with Twilio
    await device.register();
    
    return true;
  } catch (error) {
    console.error('Error initializing Twilio Device:', error);
    store.setCallState('error');
    throw error;
  }
};
