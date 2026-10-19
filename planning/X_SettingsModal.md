# W_SettingsModal — Settings Modal

## Goal
A full-screen overlay modal that surfaces all application settings, organised into tabs. It is opened either from the titlebar **Settings** menu items or programmatically via `openSettingsModal(tab)` — e.g. the onboarding cog wheel calling `openSettingsModal("connections")` jumps directly to the Connections tab. Closing dismisses the modal and returns to the previous view with no state loss.

---

## Files to affect

| File | Change |
|---|---|
| `src/components/SettingsModal.ts` | New file — full modal component with tab switching, all tab panels |
| `src/styles/SettingsModal.css` | New file — modal overlay, layout, tab bar, panel styles |
| `src/components/Titlebar.ts` | Wire each `MENUS["Settings"]` dropdown item to call `openSettingsModal(tab)`; add/remove `#menu-backdrop` on menu open/close |
| `src/styles/Titlebar.css` | Add `.titlebar__backdrop` overlay style |
| `src/components/Onboarding.ts` | Remove "Skip for now" button; add "Go to Dashboard" button wired to `mountDashboard` |
| `src/styles/Onboarding.css` | Replace `.onboarding__skip` styles with `.onboarding__dashboard-btn` styles |
| `index.html` | Add `<div id="modal-root"></div>` as a sibling to `#titlebar` and `#content` |
| `src/main.ts` | Import `SettingsModal.ts` so the module is registered |

---

## Modal structure — HTML

```html
<div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="settings-modal__backdrop"></div>
  <div class="settings-modal__shell">

    <!-- Left tab rail -->
    <nav class="settings-modal__nav">
      <span class="settings-modal__nav-heading">Settings</span>
      <button class="settings-modal__tab settings-modal__tab--active" data-tab="profile">Profile</button>
      <button class="settings-modal__tab" data-tab="connections">Connections</button>
      <button class="settings-modal__tab" data-tab="hotkeys">Hotkeys</button>
      <button class="settings-modal__tab" data-tab="appearance">Appearance</button>
      <button class="settings-modal__tab" data-tab="notifications">Notifications</button>
      <button class="settings-modal__tab" data-tab="quick-connect">Quick Connect</button>
      <button class="settings-modal__close" aria-label="Close settings"><!-- Close.svg --></button>
    </nav>

    <!-- Right content panel -->
    <div class="settings-modal__content">
      <div class="settings-modal__panel" data-panel="profile">...</div>
      <div class="settings-modal__panel settings-modal__panel--hidden" data-panel="connections">...</div>
      <!-- … one panel per tab … -->
    </div>

  </div>
</div>
```

The modal is injected into `#modal-root` on open and removed from the DOM on close — no `display:none` toggling on a persistent node.

---

## Tabs and their panel content

### Profile
- Display name field
- Avatar placeholder (initials circle)
- Workspace/organisation label
- "Save" button (calls `invoke("save_profile", { ... })`)

### Connections ← primary tab for cog wheel
- Mirrors the onboarding card list structure: one row per service
- Each row shows: icon, service name, status badge (`Connected` / `Not connected`), and a `Connect` / `Disconnect` action button
- Chat services (Discord, Slack, Teams) shown as individual flat rows (no tree — user already picked in onboarding)
- Rows: Discord, Slack, Teams, Jira, AI / LLM Providers (IBM Cloud & Bob, Fallback API Key), Code Editor, Browser, Email
- Status badges and button states come from `invoke<ConnectionMap>("get_connection_states")` on mount
- `Connect` → calls `invoke("open_connection_flow", { kind })` (for OAuth services: Discord, Slack, Teams, Jira)
- `Disconnect` → calls `invoke("disconnect_service", { kind })` → removes keyring entry
- **Code Editor, Email & Browser Icon-Only Dropdowns**:
  - Instead of OAuth buttons, these rows display an **icon-only dropdown selector**.
  - Dropdown menu renders crisp application icons discovered from the OS (no text titles, only icons with accessible hover tooltips).
  - Selected icon is shown in the trigger with a caret; selecting an icon updates user preferences via `invoke("set_selected_app", { category, appId })`.
