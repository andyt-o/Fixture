# W_ChatGroupCard — Expandable Chat Group Card

## Goal
Replace the single `Slack` connection card with a `Chat` group card that expands inline into three sub-cards (Discord, Slack, Microsoft Teams) via a tree-style toggle. Each sub-card's **Connect** button opens the OAuth URL for that specific service in the system browser — no intermediate navModal, no embedded webview.

## Decision rationale (Q2)
The left-column card list *already acts as the selection surface*. Opening a navModal after clicking a sub-card would add a redundant re-selection step. Instead: group card = expand/collapse, sub-card = invoke OAuth flow directly.

## Connect button behaviour — OAuth loopback pattern

```
sub-card "Connect" clicked
  → invoke("open_connection_flow", { kind })         [TypeScript]
  → open_connection_flow(kind) Tauri command         [Rust]
      → build OAuth authorization URL for that service
      → shell::open(oauth_url)                       [opens system browser]
      → spin up loopback listener on 127.0.0.1:PORT
      → await redirect containing ?code=...
      → exchange code for access token via reqwest
      → keyring::set(service_name, token)            [OS credential store]
      → emit("connection-status", { kind, connected: true })
  → frontend listener updates sub-card to "Connected" state
```

- `reqwest 0.13` handles the token exchange HTTP request.
- `oauth2 5.0` builds the authorization URL and PKCE challenge.
- `keyring 4.2` persists the token in the OS credential store.
- The Tauri window stays untouched during the entire browser auth dance.

---

## Files to affect

| File | Change |
|---|---|
| `src/components/Onboarding.ts` | Replace `Slack` entry with `Chat` group entry; add sub-card data; add cog button to list heading; new build/wire functions for group, sub-cards, and cog |
| `src/styles/Onboarding.css` | Add styles for group card header state (expanded, caret), sub-card container (indent + slide animation), sub-card style variants, and heading cog button |
| `src/assets/icons/` | `Chat.svg`, `Discord.svg`, `MicrosoftTeams.svg`, `Slack.svg` already present — `Settings.svg` already present for both cog buttons |
| `src/components/Titlebar.ts` | Add cog icon button (`tb-settings`) to `buildIconButtons()` on the **left** side of the icon row; wire click to `openSettingsModal("connections")` |
| `src/styles/Titlebar.css` | No new rules needed — `tb-settings` reuses `.titlebar__icon-btn` |

---

## Type changes — `Onboarding.ts`

### Remove
```ts
const enum ConnectionKind {
  Slack = "slack",  // ← remove
  ...
}
```

### Add
```ts
const enum ConnectionKind {
  Chat      = "chat",       // group parent (no direct invoke — toggles tree)
  Discord   = "discord",    // sub-card
  Slack     = "slack",      // sub-card (kept for invoke compatibility)
  Teams     = "teams",      // sub-card
  ...
}
```

### New interface
```ts
interface GroupEntry {
  kind:        ConnectionKind;       // = ConnectionKind.Chat
  label:       string;
  icon:        string;
  children:    ConnectionEntry[];    // Discord, Slack, Teams
}
```

### Mutually exclusive from `ConnectionEntry`
`GroupEntry` does not have `description`, `optional`, or `action` text — those belong to sub-cards only.

---

## Data shape — `CONNECTIONS` constant

Replace the top-level Slack `ConnectionEntry` with a `GroupEntry`, and similarly diversify the `API / Agent` card into an expandable `GroupEntry`:

```ts
const CHAT_GROUP: GroupEntry = {
  kind:  ConnectionKind.Chat,
  label: "Chat",
  icon:  chatIcon,
  children: [
    { kind: ConnectionKind.Discord, label: "Discord",          description: "Stream server channels, DMs, and mentions.", icon: discordIcon, optional: false },
    { kind: ConnectionKind.Slack,   label: "Slack",            description: "Stream mentions, DMs, and channel activity.", icon: slackIcon,   optional: false },
    { kind: ConnectionKind.Teams,   label: "Microsoft Teams",  description: "Surface chats, channel posts, and @mentions.", icon: teamsIcon,   optional: false },
  ],
};

const AI_AGENT_GROUP: GroupEntry = {
  kind:  ConnectionKind.AiAgentGroup,
  label: "AI / LLM Providers",
  icon:  robotIcon,
  children: [
    { kind: ConnectionKind.IbmCloudBob, label: "IBM Cloud & Bob", description: "Watsonx.ai & Watsonx Orchestrate agent runtime with Granite/Llama.", icon: robotIcon, optional: false },
    { kind: ConnectionKind.OpenAi,       label: "OpenAI",              description: "Use an OpenAI API key as the primary or secondary provider.",       icon: robotIcon, optional: true },
  ],
};
```

