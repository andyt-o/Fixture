// ==============================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";

// ==============================================================================
// Types
// ==============================================================================
export interface SettingsData {
  profile: { displayName: string; organisation: string };
  hotkeys: Record<string, string>;
  appearance: { theme: "system" | "dark" | "light"; opacity: number; fontSize: "small" | "default" | "large"; accentColor: string };
  notifications: { globalMute: boolean; mentions: boolean; dms: boolean; channelActivity: boolean; issueUpdates: boolean; agentResponses: boolean };
  overlay: { autoHideWhenIdle: boolean; autoHideWhenEmpty: boolean; alwaysShowToolbar: boolean; soundEnabled: boolean };
  services: Record<string, { intervalSeconds: number; playSound: boolean; showOnOverlay: boolean; mentions: boolean; directMessages: boolean; channelActivity: boolean; issueUpdates: boolean; assignments: boolean }>;
}

// ==============================================================================
// Constants
// ==============================================================================
const DEFAULT_SERVICE = { intervalSeconds: 30, playSound: true, showOnOverlay: true, mentions: true, directMessages: true, channelActivity: false, issueUpdates: true, assignments: true };

// ==============================================================================
// Functions
// ==============================================================================
export async function loadSettings(): Promise<SettingsData> {
  return invoke<SettingsData>("get_settings");
}

export async function updateSettings(patch: Partial<SettingsData>): Promise<void> {
  const settings = await loadSettings();
  if (patch.profile) settings.profile = { ...settings.profile, ...patch.profile };
  if (patch.hotkeys) settings.hotkeys = { ...settings.hotkeys, ...patch.hotkeys };
  if (patch.appearance) settings.appearance = { ...settings.appearance, ...patch.appearance };
  if (patch.notifications) settings.notifications = { ...settings.notifications, ...patch.notifications };
  if (patch.overlay) settings.overlay = { ...settings.overlay, ...patch.overlay };
  if (patch.services) settings.services = { ...settings.services, ...patch.services };
  await invoke("save_settings", { settings });
}

export function defaultServiceSettings(): SettingsData["services"][string] {
  return { ...DEFAULT_SERVICE };
}
