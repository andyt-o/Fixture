# X_Dashboard — Dashboard View

## Goal
The Dashboard is the primary post-onboarding view. It replaces the `#content` area when the user clicks "Go to Dashboard" on the Onboarding page, or navigates back from any other view. The layout is **column-based with a permanent high-contrast left rail** and a **horizontally scrolling column area** to its right. The left rail is always visible and is visually dominant (contrasting background colour). The right area contains a row of fixed-width columns that scroll horizontally, each column representing a distinct content panel (tab). Above the scrolling columns sits a tab strip used to jump directly to a named column.

> **Scaling note:** All sizing follows the project UI-scaling system. The single `:root { font-size: clamp(13px, 0.833vw, 24px) }` in `Globals.css` drives all `rem` values. Every font size, padding, gap, margin, and icon size in this component is in `rem` (value ÷ 16). Structural column widths use `clamp(floor, %, ceiling)` — never a bare `px` width. Only `border-width`, `border-radius`, and `--titlebar-height` remain in `px`.

---

## Files to affect

| File | Change |
|---|---|
| `src/components/Dashboard.ts` | New file — full Dashboard component, left rail, column panels, tab strip, wiring |
| `src/styles/Dashboard.css` | New file — outer shell, left rail, tab strip, scrolling track, column panel styles |
| `src/components/Onboarding.ts` | Replace `invoke("navigate_to_dashboard")` stub with direct `mountDashboard(container)` call |
| `src/main.ts` | Import `Dashboard.ts` so the module is registered |

---

## Layout overview

```
┌──────────────────────────────────────────────────────────────┐
│  Titlebar (always above, not part of Dashboard)              │
├──────────────┬───────────────────────────────────────────────┤
│              │  [Activity] [Connections] [Issues] [Agent]    │  ← tab strip
│  LEFT RAIL   ├───────────────────────────────────────────────┤
│  (contrast)  │ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│              │ │ Activity │ │Connections│ │  Issues  │  ...  │  ← fixed-width columns
│  START       │ │  column  │ │  column  │ │  column  │       │  ← horizontally scrolling
│  ─────────   │ │          │ │          │ │          │       │
│  Connections │ │          │ │          │ │          │       │
│  ─────────   │ └──────────┘ └──────────┘ └──────────┘       │
│  Layout      │                                               │
│  ─────────   │                                               │
│  Settings    │                                               │
│  Shortcuts   │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

---

## Dashboard structure — HTML

```html
<div class="dashboard">

  <!-- Left rail — always visible, contrasting background -->
  <aside class="dashboard__rail">
    <button class="dashboard__start" id="db-start" aria-label="Start Fixture overlay">
      Start
    </button>

    <div class="dashboard__rail-section">
      <span class="dashboard__rail-heading">Connections</span>
      <div class="dashboard__rail-connections" id="db-rail-connections">
        <!-- one .dashboard__rail-conn per connected service, injected on load -->
      </div>
    </div>

    <div class="dashboard__rail-section">
      <span class="dashboard__rail-heading">Overlay</span>
      <span class="dashboard__rail-layout" id="db-rail-layout">Floating HUD</span>
    </div>

    <div class="dashboard__rail-footer">
      <button class="dashboard__rail-shortcut" data-action="settings"  aria-label="Open settings">Settings</button>
      <button class="dashboard__rail-shortcut" data-action="shortcuts" aria-label="Open keyboard shortcuts">Shortcuts</button>
    </div>
  </aside>

  <!-- Right area: tab strip + scrolling column track -->
  <div class="dashboard__main">

    <!-- Tab strip -->
    <nav class="dashboard__tabs" aria-label="Dashboard panels">
      <button class="dashboard__tab dashboard__tab--active" data-col="activity">Activity</button>
      <button class="dashboard__tab" data-col="connections">Connections</button>
      <button class="dashboard__tab" data-col="issues">Issues</button>
      <button class="dashboard__tab" data-col="agent">Agent</button>
    </nav>

    <!-- Horizontally scrolling column track -->
    <div class="dashboard__track" id="db-track">

      <section class="dashboard__col" data-col="activity"     aria-label="Activity">
        <!-- activity feed items injected here -->
      </section>

      <section class="dashboard__col" data-col="connections"  aria-label="Connections">
        <!-- connection rows injected here -->
      </section>

      <section class="dashboard__col" data-col="issues"       aria-label="Issues">
        <!-- issue rows injected here -->
      </section>

      <section class="dashboard__col" data-col="agent"        aria-label="Agent">
        <!-- agent response items injected here -->
      </section>

    </div>

  </div>