### AI / LLM Provider Sub-Cards & Priority Toggle
- Clicking the parent `AI / LLM Providers` card expands its children inline using the same tree toggle accordion mechanics as the `Chat` group.
- Sub-cards display:
  - **IBM Cloud & Bob**: Inputs/actions for IBM Cloud API key, Project ID, and Bob/Orchestrate service credentials. Includes a toggle switch: "Set as Primary Engine".
  - **OpenAI**: Input for OpenAI API key. Includes a toggle switch: "Set as Primary Engine".
- **Priority Toggle Mechanics**:
  - Clicking the toggle switch sets that provider as the active prioritized engine (`watsonx` vs. `openai`).
  - When one is set to primary, the alternative serves as the standby fallback. On network error, timeout, or HTTP 429 rate limit, the backend automatically fails over to the standby key.
  - State persisted via `invoke("set_llm_provider_priority", { primary: "watsonx", fallbackEnabled: true })`.

---

## HTML structure

### Group card (collapsed state)
```html
<div class="onboarding__group" data-group="chat">
  <button class="onboarding__group-header" aria-expanded="false" data-group="chat" aria-label="Expand Chat connections">
    <div class="onboarding__card-row">
      <span class="onboarding__card-icon"><!-- chatIcon SVG --></span>
      <span class="onboarding__card-label">Chat</span>
    </div>
    <span class="onboarding__group-caret"><!-- CaretDown SVG --></span>
  </button>
  <div class="onboarding__group-children" aria-hidden="true">
    <!-- sub-cards injected here -->
  </div>
</div>
```

### Sub-card (inside `.onboarding__group-children`)
```html
<button class="onboarding__sub-card" data-connection="discord" aria-label="Connect Discord">
  <div class="onboarding__card-row">
    <span class="onboarding__card-icon"><!-- discordIcon SVG --></span>
    <span class="onboarding__card-label">Discord</span>
  </div>
  <span class="onboarding__card-desc">Stream server channels, DMs, and mentions.</span>
  <span class="onboarding__card-action">Connect</span>
</button>
```

---

## Toggle behaviour — `wireGroupCards()`

```
on click .onboarding__group-header:
  let expanded = header.getAttribute("aria-expanded") === "true"
  toggle to !expanded
  header.setAttribute("aria-expanded", String(!expanded))
  children.setAttribute("aria-hidden", String(expanded))
  header parent (.onboarding__group) toggleClass "onboarding__group--expanded"
```

- The group header itself never calls `invoke` — it only toggles state.
- Sub-cards call `invoke("open_connection_flow", { kind })` on click, triggering the OAuth loopback flow described above.
- Only one group can be expanded at a time (collapse others on open).

---

## CSS additions — `Onboarding.css`

### Group wrapper
```css
.onboarding__group {
  display: flex;
  flex-direction: column;
  gap: 0;
}
```

### Group header (base + expanded variant)
```css
.onboarding__group-header {
  /* same geometry as .onboarding__card */
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background-color: transparent;
  border: 1px solid var(--color-surface);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.onboarding__group-header:hover,
.onboarding__group--expanded .onboarding__group-header {
  border-color: var(--color-border);
  background-color: var(--color-surface);
}

/* when expanded, remove bottom radius to flow into children */
.onboarding__group--expanded .onboarding__group-header {
  border-bottom-color: transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
```

### Caret icon
```css
.onboarding__group-caret svg {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  transition: transform 0.2s ease, color 0.15s ease;
  pointer-events: none;
}

.onboarding__group--expanded .onboarding__group-caret svg {
  transform: rotate(180deg);
  color: var(--color-accent);
}
```

### Children container (collapsed + expanded)
```css
.onboarding__group-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 0;
  overflow: hidden;
  /* indent to signal tree hierarchy */
  padding-left: 16px;
  border: 1px solid var(--color-border);
  border-top: none;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  background-color: var(--color-surface);
  transition: max-height 0.22s ease, padding 0.22s ease;
  /* hidden state */
  padding-top: 0;
  padding-bottom: 0;
}

.onboarding__group-children[aria-hidden="false"] {
  max-height: 400px;   /* large enough for 3 sub-cards */
  padding-top: 6px;
  padding-bottom: 8px;
}
```

### Sub-card
```css
.onboarding__sub-card {
  /* narrower, no outer border — container provides the frame */
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 10px;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}

.onboarding__sub-card:hover {
  border-color: var(--color-border);
  background-color: var(--color-bg);
}
```

