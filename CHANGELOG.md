# Changelog — Fixture

All architectural and implementation decisions are recorded here in reverse-chronological order.

---

## 2026-10-19

### Hardware Acceleration Settings and Cross-Platform Background Throttling

Added cross-platform hardware acceleration toggle in SettingsModal Appearance tab wired to unified settings IPC, removed duplicate SVG selector in Globals.css, and configured background throttling prevention across macOS (`backgroundThrottling: disabled`) and Windows (`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`). — Antigravity (2026-10-19T18:55:00Z)

### Unified Settings IPC and Default Dashboard Commands

Migrated settings reads and saves to a single persisted `get_settings` / `save_settings` payload, registered connection, feed, issue, agent, layout, and view-mode commands with safe defaults, and updated the project status plan to distinguish command stubs from missing data sources. — Codex (2026-10-19)

### Cross-Platform Dynamic App Discovery Plan

Added `planning/W_CrossPlatformAppDiscovery.md` to replace hardcoded and placeholder app discovery with Windows, macOS, and Linux registration-based enumeration, and to identify redundant discovery helpers for removal from `QuickLauncher.rs`. — Codex (2026-10-19)

### CSS Root Rule Consolidation

Consolidated fragmented `html` and `html, body` rule blocks in `Globals.css` into a single unified root selector with `text-rendering` and `overscroll-behavior`. — Antigravity (2026-10-19T16:05:00Z)

### WebView Rendering Configuration and macOS Fullscreen Capability

Added WebView engine flags (`additionalBrowserArgs` for sRGB, GPU rasterization, overlay scrollbars), dark-mode `backgroundColor` (`#0d1317`) to eliminate window flashes, `zoomHotkeysEnabled: false`, `scrollBarStyle: "fluentOverlay"`, CSS `overscroll-behavior: none`, `image-rendering: -webkit-optimize-contrast`, and enabled macOS fullscreen capability via `maximizable: true` and `macOSPrivateApi: true`. — Antigravity (2026-10-19T15:37:00Z)

### IPC Command Consolidation — Settings

Reduced the 10 fragmented settings commands (`get_profile`, `save_profile`, `get_hotkeys`, `save_hotkeys`, `get_appearance`, `save_appearance`, `get_notifications`, `save_notifications`, `get_service_notification_settings`, `save_service_notification_settings`) plus the existing `get_app_settings` / `save_app_settings` pair down to two commands: `get_settings` and `save_settings`. The unified blob carries all settings sections — profile, hotkeys, appearance, notifications, overlay behavior, and per-service notification configs — as a single JSON object. — Bob (2026-10-19T17:16:42Z)

### Removal of `save_service_notification_settings` as a Distinct Command

The per-service save buttons (Discord, Slack, Jira) previously fired a keyed `save_service_notification_settings` command with a single `kind` argument. This is unnecessary: the frontend can read the current state of all three service panels from the DOM and compose the full `services` map before calling `save_settings`. No data is lost and no additional Rust complexity is required. — Bob (2026-10-19T17:16:42Z)

### Absorption of `get_app_settings` / `save_app_settings` into Unified Settings Blob

`get_app_settings` and `save_app_settings` were already implemented in `Commands.rs` and stored overlay behavior flags (`autoHideWhenIdle`, `autoHideWhenEmpty`, `alwaysShowToolbar`, `soundEnabled`). The appearance and notifications save handlers in `SettingsModal.ts` were issuing a secondary `get_app_settings` invoke inside save callbacks just to merge fields they did not own. Absorbing these into the unified settings blob eliminates that pattern entirely. `OverlayController.ts` and `AudioCues.ts` callers of `get_app_settings` will migrate to `get_settings`. — Bob (2026-10-19T17:16:42Z)

### No Frontend Settings Cache — Confirmed Absent

Audited `Dashboard.ts`, `SettingsModal.ts`, and all files under `src/`. There is no module-level cache, store, or memoization layer for any Tauri command result. `loadPanelData()` re-invokes on every tab switch; `loadDashboardData()` re-invokes on every `mountDashboard()` call. Adding a cache is a future consideration, not a current blocker. — Bob (2026-10-19T17:16:42Z)

---

## 2026-10-19

### Border Anti-Aliasing Fix — Theme-Aware Font Smoothing

