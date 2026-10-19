// ==============================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";
import { requireElement, escapeHtml } from "../utils/Dom";
import { formatTimestamp } from "../utils/Format";
import { CONNECTION_ROWS } from "../data/Connections";

import robotIcon from "../assets/icons/Robot.svg?raw";

import { openSettingsModal } from "./SettingsModal";
import { mountOverlay }      from "./OverlayController";
import "../styles/Dashboard.css";
import "../styles/Buttons.css";
import "../styles/Labels.css";
import "../styles/Icons.css";
import "../styles/StatusDot.css";

// ==============================================================================
// Types
// ==============================================================================
type DashboardCol = "activity" | "connections" | "issues" | "agent";

type ConnectionMap = Record<string, boolean>;

interface FeedItem {
  serviceKind: string;
  serviceIcon: string;
  actor: string;
  description: string;
  timestamp: number;
}

interface IssueItem {
  key: string;
  summary: string;
  priority: string;
  status: string;
}

interface AgentItem {
  agentName: string;
  agentIcon: string;
  preview: string;
  timestamp: number;
}

// ==============================================================================
// Constants
// ==============================================================================
const DASHBOARD_COLS: { col: DashboardCol; label: string }[] = [
  { col: "activity", label: "Activity" },
  { col: "connections", label: "Connections" },
  { col: "issues", label: "Issues" },
  { col: "agent", label: "Agent" },
];

// ==============================================================================
// Functions
// ==============================================================================
function buildRail(): string {
  return `
    <aside class="dashboard__rail">
      <button class="dashboard__start btn btn--primary btn--lg" id="db-start" aria-label="Start Fixture overlay">Start</button>
      <div class="dashboard__rail-section">
        <span class="dashboard__rail-heading section-label">Connections</span>
        <div class="dashboard__rail-connections" id="db-rail-connections"></div>
      </div>
      <div class="dashboard__rail-section">
        <span class="dashboard__rail-heading section-label">Overlay</span>
        <span class="dashboard__rail-layout" id="db-rail-layout">—</span>
      </div>
      <div class="dashboard__rail-footer">
        <button class="dashboard__rail-shortcut" data-action="settings" aria-label="Open settings">Settings</button>
        <button class="dashboard__rail-shortcut" data-action="shortcuts" aria-label="Open keyboard shortcuts">Shortcuts</button>
      </div>
    </aside>
  `;
}

function buildTabStrip(): string {
  return `
    <nav class="dashboard__tabs" aria-label="Dashboard panels">
      ${DASHBOARD_COLS.map(({ col, label }, index) =>
        `<button class="dashboard__tab${index === 0 ? " dashboard__tab--active" : ""}" data-col="${col}" aria-selected="${index === 0}">${label}</button>`
      ).join("")}
    </nav>
  `;
}

function buildActivityCol(): string {
  return `<section class="dashboard__col" data-col="activity" aria-label="Activity"><h2 class="dashboard__col-heading">Recent Activity</h2><div class="dashboard__items" id="db-activity-items"><p class="dashboard__empty">No recent activity.</p></div></section>`;
}

function buildConnectionsCol(): string {
  return `<section class="dashboard__col" data-col="connections" aria-label="Connections"><h2 class="dashboard__col-heading">Connections</h2><div class="dashboard__items" id="db-connection-items"></div></section>`;
}

function buildIssuesCol(): string {
  return `<section class="dashboard__col" data-col="issues" aria-label="Issues"><h2 class="dashboard__col-heading">Issues</h2><div class="dashboard__items" id="db-issue-items"><p class="dashboard__empty">No open issues.</p></div></section>`;
}

function buildAgentCol(): string {
  return `<section class="dashboard__col" data-col="agent" aria-label="Agent"><h2 class="dashboard__col-heading">Agent</h2><div class="dashboard__items" id="db-agent-items"><p class="dashboard__empty">No agent activity.</p></div></section>`;
}

