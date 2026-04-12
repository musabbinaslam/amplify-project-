import { Device } from '@twilio/voice-sdk';
import useDialerStore from '../store/useDialerStore';
import { getAudioSettingsSnapshot, useAudioSettingsStore } from '../store/audioSettingsStore';
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Apply persisted mic/speaker + DSP prefs from Firestore-backed store to Twilio AudioHelper.
 */
async function applyTwilioDeviceAudio(device) {
  const audio = getAudioSettingsSnapshot();
  const helper = device.audio;
  if (!helper) return;

  try {
    if (typeof helper.setAudioConstraints === 'function') {
      await helper.setAudioConstraints({
        echoCancellation: audio.echoCancellation,
        noiseSuppression: audio.noiseSuppression,
      });
    }
  } catch (e) {
    console.warn('[Twilio] setAudioConstraints', e?.message || e);
  }

  try {
    if (typeof helper.setInputDevice === 'function') {
      const id = audio.audioInputDeviceId || 'default';
      await helper.setInputDevice(id);
    }
  } catch (e) {
    console.warn('[Twilio] setInputDevice', e?.message || e);
  }

  try {
    const out = audio.audioOutputDeviceId || 'default';
    if (helper.speakerDevices && typeof helper.speakerDevices.set === 'function') {
      await helper.speakerDevices.set(out);
    }
    if (helper.ringtoneDevices && typeof helper.ringtoneDevices.set === 'function') {
      await helper.ringtoneDevices.set(out);
    }
  } catch (e) {
    console.warn('[Twilio] output devices', e?.message || e);
  }
}

export const initializeTwilioDevice = async (passedIdentity, campaign, licensedStates = []) => {
  const store = useDialerStore.getState();

  try {
    if (passedIdentity) {
      try {
        await useAudioSettingsStore.getState().hydrate(passedIdentity);
      } catch (e) {
        console.warn('[Twilio] Could not hydrate audio settings:', e?.message || e);
      }
    }

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

    // 2. Fetch Twilio access token from the backend
    const response = await axios.post(`${API_URL}/api/voice/token`, {
      identity: passedIdentity,
      campaign
    });
    const { token } = response.data;

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
    await applyTwilioDeviceAudio(device);

    return true;
  } catch (error) {
    console.error('Error initializing Twilio Device:', error);
    store.setCallState('error');
    throw error;
  }
};
