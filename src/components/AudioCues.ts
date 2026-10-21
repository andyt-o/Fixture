// ==============================================================================
// Imports
// ==============================================================================
import { loadSettings } from "../api/Settings";

// ==============================================================================
// Functions
// ==============================================================================
export async function playNotificationChime(): Promise<void> {
  const settings = await loadSettings().catch(() => null);
  if (settings && (!settings.overlay.soundEnabled || settings.notifications.globalMute)) return;

  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = audioCtx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(523.25, now, 0.28);
    playTone(659.25, now + 0.1, 0.35);
  } catch {
    return;
  }
}