function buildRailConnection(entry: { kind: string; label: string; icon: string }, connected: boolean): string {
  const kind = escapeHtml(entry.kind);
  return `
    <button class="dashboard__rail-conn" data-kind="${kind}" aria-label="Open ${escapeHtml(entry.label)} connection settings">
      <span class="dashboard__rail-conn-icon icon-wrap" aria-hidden="true">${entry.icon}</span>
      <span class="dashboard__rail-conn-label">${escapeHtml(entry.label)}</span>
      <span class="dashboard__rail-conn-dot status-dot${connected ? " status-dot--connected" : ""}" aria-label="${connected ? "Connected" : "Not connected"}"></span>
    </button>
  `;
}

function buildConnectionItem(entry: { kind: string; label: string; icon: string }, connected: boolean): string {
  return `
    <div class="dashboard__connection" data-kind="${escapeHtml(entry.kind)}">
      <span class="dashboard__connection-icon icon-wrap icon-wrap--md" aria-hidden="true">${entry.icon}</span>
      <span class="dashboard__connection-name">${escapeHtml(entry.label)}</span>
      <span class="dashboard__connection-status${connected ? " dashboard__connection-status--connected" : ""}">${connected ? "Connected" : "Not connected"}</span>
      <button class="dashboard__connection-action btn btn--ghost btn--sm" data-kind="${escapeHtml(entry.kind)}">${connected ? "Disconnect" : "Connect"}</button>
    </div>
  `;
}

function buildActivityItem(item: FeedItem): string {
  const icon = CONNECTION_ROWS.find(entry => entry.kind === item.serviceKind)?.icon ?? "";
  return `
    <article class="dashboard__activity-item">
      <span class="dashboard__item-icon icon-wrap icon-wrap--md" aria-hidden="true">${icon}</span>
      <div class="dashboard__activity-copy">
        <div class="dashboard__activity-title"><strong>${escapeHtml(item.actor)}</strong><span>${escapeHtml(item.description)}</span></div>
        <time class="dashboard__item-time">${escapeHtml(formatTimestamp(item.timestamp))}</time>
      </div>
    </article>
  `;
}

function buildIssueItem(item: IssueItem): string {
  const priority = escapeHtml(item.priority.toLowerCase());
  return `
    <article class="dashboard__issue-item">
      <div class="dashboard__issue-meta"><span class="dashboard__issue-key">${escapeHtml(item.key)}</span><span class="dashboard__priority-dot dashboard__priority-dot--${priority}" aria-label="${escapeHtml(item.priority)} priority"></span><span class="dashboard__issue-status">${escapeHtml(item.status)}</span></div>
      <p class="dashboard__issue-summary">${escapeHtml(item.summary)}</p>
    </article>
  `;
}

function buildAgentItem(item: AgentItem): string {
  return `
    <article class="dashboard__agent-item">
      <div class="dashboard__agent-title"><span class="dashboard__item-icon icon-wrap icon-wrap--md" aria-hidden="true">${robotIcon}</span><strong>${escapeHtml(item.agentName)}</strong><time class="dashboard__item-time">${escapeHtml(formatTimestamp(item.timestamp))}</time></div>
      <p class="dashboard__agent-preview">${escapeHtml(item.preview)}</p>
    </article>
  `;
}

function setItems<T>(container: HTMLElement, items: T[], buildItem: (item: T) => string, emptyMessage: string): void {
  container.innerHTML = items.length
    ? items.map(buildItem).join("")
    : `<p class="dashboard__empty">${emptyMessage}</p>`;
}

