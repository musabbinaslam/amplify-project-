import { useAudioSettingsStore } from '../store/audioSettingsStore';

/**
 * Single source of truth for Firestore-backed audio fields (mic/speaker IDs, gain, volume, DSP flags).
 * Used by Settings and Take Calls (and Twilio via getAudioSettingsSnapshot).
 */
export function usePersistedAudioSettings() {
  const audio = useAudioSettingsStore((s) => s.audio);
  const savedAudio = useAudioSettingsStore((s) => s.savedAudio);
  const hydrate = useAudioSettingsStore((s) => s.hydrate);
  const setAudioPartial = useAudioSettingsStore((s) => s.setAudioPartial);
  const resetAudioToSaved = useAudioSettingsStore((s) => s.resetAudioToSaved);
  const saveAudioNow = useAudioSettingsStore((s) => s.saveAudioNow);
  const saveAudioDebounced = useAudioSettingsStore((s) => s.saveAudioDebounced);
  const flushDebouncedSave = useAudioSettingsStore((s) => s.flushDebouncedSave);
  const cancelDebouncedSave = useAudioSettingsStore((s) => s.cancelDebouncedSave);

  return {
    audio,
    savedAudio,
    hydrate,
    setAudioPartial,
    resetAudioToSaved,
    saveAudioNow,
    saveAudioDebounced,
    flushDebouncedSave,
    cancelDebouncedSave,
  };
}