</div>
```

---

## Left rail — detail

The rail has a fixed width and uses `var(--color-surface)` (or a dedicated darker token) as its background, contrasting clearly against the main content area's `var(--color-bg)`. It is always visible regardless of which column is in view. It never scrolls.

### START button
- Large, full-width accent-coloured button at the top of the rail.
- Calls `invoke("start_overlay")` when clicked.
- Visually distinct from all other rail elements — uses `var(--color-accent)` fill.

### Connections list (rail)
- One compact row per service that has a stored connection (connected or not).
- Each row: small service icon (14 × 14) + service name label + coloured status dot.
- Green dot = connected, grey dot = not connected.
- Rows populated from `invoke<ConnectionMap>("get_connection_states")` on mount.
- Clicking a row calls `openSettingsModal("connections")`.

### Overlay layout label
- Read-only single-line display of the currently active overlay variant (e.g. "Floating HUD", "Docked Sidebar", "Mini-Pill").
- Value loaded from `invoke<string>("get_active_layout")` on mount. Falls back to `"—"` if unavailable.

### Shortcut buttons (footer)
Two ghost buttons pinned to the bottom of the rail:
- **Settings** → `openSettingsModal("profile")`
- **Shortcuts** → `openSettingsModal("hotkeys")`

---

## Column panels — detail

Each `.dashboard__col` has a **fixed width** (`320px`) and fills the full height of the track. The track itself is a horizontally scrolling flex container. Clicking a tab scrolls the track so that the target column is snapped into view (`scroll-snap-type: x mandatory` on the track, `scroll-snap-align: start` on each column).

### Activity column
- Section heading: "Recent Activity"
- Scrollable vertical feed of `FeedItem` rows, newest first.
- Each row: service icon, actor name, description (1 line truncated), relative timestamp.
- Empty state: `"No recent activity."`
- Data: `invoke<FeedItem[]>("get_activity_feed")`

### Connections column
- Section heading: "Connections"
- One row per service (same set as the left rail but with more detail).
- Each row: service icon, service name, status badge (`Connected` / `Not connected`), `Connect` / `Disconnect` action button.
- Clicking `Connect` → `invoke("open_connection_flow", { kind })`.
- Clicking `Disconnect` → `invoke("disconnect_service", { kind })`.
- Data: `invoke<ConnectionMap>("get_connection_states")`

### Issues column
- Section heading: "Issues"
- List of open Jira issues assigned to the user.
- Each row: issue key (pill), summary (truncated), priority dot, status badge.
- Empty state: `"No open issues."` (also shown if Jira is not connected).
- Data: `invoke<IssueItem[]>("get_jira_issues")`

### Agent column
- Section heading: "Agent"
- List of recent agent responses or pending agent tasks.
- Each row: agent name/icon, response preview (2 lines), timestamp.
- Empty state: `"No agent activity."`
- Data: `invoke<AgentItem[]>("get_agent_activity")`

---

## Tab strip — `scrollToColumn(col)`

Clicking a tab:
1. Sets `dashboard__tab--active` on the clicked tab, removes it from all others.
2. Finds the matching `.dashboard__col[data-col="${col}"]` element.
3. Calls `col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })` on the track.

The track uses `scroll-snap-type: x mandatory` so columns always land cleanly on a column boundary. A passive `scroll` listener on the track updates the active tab to reflect the currently snapped column.

---

## `mountDashboard(container)` — exported function

```ts
export function mountDashboard(container: HTMLElement): void
```

1. Set `container.innerHTML` to the full dashboard shell HTML.
2. Call `loadDashboardData()` to populate all sections.
3. Wire tab strip clicks to `scrollToColumn()`.
4. Wire track scroll to update the active tab.
5. Wire rail connection row clicks to `openSettingsModal("connections")`.
6. Wire rail shortcut buttons to `openSettingsModal(tab)`.
7. Wire START button to `invoke("start_overlay")`.

---

## `loadDashboardData()` — internal async function

Fires parallel `invoke` calls:

| Call | Target |
|---|---|
| `invoke<ConnectionMap>("get_connection_states")` | `#db-rail-connections` + connections column |
| `invoke<string>("get_active_layout")` | `#db-rail-layout` |
| `invoke<FeedItem[]>("get_activity_feed")` | activity column |
| `invoke<IssueItem[]>("get_jira_issues")` | issues column |
| `invoke<AgentItem[]>("get_agent_activity")` | agent column |

All calls are stubbed with `.catch(() => defaultValue)` so the dashboard renders in a safe empty state when Rust commands are absent.

---

## Types — `Dashboard.ts`

