# W_OverlayPresentationPlan — Overlay Variants & Mode Transitions

## Overview
This plan specifies the implementation of Fixture's screen overlay presentation modes. When the user activates overlay mode (via the **Start** button on the Dashboard, the **Launch** power button on the Titlebar, or the system tray menu), the application window transitions out of the standard desktop taskbar into the system tray and presents a live, non-intrusive floating overlay on the screen.

---

## Architectural Principles & Requirements
1. **Disappear from Taskbar into System Tray**:
   - Starting overlay mode hides the standard application window from the taskbar (`skipTaskbar(true)`), configures `alwaysOnTop(true)`, and positions/sizes the window according to the selected overlay variant.
   - The application resides quietly in the notification disk tray (Windows notification area / Linux AppIndicator / macOS status bar).
   - Clicking the tray icon or selecting "Toggle Overlay Mode" / "Show Fixture" transitions back to the full dashboard or toggles visibility without quitting.
2. **Overlay Variants**:
   - **Floating HUD** (Default): A compact, draggable, semi-transparent card (e.g. `360px × 480px` or customizable) showing live priority notifications, tickets, and mentions, with quick actions (mute, expand, open in app).
   - **Docked Sidebar**: An edge-anchored vertical panel (right or left edge of display) displaying incoming chat feeds and ticket updates.
   - **Mini-Pill**: A minimalist floating pill badge showing unread counts and connection status; clicking expands into the HUD.
   - **Click-Through Ambient HUD**: Heads-up display with ignore-cursor/click-through capabilities.
3. **Overlay HUD Controls**:
   - Quick "Return to Dashboard" button to restore full window configuration mode.
   - Mute button.
   - App quicklaunch buttons ("Open with").
   - Draggable header bar (`-webkit-app-region: drag`).
4. **Code Conventions & Standards**:
   - PascalCase for types, structs, and file names (`OverlayController.ts`, `FloatingHud.ts`, `OverlayTypes.ts`).
   - camelCase for functions and variables.
   - Partition dividers (`// ==============================================================================`) with standard section headers.
   - Sizing strictly in `rem` driven by project fluid scaling `:root { font-size: clamp(13px, 0.833vw, 24px) }` in `Globals.css`.

---

## Files to Affect

| File | Change Description |
|---|---|
| `src-tauri/src/commands/Commands.rs` | Implement `start_overlay(variant: Option<String>)`, `stop_overlay()`, and window geometry resize/positioning logic for overlay variants. |
| `src-tauri/src/tray/TrayManager.rs` | Update `applyOverlayMode` to support variant geometry sizing and restoring window states. |
| `src-tauri/tauri.conf.json` | Verify window capabilities (support transparent, resizable, decoration toggles). |
| `src/components/OverlayController.ts` | New file — manages overlay state in frontend, mounts the active overlay variant into `#content`, and coordinates with Rust backend. |
| `src/components/FloatingHud.ts` | New file — Floating HUD component rendering active feeds, unread tickets, quick actions, and return-to-dashboard controls. |
| `src/components/MiniPill.ts` | New file — Compact Mini-Pill variant with expand-to-HUD interaction. |
| `src/styles/Overlay.css` | New file — styles for HUD card, Mini-Pill, sidebar docking, and transparent window modes. |
| `src/components/Dashboard.ts` | Wire `#db-start` button to invoke `start_overlay`. |
| `src/components/Titlebar.ts` | Wire `#tb-launch` (power icon button) and `#tb-variant` to trigger overlay mode and variant switching. |
| `src/main.ts` | Support initial overlay mode check or direct mount. |

---

## Detailed Component Specifications

### 1. Rust Backend Window Management (`src-tauri/src/commands/Commands.rs` & `TrayManager.rs`)

