import { Device } from '@twilio/voice-sdk';
import useDialerStore from '../store/useDialerStore';
import useAuthStore from '../store/authStore';
import { getAudioSettingsSnapshot, useAudioSettingsStore } from '../store/audioSettingsStore';
import { getApiBaseUrl } from '../config/apiBase';
import { io } from 'socket.io-client';
import { apiFetch } from './apiClient';

const API_URL = () => getApiBaseUrl();
const HEARTBEAT_INTERVAL_MS = 45000;

function createLiveSessionId(identity) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${identity}:${crypto.randomUUID()}`;
    }
  } catch (_) {
    // no-op fallback below
  }
  return `${identity}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

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
  const liveSessionId = createLiveSessionId(passedIdentity || 'agent');

  try {
    if (passedIdentity) {
      try {
        await useAudioSettingsStore.getState().hydrate(passedIdentity);
      } catch (e) {
        console.warn('[Twilio] Could not hydrate audio settings:', e?.message || e);
      }
    }

    // 1. Connect Socket.IO and validate session (Stage 1 — no pool entry yet)
    const socket = io(API_URL());

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('[Twilio] Socket connected:', socket.id);
        store.setSocket && store.setSocket(socket);
        // Emit go_live for balance check + session setup.
        // Backend responds with agent:live_pending (NOT live_confirmed yet).
        socket.emit('agent:go_live', {
          campaign,
          agentId: passedIdentity,
          licensedStates,
          sessionId: liveSessionId,
        });
        socket._agentSessionId = liveSessionId;

        // Heartbeat keeps the Redis key alive while the device initialises
        if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
        socket._heartbeatInterval = setInterval(() => {
          if (socket.connected) {
            socket.emit('agent:heartbeat', {
              agentId: passedIdentity,
              sessionId: socket._agentSessionId || liveSessionId,
            });
          }
        }, HEARTBEAT_INTERVAL_MS);
      });

      // Stage 1 complete — balance OK, session stored, proceed to device init
      socket.on('agent:live_pending', () => resolve());

      // Backend rejected go_live (e.g. zero wallet balance)
      socket.on('agent:go_live_error', (data) => {
        if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
        socket.disconnect();
        const err = new Error(data?.message || 'Cannot go live. Please check your wallet balance.');
        err.code    = data?.code    || 'GO_LIVE_ERROR';
        err.balance = data?.balance ?? 0;
        reject(err);
      });

      socket.on('disconnect', () => {
        if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
      });

      socket.on('connect_error', (err) => reject(err));
    });

    // 2. Fetch Twilio access token from the backend
    const { token } = await apiFetch('/api/voice/token', {
      method: 'POST',
      body: { identity: passedIdentity, campaign }
    });

    // 3. Initialize the Twilio Device
    const device = new Device(token, {
      codecPreferences: ['opus', 'pcmu'],
      fakeLocalDTMF: true,
      enableRingingState: true,
      edge: ['ashburn', 'roaming']
    });

    // 4. Register event listeners BEFORE calling device.register()
    const leavePoolAndOffline = (reason) => {
      console.warn(`[Twilio] ${reason} — leaving routing pool`);
      if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);
      if (socket.connected) {
        socket.emit('agent:go_offline', { sessionId: socket._agentSessionId || liveSessionId });
      }
      try { device.destroy(); } catch (_) { /* ignore */ }
      const dialerStore = useDialerStore.getState();
      if (typeof dialerStore.goOffline === 'function') {
        dialerStore.goOffline();
      } else {
        dialerStore.setDevice?.(null);
        dialerStore.setCallState?.('offline');
      }
    };

    device.on('registered', () => {
      console.log('[Twilio] Device registered ✔ — notifying backend to enter routing pool');
      store.setDevice(device);
      store.setCallState('idle');
      store.setAgentContext(passedIdentity, campaign, licensedStates);

      // ⭐ Stage 2: Tell the backend the Twilio Device is ready.
      // Only NOW does the agent enter the routing pool.
      // This prevents "Failed" outgoing dials caused by the pool registration
      // happening before the Twilio edge server knows about this client.
      if (socket.connected) {
        socket.emit('agent:pool_ready');
      }
    });

    device.on('unregistered', () => {
      const cs = useDialerStore.getState().callState;
      if (cs === 'active' || cs === 'ringing') return;
      leavePoolAndOffline('Device unregistered');
    });

    device.on('error', (twilioError) => {
      console.error('Twilio Device Error:', twilioError);
      const cs = useDialerStore.getState().callState;
      if (cs !== 'active' && cs !== 'ringing') {
        store.setCallState('error');
        const code = Number(twilioError?.code || 0);
        // Fatal registration / token errors — don't stay in pool with a dead device
        if ([31009, 31201, 31204, 31205, 31206, 53000, 53001].includes(code)) {
          leavePoolAndOffline(`Device error ${code}`);
        }
      }
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
        }, () => useAuthStore.getState().getIdToken(true));
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
      const callSid = call.parameters.CallSid || call.parameters.callSid || null;
      const emitCallDelivered = (eventName) => {
        if (!socket.connected) {
          console.warn(`[Twilio] Socket disconnected — cannot emit ${eventName}; server dial-status will promote IN_CALL`);
          return;
        }
        socket.emit(eventName, {
          agentId: passedIdentity,
          sessionId: socket._agentSessionId || liveSessionId,
          callSid,
          from: callerId,
          to: call.parameters.To || null,
          campaignId: campaign,
        });
      };
      emitCallDelivered('agent:call_incoming');
      store.setIncomingCall(call, callerId);

      call.on('cancel', () => {
        if (call._durationInterval) clearInterval(call._durationInterval);
        socket.emit('agent:release', { sessionId: socket._agentSessionId || liveSessionId });
        store.resetCallState();
      });
      call.on('reject', () => {
        if (call._durationInterval) clearInterval(call._durationInterval);
        socket.emit('agent:release', { sessionId: socket._agentSessionId || liveSessionId });
        store.resetCallState();
      });
      call.on('error', () => {
          if (call._durationInterval) clearInterval(call._durationInterval);
      });

      call.on('accept', () => {
        emitCallDelivered('agent:call_accepted');
        store.setCallState('active');
        store.setActiveCall(call);

        let seconds = 0;
        if (call._durationInterval) clearInterval(call._durationInterval);
        call._durationInterval = setInterval(() => {
          useDialerStore.getState().setCallDuration(++seconds);
        }, 1000);

        call.on('disconnect', () => {
          if (call._durationInterval) clearInterval(call._durationInterval);
          // Instead of releasing the agent here, we set the pending disposition call.
          // The agent remains in WRAP_UP mode on the backend until they submit the disposition.
          useDialerStore.getState().setPendingDisposition(call.parameters.CallSid);
          store.resetCallState();
        });
      });
    });

    // 5. Register the device with Twilio.
    // device.on('registered') fires → emits agent:pool_ready → backend responds with
    // agent:live_confirmed → agent enters routing pool. We wait for both.
    await Promise.all([
      device.register(),
      new Promise((resolve) => {
        // 10-second safety timeout: if backend confirmation is delayed, proceed anyway.
        // The ghost-cleanup sweep will correct any inconsistency within 90 seconds.
        const safetyTimer = setTimeout(() => {
          console.warn('[Twilio] live_confirmed timeout — proceeding anyway');
          resolve();
        }, 10000);
        socket.once('agent:live_confirmed', () => {
          clearTimeout(safetyTimer);
          resolve();
        });
      }),
    ]);
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

    // 7. Balance exhausted — fires AFTER a call ends and billing deducts the final credit.
    //    The call itself was never interrupted. This handler takes the agent offline cleanly
    //    and redirects them to billing so they can top up.
    socket.on('agent:balance_exhausted', () => {
      console.log('[Wallet] 📦 Balance exhausted after call — taking agent offline automatically');

      // Stop heartbeat
      if (socket._heartbeatInterval) clearInterval(socket._heartbeatInterval);

      // Tell backend to remove from routing pool
      socket.emit('agent:go_offline', { sessionId: socket._agentSessionId || liveSessionId });

      // Destroy Twilio Device so no more calls can ring through
      try { device.destroy(); } catch (_) { /* ignore */ }

      // Reset dialer store
      const dialerStore = useDialerStore.getState();
      if (typeof dialerStore.goOffline === 'function') {
        dialerStore.goOffline();
      } else {
        dialerStore.setDevice   && dialerStore.setDevice(null);
        dialerStore.setCallState && dialerStore.setCallState('offline');
      }

      // Show a persistent toast and redirect to billing after a short delay
      // so the agent has time to read the message before the page changes
      import('react-hot-toast').then(({ default: toast }) => {
        toast(
          '💳 Your last call was billed and your balance is now too low for another call. Redirecting to top up…',
          { duration: 4000 }
        );
      }).catch(() => {});

      setTimeout(() => {
        window.location.href = '/app/billing';
      }, 3500);
    });

    return true;
  } catch (error) {
    console.error('Error initializing Twilio Device:', error);
    store.setCallState('error');
    throw error;
  }
};
