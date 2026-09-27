# W_SettingsCustomizationPlan — Advanced Overlay & Notification Settings

## Overview
This plan specifies the implementation of customizable settings connecting the TypeScript frontend (`SettingsModal.ts` and `OverlayController.ts`) with the Rust backend (`Commands.rs` and `SecretStore.rs`).

Key settings to add and wire:
1. **Auto-Hide Overlay Settings**:
   - `autoHideWhenIdle`: Automatically hide or dim the overlay when the cursor is not near it for a specified duration (e.g., 3s).
   - `autoHideWhenEmpty`: Automatically hide the overlay if there are no unread notifications or open ticket items.
2. **Titlebar / Toolbar Display Behavior**:
   - `alwaysShowToolbar`: Option to keep the window titlebar visible in overlay mode or hide it to provide a borderless floating widget.
3. **Sound Cues for Notifications**:
   - `soundEnabled`: Master switch for audio notification chimes.
   - Built-in lightweight Web Audio API chime / audio cue generator (no heavy external assets required).
   - Per-service sound toggle controls wired in `SettingsModal.ts`.
4. **Rust Backend Settings Persistence**:
   - Store settings schema in `SecretStore` / local user settings JSON via Tauri commands `get_app_settings` and `save_app_settings`.

---

## Files to Affect

| File | Change Description |
|---|---|
| `src-tauri/src/commands/Commands.rs` | Implement `get_app_settings` and `save_app_settings` handling overlay auto-hide, toolbar visibility, and sound toggles. |
| `src-tauri/src/lib.rs` | Register `get_app_settings` and `save_app_settings` in `invoke_handler`. |
| `src/components/AudioCues.ts` | New file — Web Audio API synthesized notification chime generator (`playNotificationChime()`). |
| `src/components/SettingsModal.ts` | Add new setting rows in Appearance/Notifications tabs for auto-hide, toolbar always visible, and notification sound cues. |
| `src/components/OverlayController.ts` | Implement proximity cursor detection (`mouseenter`/`mouseleave`/idle timer) and empty-notification auto-hide. |
| `src/styles/Overlay.css` | Add smooth fade/dim transitions for idle and auto-hide states (`.overlay-hud--dimmed`). |
| `src/styles/SettingsModal.css` | Add toggle and slider styling for new customization controls. |

---

## Detailed Component Specifications

### 1. Audio Cues (`src/components/AudioCues.ts`)
- Utilizes the standard browser Web Audio API (`AudioContext`).
- Generates a pleasant, subtle two-tone chime (e.g. 523.25 Hz C5 -> 659.25 Hz E5 harmonic sine waves with exponential decay).
- Zero external MP3/WAV dependencies; instant load, reliable cross-platform execution.
- Checks `soundEnabled` and `globalMute` before playing.

### 2. Auto-Hide Proximity & Empty Stream Detection (`src/components/OverlayController.ts`)
- **Proximity Idle Timer**:
  - In `FloatingHud`, sets an inactivity timer (default 3 seconds).
  - On `mouseleave` or cursor stillness outside the card bounds, adds class `.overlay-hud--dimmed` (opacity drops to 20%) or hides window via `invoke("toggle_overlay_visibility", false)`.
  - On `mouseenter` or hover over the trigger area, immediately restores full opacity.
- **Empty Stream Auto-Hide**:
  - If `autoHideWhenEmpty` is true and `items.length === 0`, transitions to the compact `mini-pill` or hides until an event is received.

### 3. Settings Modal Additions (`src/components/SettingsModal.ts`)
- **Appearance Tab**:
  - Toggle: "Always show titlebar in overlay mode".
  - Toggle: "Auto-hide overlay when cursor is away".
  - Toggle: "Auto-hide overlay when no notifications".
- **Notifications Tab**:
  - Toggle: "Play sound cues on new notification".
  - Test button: "Preview Sound" (plays `playNotificationChime()`).

---

## Phased Implementation Steps
1. **Phase 1: Rust Commands**:
   - Add `get_app_settings` and `save_app_settings` to `Commands.rs` and register in `lib.rs`.
2. **Phase 2: Audio Cues**:
   - Create `src/components/AudioCues.ts`.
3. **Phase 3: SettingsModal Integration**:
   - Add controls to Appearance and Notifications panels in `SettingsModal.ts` and wire persistence.
4. **Phase 4: OverlayController Proximity & Auto-Hide**:
   - Wire cursor proximity, opacity transitions, and empty stream auto-hide in `OverlayController.ts`.
