import { Device } from '@twilio/voice-sdk';
import useDialerStore from '../store/useDialerStore';
import useAuthStore from '../store/authStore';
import { getAudioSettingsSnapshot, useAudioSettingsStore } from '../store/audioSettingsStore';
import { getApiBaseUrl } from '../config/apiBase';
import { io } from 'socket.io-client';
import { apiFetch } from './apiClient';

const API_URL = () => getApiBaseUrl();

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
    const socket = io(API_URL());

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

        // 1.1 Heartbeat to prevent Redis ghost agents
        if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
        socket._heartbeatInterval = setInterval(() => {
            if (socket.connected) {
                socket.emit('agent:heartbeat', { agentId: passedIdentity });
            }
        }, 30000);

        resolve();
      });
      
      socket.on('disconnect', () => {
          if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
      });
      
      socket.on('connect_error', (err) => reject(err));
    });

    // 2. Fetch Twilio access token from the backend (using apiFetch instead of axios to pass Auth header properly)
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

    // Handle token rotation automatically before it expires (1hr limit)
    device.on('tokenWillExpire', async () => {
      try {
        console.log('[Twilio] Token expiring soon. Fetching fresh token...');
        const res = await apiFetch('/api/voice/token', {
          method: 'POST',
          body: {
            identity: passedIdentity,
            campaign
          }
        });
        if (res?.token) {
          device.updateToken(res.token);
          console.log('[Twilio] ✅ Token successfully refreshed in background.');
        }
      } catch (err) {
        console.error('[Twilio] ❌ Failed to refresh token before expiration:', err);
      }
    });

    device.on('incoming', (call) => {
      console.log('Incoming call received!', call);

      const callerId = call.parameters.From;
      store.setIncomingCall(call, callerId);

      call.on('cancel', () => {
        if (call._durationInterval) clearInterval(call._durationInterval);
        socket.emit('agent:release');
        store.resetCallState();
      });
      call.on('reject', () => {
        if (call._durationInterval) clearInterval(call._durationInterval);
        socket.emit('agent:release');
        store.resetCallState();
      });
      call.on('error', () => {
          if (call._durationInterval) clearInterval(call._durationInterval);
      });

      call.on('accept', () => {
        store.setCallState('active');
        store.setActiveCall(call);

        let seconds = 0;
        if (call._durationInterval) clearInterval(call._durationInterval);
        call._durationInterval = setInterval(() => {
          useDialerStore.getState().setCallDuration(++seconds);
        }, 1000);

        call.on('disconnect', () => {
          if (call._durationInterval) clearInterval(call._durationInterval);
          socket.emit('agent:release');

          store.resetCallState();
        });
      });
    });

    // 5. Register the device with Twilio
    await device.register();
    await applyTwilioDeviceAudio(device);

    // 6. Live-apply audio settings changes while the device is alive.
    //    Twilio's AudioHelper re-applies setAudioConstraints / setInputDevice
    //    on the active mic track, so flipping the toggles in Settings takes
    //    effect on an already-running call within the next getUserMedia cycle.
    const unsubscribeAudioSettings = useAudioSettingsStore.subscribe((state, prev) => {
      const prevAudio = prev?.audio || {};
      const nextAudio = state?.audio || {};
      const changed =
        nextAudio.noiseSuppression !== prevAudio.noiseSuppression ||
        nextAudio.echoCancellation !== prevAudio.echoCancellation ||
        nextAudio.audioInputDeviceId !== prevAudio.audioInputDeviceId ||
        nextAudio.audioOutputDeviceId !== prevAudio.audioOutputDeviceId;
      if (!changed) return;
      applyTwilioDeviceAudio(device).catch((err) =>
        console.warn('[Twilio] re-apply audio settings', err?.message || err)
      );
    });
    if (typeof store.setAudioSettingsUnsubscribe === 'function') {
      store.setAudioSettingsUnsubscribe(unsubscribeAudioSettings);
    }

    return true;
  } catch (error) {
    console.error('Error initializing Twilio Device:', error);
    store.setCallState('error');
    throw error;
  }
};