When `start_overlay(variant: String)` is called:
1. `variant` options: `"floating-hud"`, `"docked-sidebar"`, `"mini-pill"`.
2. Rust adjusts the webview window:
   - For **Floating HUD**: Resize window to `380 × 520`, position at top-right or center-right of screen, `set_always_on_top(true)`, `set_skip_taskbar(true)`.
   - For **Mini-Pill**: Resize window to `240 × 54`, position near top-right corner, `set_always_on_top(true)`, `set_skip_taskbar(true)`.
   - For **Docked Sidebar**: Resize window to `340 × screen_height`, pin to right edge.
3. Emit Tauri event `overlay-mode-changed` with payload `{ active: true, variant }`.
4. Hide main titlebar if in compact overlay mode, or render an overlay-specific micro-dragbar.

When `stop_overlay()` is called:
1. Restore window to normal desktop mode:
   - `set_always_on_top(false)`
   - `set_skip_taskbar(false)`
   - Resize to default configuration dimensions (`1280 × 800` or maximized).
2. Emit Tauri event `overlay-mode-changed` with payload `{ active: false }`.
3. Restore `#titlebar` and full Dashboard view.

### 2. Frontend Overlay Component (`OverlayController.ts` & `FloatingHud.ts`)

#### HTML Structure of Floating HUD
```html
<div class="overlay-hud">
  <header class="overlay-hud__header">
    <div class="overlay-hud__drag-handle">
      <span class="overlay-hud__logo"><!-- Fixture.svg --></span>
      <span class="overlay-hud__title">Fixture</span>
      <span class="overlay-hud__badge">HUD</span>
    </div>
    <div class="overlay-hud__actions">
      <button class="overlay-hud__btn" id="hud-pill" title="Switch to Mini-Pill"><!-- Layout.svg --></button>
      <button class="overlay-hud__btn" id="hud-restore" title="Restore Dashboard"><!-- Maximize.svg --></button>
      <button class="overlay-hud__btn" id="hud-minimize" title="Minimize to Tray"><!-- Close.svg --></button>
    </div>
  </header>

  <main class="overlay-hud__body">
    <!-- Active priority stream: latest mentions & tickets -->
    <div class="overlay-hud__stream" id="hud-stream">
      <!-- Live notification cards -->
    </div>
  </main>

  <footer class="overlay-hud__footer">
    <button class="overlay-hud__quick" data-action="vscode">VS Code</button>
    <button class="overlay-hud__quick" data-action="email">Mail</button>
    <button class="overlay-hud__quick" data-action="slack">Slack</button>
  </footer>
</div>
```

#### Mini-Pill HTML Structure
```html
<div class="overlay-pill">
  <span class="overlay-pill__dot"></span>
  <span class="overlay-pill__icon"><!-- Fixture.svg --></span>
  <span class="overlay-pill__count" id="pill-count">3</span>
  <button class="overlay-pill__expand" id="pill-expand" aria-label="Expand HUD"><!-- Caret.svg --></button>
</div>
```

---

## Phased Implementation Roadmap
1. **Phase 1: Rust Window Transform Commands**:
   - Implement `start_overlay`, `stop_overlay`, and `get_overlay_state` in `Commands.rs`.
   - Update `TrayManager.rs` to handle window geometry resizing between desktop mode and overlay mode.
2. **Phase 2: Frontend Overlay Controller & Styles**:
   - Create `src/styles/Overlay.css` with fluid rem styling for Floating HUD and Mini-Pill.
   - Create `src/components/OverlayController.ts` and `FloatingHud.ts`.
3. **Phase 3: Wiring Titlebar & Dashboard Launchers**:
   - Wire `#db-start` in `Dashboard.ts` to trigger `start_overlay`.
   - Wire `#tb-launch` and `#tb-variant` in `Titlebar.ts` to trigger overlay transitions.
4. **Phase 4: Tray & Return-to-Dashboard Sync**:
   - Ensure clicking "Show Fixture" or tray menu items cleanly toggles or exits overlay mode back to Dashboard.