---

## Build functions — `Onboarding.ts`

```
buildGroupCard(group: GroupEntry): string
  → renders .onboarding__group wrapper with header + children container
  → calls buildSubCard() for each child

buildSubCard(entry: ConnectionEntry): string
  → renders .onboarding__sub-card button (no optional badge, no outer border)

wireGroupCards(container: HTMLElement): void
  → handles toggle logic on .onboarding__group-header clicks
  → calls wireSubCards() internally

wireSubCards(container: HTMLElement): void
  → identical to wireCards but targets .onboarding__sub-card
  → calls invoke("open_connection_flow", { kind }) which opens OAuth in system browser
```

The existing `buildCard()` and `wireCards()` functions remain unchanged for the flat `ConnectionEntry` cards below the group.

---

## Caret icon

Use the Arcticons `ChevronDown` SVG fetched to `src/assets/icons/CaretDown.svg` via curl before implementation begins.
Alternatively, a pure CSS triangle can substitute if the curl fetch is not available.

---

## Connections heading cog wheel

The `onboarding__list-heading` row gains a cog button on the right side that opens the Settings modal directly to the **Connections** tab — bypassing the full modal open and jumping straight to that section.

### HTML structure change
```html
<!-- before -->
<span class="onboarding__list-heading">Connections</span>

<!-- after -->
<div class="onboarding__list-header">
  <span class="onboarding__list-heading">Connections</span>
  <button class="onboarding__list-cog" aria-label="Open connections settings">
    <!-- Settings.svg icon (already present) -->
  </button>
</div>
```

### Wiring
```ts
function wireListCog(container: HTMLElement): void {
  container
    .querySelector<HTMLButtonElement>(".onboarding__list-cog")!
    .addEventListener("click", () => openSettingsModal("connections"));
}
```

`openSettingsModal(tab)` is a function exported from `SettingsModal.ts` (see `W_SettingsModal.md`). It mounts the modal into `#modal-root` and activates the given tab.

### CSS additions
```css
.onboarding__list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  margin-bottom: 4px;
}

.onboarding__list-heading {
  /* remove existing padding/margin — now handled by parent */
}

.onboarding__list-cog {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: color 0.12s ease, background-color 0.12s ease;
}

.onboarding__list-cog:hover {
  color: var(--color-text-primary);
  background-color: var(--color-surface);
}

.onboarding__list-cog svg {
  width: 13px;
  height: 13px;
  pointer-events: none;
}
```

---

## Titlebar cog wheel button

A `Settings.svg` icon button is added to `buildIconButtons()` as the **leftmost** element of `.titlebar__icons` — opposite the existing status dot, mute, layout, and power buttons. Its position on the far left of that group creates a clear visual separation: the cog is a "settings shortcut", the others are "live controls".

### HTML addition in `buildIconButtons()`
```ts
// add as first child inside .titlebar__icons
`<button class="titlebar__icon-btn" id="tb-settings" aria-label="Open connections settings">${settingsIcon}</button>`
```

### Wiring in `wireTitlebarCog()`
```ts
function wireTitlebarCog(container: HTMLElement): void {
  container
    .querySelector<HTMLButtonElement>("#tb-settings")!
    .addEventListener("click", () => openSettingsModal("connections"));
}
```

`wireTitlebarCog()` is called from `mountTitlebar()` after the other wire functions. It imports `openSettingsModal` from `./SettingsModal` — stubbed until that module is built.

The button inherits `.titlebar__icon-btn` exactly — no new CSS class required.

---

## Implementation steps

1. Fetch `CaretDown.svg` icon to `src/assets/icons/CaretDown.svg`
2. Add `GroupEntry` interface and `Chat`/`Discord`/`Teams` to `ConnectionKind` enum in `Onboarding.ts`
3. Add `CHAT_GROUP` constant; remove Slack from top-level `CONNECTIONS`
4. Add `buildGroupCard()` and `buildSubCard()` functions
5. Update `buildView()` — wrap heading in `.onboarding__list-header` with cog button; render `CHAT_GROUP` then remaining `CONNECTIONS`
6. Add `wireGroupCards()`, `wireSubCards()`, and `wireListCog()` functions
7. Update `mountOnboarding()` to call all wire functions
8. Add all new CSS rules to `Onboarding.css`
9. Import `openSettingsModal` from `SettingsModal.ts` once that module exists (stub call until then)
10. Add `settingsIcon` import and `tb-settings` button to `Titlebar.ts`; add `wireTitlebarCog()` and call it from `mountTitlebar()`