```ts
type DashboardCol = "activity" | "connections" | "issues" | "agent";

type ConnectionMap = Record<string, boolean>;

interface FeedItem {
  serviceKind: string;
  serviceIcon: string;
  actor:       string;
  description: string;
  timestamp:   number;
}

interface IssueItem {
  key:      string;
  summary:  string;
  priority: string;
  status:   string;
}

interface AgentItem {
  agentName:   string;
  agentIcon:   string;
  preview:     string;
  timestamp:   number;
}
```

---

## CSS layout — `Dashboard.css`

### Outer shell — horizontal split between rail and main
```css
.dashboard {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg);
}
```

### Left rail — fluid-clamped width, contrasting background
```css
.dashboard__rail {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: clamp(10rem, 14%, 13rem);
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: 1rem 0.75rem;
  gap: 0;
  overflow: hidden;
}
```
`clamp(10rem, 14%, 13rem)` → floor `160px` at baseline, preferred 14% of the window, ceiling `208px`. At the 1920px baseline the rail sits at ~`179px` — matching design intent — while narrowing gracefully in Mini-Pill and Docked Sidebar variants.

### START button
```css
.dashboard__start {
  width: 100%;
  padding: 0.5rem 0;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-bg);
  background-color: var(--color-accent);
  border: none;
  border-radius: 7px;
  cursor: pointer;
  margin-bottom: 1.25rem;
  transition: opacity 0.12s ease;
}

.dashboard__start:hover {
  opacity: 0.88;
}
```

### Rail section headings
```css
.dashboard__rail-heading {
  font-size: 0.5625rem;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 4px;
  margin-bottom: 0.375rem;
}

.dashboard__rail-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 1.25rem;
}
```

### Rail connection rows
```css
.dashboard__rail-conn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 4px;
  border-radius: 5px;
  cursor: pointer;
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  transition: background-color 0.1s ease;
}

.dashboard__rail-conn:hover {
  background-color: var(--color-bg);
}

.dashboard__rail-conn-icon svg {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.dashboard__rail-conn-label {
  flex: 1;
  font-size: 0.75rem;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard__rail-conn-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: var(--color-text-muted);
}

.dashboard__rail-conn-dot--connected {
  background-color: #4caf82;
}
```

### Rail overlay layout label
```css
.dashboard__rail-layout {
  font-size: 0.75rem;
  color: var(--color-text-primary);
  padding: 0 4px;
}
```

### Rail footer shortcut buttons
```css
.dashboard__rail-footer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: auto;
}

.dashboard__rail-shortcut {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.3125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  transition: color 0.1s ease, background-color 0.1s ease;
}

.dashboard__rail-shortcut:hover {
  color: var(--color-text-primary);
  background-color: var(--color-bg);
}
```

### Right main area
```css
.dashboard__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
```

### Tab strip
```css
.dashboard__tabs {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.375rem 1rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.dashboard__tab {
  height: 1.5rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.1s ease, background-color 0.1s ease;
  white-space: nowrap;
}

.dashboard__tab:hover {
  color: var(--color-text-primary);
  background-color: var(--color-surface);
}

.dashboard__tab--active {
  color: var(--color-text-primary);
  font-weight: 600;
  background-color: var(--color-surface);
}
```

### Scrolling column track
```css
.dashboard__track {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.dashboard__track::-webkit-scrollbar {
  display: none;
}
```

### Column panels — fluid-clamped width
```css
.dashboard__col {
  flex-shrink: 0;
  width: clamp(17.5rem, 26%, 22.5rem);
  height: 100%;
  overflow-y: auto;
  scroll-snap-align: start;
  padding: 1.25rem;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
```
`clamp(17.5rem, 26%, 22.5rem)` → floor `280px`, preferred 26% of the scrolling track container, ceiling `360px`. At baseline the track is ~`1740px` wide (1920 − ~180 rail), giving `26% ≈ 452px`, capped to `360px`. On a 1280px window the track is ~`1100px`, giving `26% ≈ 286px`, within the clamped range. Columns stay readable at all viewport sizes Fixture supports.

---

## Implementation steps

1. Create `src/components/Dashboard.ts` — types, `buildRail()`, `buildTabStrip()`, `buildActivityCol()`, `buildConnectionsCol()`, `buildIssuesCol()`, `buildAgentCol()`, `loadDashboardData()`, `scrollToColumn()`, `mountDashboard()`
2. Create `src/styles/Dashboard.css` — all styles from above
3. Import `Dashboard.css` inside `Dashboard.ts`
4. Import `mountDashboard` in `src/main.ts`
5. In `Onboarding.ts`, replace `invoke("navigate_to_dashboard")` stub with `mountDashboard(container)`; add import for `mountDashboard`