- **AI / LLM Provider Prioritization & Fallback Keys**:
  - Surfaces dual credential slots:
    1. **IBM Cloud & Bob (Primary Engine)**: IBM Cloud API key, Project ID, and Bob/Orchestrate service endpoint. Marked with a "Primary" priority toggle.
    2. **Fallback API Key**: Generic API key (OpenAI/Anthropic/custom endpoint) with an "Enable Fallback" toggle switch.
  - Radio/toggle switch allowing the user to select which provider takes execution priority.
  - Automatic runtime failover: if IBM Cloud returns HTTP 429 (rate-limited) or fails, the backend seamlessly routes the query to the fallback key.
  - State persisted via `invoke("set_llm_provider_priority", { ... })` and stored in keyring via `invoke("store_secret", ...)`.
- **Jira Smart Polling Configuration (Tokio Background Worker)**:
  - When Jira is connected, expand or display an inline settings control for polling frequency.
  - Dropdown options: `15s`, `30s` (default), `60s`, `120s`, `Manual Sync Only`.
  - Dispatches `invoke("update_jira_poll_interval", { intervalSeconds })` to update the background Tokio worker on the fly.
  - Value persisted in connection config and loaded on mount via `invoke<JiraPollingConfig>("get_jira_poll_config")`.

### Hotkeys
- Table of action → key binding rows
- Each row: action label, current binding (pill styled like a keyboard key), "Edit" button
- Editing a binding: key pill becomes an input capture target — next keypress sets the binding
- Saves via `invoke("save_hotkeys", { bindings })`

### Appearance
- Theme selector: `System`, `Dark`, `Light` (radio pills)
- Opacity slider (range 20–100)
- Font size selector (Small / Default / Large)
- Accent colour swatches (6 preset colours + custom hex input)
- Saves via `invoke("save_appearance", { ... })`

### Notifications
- Toggle rows for each notification type: Mentions, DMs, Channel activity, Issue updates, Agent responses
- Each row: label, toggle switch (CSS-only), scope sub-label
- Global mute toggle at top
- Saves via `invoke("save_notifications", { ... })`

### Quick Connect
- Compact list of enabled connections with a toggle switch per row
- Allows enabling/disabling a connection without disconnecting the auth (token stays in keyring)
- Saves via `invoke("save_quick_connect", { ... })`

---

## `openSettingsModal(tab)` — exported function

```ts
export function openSettingsModal(tab: SettingsTab = "profile"): void
```

1. If modal is already open — switch to `tab` only (do not re-mount).
2. Build modal HTML via `buildModal()`.
3. Inject into `#modal-root`.
4. Activate the `tab` panel.
5. Wire close button, backdrop click, and `Escape` key to `closeSettingsModal()`.
6. Wire tab buttons to `switchTab()`.
7. Load panel data for the active tab via `loadPanelData(tab)`.

---

## `closeSettingsModal()` — internal function

1. Remove modal element from `#modal-root`.
2. Remove `Escape` keydown listener.

---

## Tab switching — `switchTab(tab)`

```
set all .settings-modal__tab aria-selected="false", remove --active class
set target tab aria-selected="true", add --active class
hide all .settings-modal__panel (add --hidden class)
show target panel (remove --hidden class)
call loadPanelData(tab) to fetch fresh data for that tab
```

---

## `loadPanelData(tab)` — internal async function

| Tab | Invoke call |
|---|---|
| `connections` | `invoke<ConnectionMap>("get_connection_states")` → populate status badges |
| `hotkeys` | `invoke<HotkeyMap>("get_hotkeys")` → populate binding rows |
| `appearance` | `invoke<AppearanceConfig>("get_appearance")` → set form values |
| `notifications` | `invoke<NotificationConfig>("get_notifications")` → set toggle states |
| `quick-connect` | `invoke<QuickConnectConfig>("get_quick_connect")` → set toggle states |
| `profile` | `invoke<ProfileConfig>("get_profile")` → set field values |
| `connections (Jira)` | `invoke<JiraPollingConfig>("get_jira_poll_config")` → set polling interval controls |