Corrected the font-smoothing strategy in `Globals.css` to be theme-aware rather than unconditionally applied. The previous revision set `-webkit-font-smoothing: antialiased` on `html` for all themes, which produces washed-out text on light backgrounds. The corrected cascade sets `antialiased` as the default (matching the dark default palette in `:root`), resets to `auto` for system-light unthemed users via `@media (prefers-color-scheme: light)`, and explicitly enforces the correct value for both `[data-theme="dark"]` and `[data-theme="light"]` attribute states. — Bob (2026-10-19T19:28:00Z)

### Border-Radius Standardization — Anti-Aliasing at Fractional Rem Sizes

Consolidated all `border-radius` values across the full CSS surface to a strict two-tier system: `4px` for all interactive controls (buttons, inputs, selects, menu items, tabs, chips, key badges) and `8px` for all container surfaces (cards, panels, dropdowns, modals, provider blocks). Previously the codebase used seven distinct values (`3px`, `4px`, `5px`, `6px`, `7px`, `8px`, `12px`) on visually equivalent elements. Odd-integer radii (`3px`, `5px`, `7px`) on elements sized in `rem` cause sub-pixel arc interpolation artifacts when the root `font-size` clamp resolves to a fractional pixel value — the browser's anti-aliasing cannot land those arc pixels cleanly, producing the jagged/pixelated corner edges. Even integers `4` and `8` resolve cleanly at all fluid scale points. Intentional exceptions retained: `12px` (modal shell outer frame), `999px` / `9999px` (pills and toggle tracks), `50%` (circles), `0 0 8px 8px` (attached dropdown panels). Files affected: `Buttons.css`, `Dashboard.css`, `IconDropdown.css`, `Onboarding.css`, `Overlay.css`, `SettingsModal.css`, `Titlebar.css`. — Bob (2026-10-19T19:28:00Z)

### Global Rendering Quality — `geometricPrecision` and `optimizeLegibility`

Added `shape-rendering: geometricPrecision` to both the universal SVG reset block (applies before component-level `filter: brightness()`) and the scoped `svg` rule, ensuring all icon arcs and paths are rendered with maximum precision rather than being snapped to pixel boundaries. Added `text-rendering: optimizeLegibility` to `html` unconditionally — this improves kerning and ligature quality at all font sizes on both WebKit and Gecko without affecting anti-aliasing mode, making it safe for both light and dark themes. — Bob (2026-10-19T19:28:00Z)

### Frontend CSS / TS Reorganization — Shared Utilities, Data, and UI Primitives

Completed a full modularization of the Fixture frontend. Eliminated all duplicated utility functions, connection data, and UI builders that were previously inlined across multiple component files. Created canonical shared modules under `src/utils/`, `src/data/`, `src/ui/`, and `src/styles/`. All components updated to import from the shared modules; no local copies of shared logic remain. — Bob (2026-10-19T17:14:00Z)

- `src/utils/Dom.ts` — `requireElement<T>`, `requireClosest<T>`, `escapeHtml`
- `src/utils/Format.ts` — `formatTimestamp` (merged from Dashboard and OverlayController)
- `src/data/Connections.ts` — `CONNECTION_ROWS` array and `ConnectionRow` type
- `src/ui/Toggle.ts` — `buildToggleRow()` and `buildCompactToggle()` builders
- `src/styles/Toggle.css` — canonical toggle-row and compact toggle variants
- `src/styles/Buttons.css` — `.btn`, `.btn--primary`, `.btn--ghost`, size modifiers
- `src/styles/Labels.css` — `.section-label`, `.field-label`
- `src/styles/Icons.css` — `.icon-wrap`, `.icon-wrap--md`
- `src/styles/StatusDot.css` — `.status-dot` and state modifier classes
- `src/styles/IconDropdown.css` — canonical `.icon-dropdown` component styles

Components updated: `AppIconDropdown.ts`, `AudioCues.ts`, `Dashboard.ts`, `Onboarding.ts`, `OverlayController.ts`, `SettingsModal.ts`, `Titlebar.ts`. CSS stripped of all duplicated blocks: `Dashboard.css`, `Onboarding.css`, `Overlay.css`, `SettingsModal.css`, `Titlebar.css`.

