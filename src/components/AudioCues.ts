// ==============================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";

// ==============================================================================
// Functions
// ==============================================================================

// Synthesizes a subtle, pleasant notification chime using the Web Audio API
export async function playNotificationChime(): Promise<void> {
  const settings = await invoke<{ soundEnabled: boolean }>("get_app_settings").catch(() => ({ soundEnabled: true }));
  if (!settings.soundEnabled) return;

  const notifs = await invoke<{ globalMute: boolean }>("get_notifications").catch(() => ({ globalMute: false }));
  if (notifs.globalMute) return;

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

    // Harmonic two-tone chord (C5 -> E5)
    playTone(523.25, now, 0.28);
    playTone(659.25, now + 0.1, 0.35);
  } catch {
    // AudioContext blocked or not supported
  }
}
