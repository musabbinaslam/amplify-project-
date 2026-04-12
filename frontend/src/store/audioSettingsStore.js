import { create } from 'zustand';
import { loadSettings, saveSettings } from '../services/settingsService';

export const DEFAULT_AUDIO_SETTINGS = {
  audioInputDeviceId: '',
  audioOutputDeviceId: '',
  micGain: 100,
  speakerVolume: 15,
  noiseSuppression: true,
  echoCancellation: true,
};

let debounceTimer = null;
const DEBOUNCE_MS = 600;

function normalizeFromApi(loaded) {
  return {
    audioInputDeviceId: loaded?.audioInputDeviceId || '',
    audioOutputDeviceId: loaded?.audioOutputDeviceId || '',
    micGain: loaded?.micGain ?? 100,
    speakerVolume: loaded?.speakerVolume ?? 15,
    noiseSuppression: loaded?.noiseSuppression ?? true,
    echoCancellation: loaded?.echoCancellation ?? true,
  };
}

export const useAudioSettingsStore = create((set, get) => ({
  audio: { ...DEFAULT_AUDIO_SETTINGS },
  savedAudio: null,
  lastHydrateUid: null,

  normalizeFromApi,

  hydrate: async (uid) => {
    if (!uid) return;
    const loaded = await loadSettings(uid);
    const next = normalizeFromApi(loaded);
    set({
      audio: next,
      savedAudio: { ...next },
      lastHydrateUid: uid,
    });
  },

  setAudioPartial: (partial) => {
    set((s) => ({
      audio: { ...s.audio, ...partial },
    }));
  },

  resetAudioToSaved: () => {
    const { savedAudio } = get();
    if (savedAudio) set({ audio: { ...savedAudio } });
  },

  saveAudioNow: async (uid) => {
    const { audio } = get();
    if (!uid) return;
    const settings = await saveSettings(uid, audio);
    const next = normalizeFromApi(settings);
    set({ audio: next, savedAudio: { ...next } });
  },

  saveAudioDebounced: (uid, partial = null) => {
    if (partial && typeof partial === 'object') {
      get().setAudioPartial(partial);
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      try {
        const { audio } = get();
        const settings = await saveSettings(uid, audio);
        const next = normalizeFromApi(settings);
        set({ audio: next, savedAudio: { ...next } });
      } catch (err) {
        console.error('[audioSettings] debounced save failed', err);
      }
    }, DEBOUNCE_MS);
  },

  cancelDebouncedSave: () => {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  },

  /** Clear pending debounce and persist if local audio differs from last saved (e.g. before unmount). */
  flushDebouncedSave: async (uid) => {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    if (!uid) return;
    const { audio, savedAudio } = get();
    if (savedAudio && JSON.stringify(audio) === JSON.stringify(savedAudio)) return;
    try {
      const settings = await saveSettings(uid, audio);
      const next = normalizeFromApi(settings);
      set({ audio: next, savedAudio: { ...next } });
    } catch (err) {
      console.error('[audioSettings] flush save failed', err);
    }
  },
}));

export function getAudioSettingsSnapshot() {
  return useAudioSettingsStore.getState().audio;
}