All invoke calls are stubbed to return empty/default values if the Rust command is absent (`.catch(() => defaultValue)`).

---

## Types — `SettingsModal.ts`

```ts
type SettingsTab = "profile" | "connections" | "hotkeys" | "appearance" | "notifications" | "quick-connect";

interface ConnectionRow {
  kind:      string;
  label:     string;
  icon:      string;
  connected: boolean;
}

type ConnectionMap = Record<string, boolean>;
type HotkeyMap     = Record<string, string>;

interface AppearanceConfig {
  theme:       "system" | "dark" | "light";
  opacity:     number;
  fontSize:    "small" | "default" | "large";
  accentColor: string;
}

interface NotificationConfig {
  globalMute:      boolean;
  mentions:        boolean;
  dms:             boolean;
  channelActivity: boolean;
  issueUpdates:    boolean;
  agentResponses:  boolean;
}

interface QuickConnectConfig {
  enabled: Record<string, boolean>;
}

interface ProfileConfig {
  displayName:  string;
  organisation: string;
}

interface JiraPollingConfig {
  intervalSeconds: number;
  autoPauseOnIdle: boolean;
}
```

---

## Titlebar wiring change — `Titlebar.ts`

`wireMenuBar()` currently renders dropdown items as plain text buttons with no action. Each Settings menu item must call `openSettingsModal(tab)`:

```ts
import { openSettingsModal } from "./SettingsModal";

// tab slug map
const SETTINGS_TAB_MAP: Record<string, SettingsTab> = {
  "Profile":        "profile",
  "Connections":    "connections",
  "Hotkeys":        "hotkeys",
  "Appearance":     "appearance",
  "Notifications":  "notifications",
  "Quick Connect":  "quick-connect",
};
```

In `wireMenuBar()`, for items under the "Settings" menu:
```
if item label is in SETTINGS_TAB_MAP → call openSettingsModal(SETTINGS_TAB_MAP[label])
```

View and Help menu items remain as stubs (`invoke("open_view_mode", ...)` / `invoke("open_help_section", ...)`).

---

## Menu backdrop dimming — `Titlebar.ts` + `Titlebar.css`

When any menu dropdown opens, a full-window backdrop element is inserted behind the dropdown and above the rest of the content. It dims the non-titlebar area and serves as the outside-click dismiss target.

### Behaviour
- On menu open: inject `<div id="menu-backdrop" class="titlebar__backdrop"></div>` into `document.body` (after the titlebar).
- On menu close (any path — outside click, item click, second click on same button): remove the backdrop element from the DOM.
- The existing `document.addEventListener("mousedown", ...)` dismiss handler in `wireMenuBar()` already handles outside clicks — it must also remove the backdrop.
- Clicking the backdrop itself triggers the same close path (mousedown propagates to `document`).

### CSS — `Titlebar.css`
```css
.titlebar__backdrop {
  position: fixed;
  inset: 0;
  top: var(--titlebar-height);
  z-index: 90;
  background-color: rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}
```

`z-index: 90` sits above content (`z-index` default) but below the dropdown (`z-index: 1000`) and below the Settings Modal (`z-index: 100`).

### Helper functions in `Titlebar.ts`
```ts
function showMenuBackdrop(): void  // inject backdrop div into body if not present
function hideMenuBackdrop(): void  // remove backdrop div from body if present
```

Call `showMenuBackdrop()` immediately after `menu.classList.add("titlebar__menu--open")` and `hideMenuBackdrop()` in every path that calls `menus.forEach(m => m.classList.remove("titlebar__menu--open"))`.

---

## Onboarding change — `Onboarding.ts` + `Onboarding.css`

### Remove "Skip for now"
- Delete the `<button class="onboarding__skip">Skip for now</button>` from `buildView()`.
- Remove the `.onboarding__skip` and `.onboarding__skip:hover` rules from `Onboarding.css`.
- No wiring existed for this button (no click handler in `mountOnboarding`), so no JS removal is needed beyond the HTML string.