async function loadDashboardData(container: HTMLElement): Promise<void> {
  const [connections, layout, activity, issues, agents] = await Promise.all([
    invoke<ConnectionMap>("get_connection_states").catch((): ConnectionMap => ({})),
    invoke<string>("get_active_layout").catch(() => "—"),
    invoke<FeedItem[]>("get_activity_feed").catch((): FeedItem[] => []),
    invoke<IssueItem[]>("get_jira_issues").catch((): IssueItem[] => []),
    invoke<AgentItem[]>("get_agent_activity").catch((): AgentItem[] => []),
  ]);

  if (!container.isConnected) return;
  requireElement<HTMLElement>(container, "#db-rail-connections").innerHTML = CONNECTION_ROWS
    .map(entry => buildRailConnection(entry, !!connections[entry.kind])).join("");
  requireElement<HTMLElement>(container, "#db-connection-items").innerHTML = CONNECTION_ROWS
    .map(entry => buildConnectionItem(entry, !!connections[entry.kind])).join("");
  requireElement<HTMLElement>(container, "#db-rail-layout").textContent = layout;
  const recentActivity = [...activity].sort((first, second) => second.timestamp - first.timestamp);
  setItems(requireElement<HTMLElement>(container, "#db-activity-items"), recentActivity, buildActivityItem, "No recent activity.");
  setItems(requireElement<HTMLElement>(container, "#db-issue-items"), issues, buildIssueItem, "No open issues.");
  setItems(requireElement<HTMLElement>(container, "#db-agent-items"), agents, buildAgentItem, "No agent activity.");

  container.querySelectorAll<HTMLButtonElement>(".dashboard__rail-conn").forEach(button => {
    button.addEventListener("click", () => openSettingsModal("connections"));
  });
  container.querySelectorAll<HTMLButtonElement>(".dashboard__connection-action").forEach(button => {
    button.addEventListener("click", () => {
      const kind = button.dataset["kind"] ?? "";
      const connected = connections[kind];
      const command = connected ? "disconnect_service" : "open_connection_flow";
      void invoke(command, { kind }).then(() => loadDashboardData(container)).catch(() => {});
    });
  });
}

function scrollToColumn(track: HTMLElement, col: DashboardCol): void {
  requireElement<HTMLElement>(track, `.dashboard__col[data-col="${col}"]`)
    .scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
}

function updateActiveTab(container: HTMLElement): void {
  const track = requireElement<HTMLElement>(container, "#db-track");
  const midpoint = track.scrollLeft + track.clientWidth / 2;
  let activeCol: DashboardCol = "activity";
  track.querySelectorAll<HTMLElement>(".dashboard__col").forEach(col => {
    if (midpoint >= col.offsetLeft && midpoint < col.offsetLeft + col.offsetWidth) {
      activeCol = col.dataset["col"] as DashboardCol;
    }
  });
  container.querySelectorAll<HTMLButtonElement>(".dashboard__tab").forEach(tab => {
    const active = tab.dataset["col"] === activeCol;
    tab.classList.toggle("dashboard__tab--active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

// ==============================================================================
// Mount
// ==============================================================================
export function mountDashboard(container: HTMLElement): void {
  container.innerHTML = `
    <div class="dashboard">
      ${buildRail()}
      <main class="dashboard__main">
        ${buildTabStrip()}
        <div class="dashboard__track" id="db-track">
          ${buildActivityCol()}
          ${buildConnectionsCol()}
          ${buildIssuesCol()}
          ${buildAgentCol()}
        </div>
      </main>
    </div>
  `;

  const track = requireElement<HTMLElement>(container, "#db-track");
  container.querySelectorAll<HTMLButtonElement>(".dashboard__tab").forEach(tab => {
    tab.addEventListener("click", () => scrollToColumn(track, tab.dataset["col"] as DashboardCol));
  });
  track.addEventListener("scroll", () => updateActiveTab(container), { passive: true });
  requireElement<HTMLButtonElement>(container, "#db-start").addEventListener("click", () => {
    mountOverlay(container, "floating-hud");
  });
  container.querySelectorAll<HTMLButtonElement>(".dashboard__rail-shortcut").forEach(button => {
    button.addEventListener("click", () => {
      openSettingsModal(button.dataset["action"] === "shortcuts" ? "hotkeys" : "profile");
    });
  });
  void loadDashboardData(container);
}
