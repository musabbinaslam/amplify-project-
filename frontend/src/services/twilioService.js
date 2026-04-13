import { Device } from '@twilio/voice-sdk';
import useDialerStore from '../store/useDialerStore';
import { io } from 'socket.io-client';
import { apiFetch } from './apiClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const initializeTwilioDevice = async (passedIdentity, campaign, licensedStates = []) => {
  const store = useDialerStore.getState();

  try {
    // 1. Connect Socket.IO FIRST
    const socket = io(API_URL);

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('Socket connected! Socket ID:', socket.id);
        store.setSocket && store.setSocket(socket);
        // Register with campaign AND licensed states for LRU routing
        socket.emit('agent:go_live', {
          campaign,
          agentId: passedIdentity,
          licensedStates
        });
        resolve();
      });
      socket.on('connect_error', (err) => reject(err));
    });

    // 2. Fetch Twilio access token from the backend (using apiFetch instead of axios to pass Auth header)
    const { token } = await apiFetch('/api/voice/token', {
      method: 'POST',
      body: {
        identity: passedIdentity,
        campaign
      }
    });

    // 3. Initialize the Twilio Device
    const device = new Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      fakeLocalDTMF: true,
      enableRingingState: true,
      edge: ['ashburn', 'roaming']
    });

    // 4. Register Event Listeners
    device.on('registered', () => {
      console.log('Twilio Device registered successfully');
      store.setDevice(device);
      store.setCallState('idle');
      store.setAgentContext(passedIdentity, campaign, licensedStates);
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
        socket.emit('agent:release');
        store.resetCallState();
      });
      call.on('reject', () => {
        socket.emit('agent:release');
        store.resetCallState();
      });

      call.on('accept', () => {
        store.setCallState('active');
        store.setActiveCall(call);

        let seconds = 0;
        const interval = setInterval(() => {
          useDialerStore.getState().setCallDuration(++seconds);
        }, 1000);

        call.on('disconnect', () => {
          clearInterval(interval);
          socket.emit('agent:release');
          store.resetCallState();
        });
      });
    });

    // 5. Register the device with Twilio
    await device.register();

    return true;
  } catch (error) {
    console.error('Error initializing Twilio Device:', error);
    store.setCallState('error');
    throw error;
  }
};