### Add "Go to Dashboard"
- Replace the skip button with `<button class="onboarding__dashboard-btn" aria-label="Go to Dashboard">Go to Dashboard</button>` at the bottom of `.onboarding__list`.
- In `mountOnboarding`, wire this button: `invoke("navigate_to_dashboard")` — stubbed with `.catch(() => {})` until the Dashboard component exists.
- Once `Dashboard.ts` is implemented, replace the invoke stub with a direct call to `mountDashboard(container)`.

### CSS — `Onboarding.css`
Replace `.onboarding__skip` styles with:
```css
.onboarding__dashboard-btn {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  padding: 0.375rem 0.75rem;
  align-self: flex-start;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.onboarding__dashboard-btn:hover {
  border-color: var(--color-accent);
  background-color: var(--color-surface);
}
```

---

## CSS layout — `SettingsModal.css`

### Overlay + backdrop
```css
.settings-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal__backdrop {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.55);
}
```

### Shell (the actual modal box)

`width` and `height` use `min()` against the live viewport (`100dvw`/`100dvh`) so the modal never overflows in smaller windows or overlay variants (Mini-Pill, Docked Sidebar). `grid-template-columns` uses `clamp()` so the nav rail scales proportionally when the shell narrows.

```css
.settings-modal__shell {
  position: relative;
  display: grid;
  grid-template-columns: clamp(140px, 22%, 180px) 1fr;
  width:      min(720px, calc(100dvw - 48px));
  height:     min(520px, calc(100dvh - 48px));
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}
```

### Left nav rail
```css
.settings-modal__nav {
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  gap: 2px;
  border-right: 1px solid var(--color-border);
  background-color: var(--color-surface);
}

.settings-modal__nav-heading {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 8px;
  margin-bottom: 8px;
}

.settings-modal__tab {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.settings-modal__tab:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg);
}

.settings-modal__tab--active {
  color: var(--color-text-primary);
  background-color: var(--color-bg);
  font-weight: 600;
}

.settings-modal__close {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: color 0.12s ease, background-color 0.12s ease;
}

.settings-modal__close:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg);
}

.settings-modal__close svg {
  width: 14px;
  height: 14px;
  pointer-events: none;
}
```

### Content area
```css
.settings-modal__content {
  overflow-y: auto;
  padding: 28px 32px;
}

.settings-modal__panel--hidden {
  display: none;
}
```

### Connections panel rows
```css
.settings-modal__conn-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-surface);
}

.settings-modal__conn-icon svg {
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
}

.settings-modal__conn-label {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.settings-modal__conn-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.settings-modal__conn-status--connected {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.settings-modal__conn-action {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 5px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease, background-color 0.12s ease;
}

.settings-modal__conn-action:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.settings-modal__conn-action--disconnect:hover {
  border-color: #e05c5c;
  color: #e05c5c;
}
```

---

## `index.html` change

```html
<body>
  <div id="app">
    <div id="titlebar"></div>
    <div id="content"></div>
    <div id="modal-root"></div>   <!-- add this -->
  </div>
</body>
```

---

## Implementation steps

1. Add `<div id="modal-root"></div>` to `index.html`
2. Create `src/components/SettingsModal.ts` — types, constants, build functions, open/close/switch logic
3. Create `src/styles/SettingsModal.css` — all modal, nav, panel, connection row styles
4. Import `SettingsModal.css` inside `SettingsModal.ts`
5. Import `openSettingsModal` in `src/main.ts` (side-effect import to register the module)
6. Add `SETTINGS_TAB_MAP` constant to `Titlebar.ts`; import `openSettingsModal`; wire Settings dropdown items in `wireMenuBar()`; add `showMenuBackdrop`/`hideMenuBackdrop` helpers; wire backdrop to open/close paths
7. Add `.titlebar__backdrop` rule to `Titlebar.css`
8. Remove `onboarding__skip` button from `Onboarding.ts`; add `onboarding__dashboard-btn` button and wire it
9. Replace `.onboarding__skip` styles with `.onboarding__dashboard-btn` styles in `Onboarding.css`
