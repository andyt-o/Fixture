// ======================================================================
// Imports
// ======================================================================
import { invoke } from "@tauri-apps/api/core";
import { mountDashboard } from "./Dashboard";
import { openSettingsModal } from "./SettingsModal";
import { APP_CATEGORIES, buildAppIconDropdown, loadDiscoveredApps, wireAppIconDropdowns, type AppCategory, type DiscoveredApps } from "./AppIconDropdown";

import chatIcon from "../assets/icons/Chat.svg?raw";
import discordIcon from "../assets/icons/Discord.svg?raw";
import slackIcon from "../assets/icons/Slack.svg?raw";
import teamsIcon from "../assets/icons/MicrosoftTeams.svg?raw";
import jiraIcon from "../assets/icons/Jira.svg?raw";
import robotIcon from "../assets/icons/Robot.svg?raw";
import ibmIcon from "../assets/icons/IBM.svg?raw";
import openAiIcon from "../assets/icons/OpenAI.svg?raw";
import codeEditorIcon from "../assets/icons/CodeEditor.svg?raw";
import webIcon from "../assets/icons/Web.svg?raw";
import emailIcon from "../assets/icons/Email.svg?raw";
import fixtureIcon from "../assets/icons/Fixture.svg?raw";
import settingsIcon from "../assets/icons/Settings.svg?raw";
import caretDownIcon from "../assets/icons/Caret.svg?raw";

import "../styles/Onboarding.css";

// ======================================================================
// Types
// ======================================================================
const enum ConnectionKind {
  Chat = "chat",
  Discord = "discord",
  Slack = "slack",
  Teams = "microsoft-teams",
  Jira = "jira",
  ApiToken = "api-token",
  Ide = "ide",
  Browser = "browser",
  Email = "email",
  AiAgentGroup = "ai-agent-group",
  IbmCloudBob = "ibm-cloud-bob",
  OpenAi = "openai",
}

interface ConnectionEntry {
  kind: ConnectionKind;
  label: string;
  description: string;
  icon: string;
  optional: boolean;
}

interface GroupEntry {
  kind: ConnectionKind;
  label: string;
  icon: string;
  children: ConnectionEntry[];
}

// ======================================================================
// Constants
// ======================================================================
const CHAT_GROUP: GroupEntry = {
  kind: ConnectionKind.Chat,
  label: "Chat",
  icon: chatIcon,
  children: [
    { kind: ConnectionKind.Discord, label: "Discord", description: "Stream server channels, DMs, and mentions.", icon: discordIcon, optional: false },
    { kind: ConnectionKind.Slack, label: "Slack", description: "Stream mentions, DMs, and channel activity.", icon: slackIcon, optional: false },
    { kind: ConnectionKind.Teams, label: "Microsoft Teams", description: "Surface chats, channel posts, and @mentions.", icon: teamsIcon, optional: false },
  ],
};

const AI_AGENT_GROUP: GroupEntry = {
  kind: ConnectionKind.AiAgentGroup,
  label: "AI / LLM Providers",
  icon: robotIcon,
  children: [
    { kind: ConnectionKind.IbmCloudBob, label: "IBM Cloud & Bob", description: "Watsonx.ai & Watsonx Orchestrate agent runtime with Granite/Llama.", icon: ibmIcon, optional: false },
    { kind: ConnectionKind.OpenAi, label: "OpenAI", description: "Use an OpenAI API key as the primary or secondary provider.", icon: openAiIcon, optional: true },
  ],
};

const CONNECTIONS: ConnectionEntry[] = [
  { kind: ConnectionKind.Jira, label: "Jira", description: "Track assigned issues, sprint progress, and status transitions.", icon: jiraIcon, optional: true },
  { kind: ConnectionKind.Ide, label: "Code Editor", description: "Link your preferred IDE to open files and navigate code directly.", icon: codeEditorIcon, optional: true },
  { kind: ConnectionKind.Browser, label: "Browser", description: "Set your default browser for opening links from within Fixture.", icon: webIcon, optional: true },
  { kind: ConnectionKind.Email, label: "Email", description: "Link a mail app or URL to compose and manage email from Fixture.", icon: emailIcon, optional: true },
];

const INFO_LINKS: { label: string; target: string }[] = [
  { label: "Documentation", target: "docs" },
  { label: "Keyboard Shortcuts", target: "shortcuts" },
  { label: "Privacy Notice", target: "privacy" },
  { label: "About Fixture", target: "about" },
];

const AI_PROVIDER_FIELDS = {
  ibm: [
    { key: "watsonx_cloud_key", label: "IBM Cloud API key", type: "password" },
    { key: "ibm_cloud_project_id", label: "Project ID", type: "text" },
    { key: "bob_service_credentials", label: "Bob / Orchestrate credentials", type: "password" },
  ],
  openai: [
    { key: "openai_gateway_key", label: "OpenAI API key", type: "password" },
  ],
};

// ======================================================================
// Functions
// ======================================================================
function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required onboarding element not found: ${selector}`);
  return element;
}

function buildCard(entry: ConnectionEntry, discoveredApps: DiscoveredApps): string {
  const optionalClass = entry.optional ? " onboarding__card--optional" : "";
  const badge = entry.optional ? `<span class="onboarding__card-badge">Optional</span>` : "";
  if (APP_CATEGORIES.includes(entry.kind as AppCategory)) {
    const category = entry.kind as AppCategory;
    const dropdown = buildAppIconDropdown(category, discoveredApps[category], entry.icon);
    return `<div class="onboarding__card onboarding__card--app${optionalClass}" data-connection="${entry.kind}"><div class="onboarding__card-content"><div class="onboarding__card-row"><span class="onboarding__card-icon" aria-hidden="true">${entry.icon}</span><span class="onboarding__card-label">${entry.label}${badge}</span></div><span class="onboarding__card-desc">${entry.description}</span></div>${dropdown}</div>`;
  }
  return `<button class="onboarding__card${optionalClass}" data-connection="${entry.kind}" aria-label="Connect ${entry.label}"><div class="onboarding__card-row"><span class="onboarding__card-icon" aria-hidden="true">${entry.icon}</span><span class="onboarding__card-label">${entry.label}${badge}</span></div><span class="onboarding__card-desc">${entry.description}</span><span class="onboarding__card-action">Connect</span></button>`;
}

export function buildProviderFields(kind: string): string {
  const provider = kind === ConnectionKind.IbmCloudBob ? "ibm" : "openai";
  const fields = AI_PROVIDER_FIELDS[provider].map(field => {
    const reveal = field.type === "password" ? `<button class="onboarding__secret-toggle" type="button" data-secret-toggle="${field.key}" aria-label="Show ${field.label}" aria-pressed="false">Show</button>` : "";
    return `<label class="onboarding__provider-field"><span>${field.label}</span><span class="onboarding__secret-field"><input type="${field.type}" data-secret-key="${field.key}" autocomplete="off" />${reveal}</span></label>`;
  }).join("");
  const priority = provider === "ibm" ? "watsonx" : "openai";
  return `<form class="onboarding__provider-form" data-provider="${priority}">${fields}<label class="onboarding__priority-toggle"><input type="checkbox" data-priority="${priority}" /><span class="onboarding__toggle-track"></span><span>Set as Primary Engine</span></label><button class="onboarding__provider-save" type="submit">Save credentials</button><span class="onboarding__provider-status" aria-live="polite"></span></form>`;
}

function buildSubCard(entry: ConnectionEntry, groupKind: ConnectionKind): string {
  const isProvider = groupKind === ConnectionKind.AiAgentGroup;
  const optionalClass = entry.optional ? " onboarding__sub-card--optional" : "";
  const action = isProvider ? buildProviderFields(entry.kind) : `<span class="onboarding__card-action">Connect</span>`;
  return `<div class="onboarding__sub-card${optionalClass}" data-connection="${entry.kind}"><button class="onboarding__sub-card-trigger" data-connection="${entry.kind}" aria-label="${isProvider ? "Configure" : "Connect"} ${entry.label}"><div class="onboarding__card-row"><span class="onboarding__card-icon" aria-hidden="true">${entry.icon}</span><span class="onboarding__card-label">${entry.label}</span></div><span class="onboarding__card-desc">${entry.description}</span>${isProvider ? "" : action}</button>${isProvider ? action : ""}</div>`;
}

function buildGroupCard(group: GroupEntry): string {
  const children = group.children.map(entry => buildSubCard(entry, group.kind)).join("");
  return `<div class="onboarding__group" data-group="${group.kind}"><button class="onboarding__group-header" aria-expanded="false" data-group="${group.kind}" aria-label="Expand ${group.label} connections"><div class="onboarding__card-row"><span class="onboarding__card-icon" aria-hidden="true">${group.icon}</span><span class="onboarding__card-label">${group.label}</span></div><span class="onboarding__group-caret" aria-hidden="true">${caretDownIcon}</span></button><div class="onboarding__group-children" aria-hidden="true">${children}</div></div>`;
}

function buildInfoPanel(): string {
  const links = INFO_LINKS.map(({ label, target }) => `<button class="onboarding__info-link" data-target="${target}">${label}</button>`).join("");
  return `<div class="onboarding__info"><div class="onboarding__info-hero"><span class="onboarding__logo" aria-hidden="true">${fixtureIcon}</span><h1 class="onboarding__heading">Welcome to Fixture</h1><p class="onboarding__sub">Fixture is a lightweight overlay that keeps your tools — Slack, Jira, your editor, and more — immediately accessible without leaving your flow. Connect what you need below to get started.</p></div><div class="onboarding__info-links"><span class="onboarding__info-links-label">Quick links</span>${links}</div></div>`;
}

function buildView(discoveredApps: DiscoveredApps): string {
  const cards = CONNECTIONS.map(entry => buildCard(entry, discoveredApps)).join("");
  return `<div class="onboarding"><div class="onboarding__list"><div class="onboarding__list-header"><span class="onboarding__list-heading">Connections</span><button class="onboarding__list-cog" aria-label="Open connections settings">${settingsIcon}</button></div><div class="onboarding__cards">${buildGroupCard(CHAT_GROUP)}${buildGroupCard(AI_AGENT_GROUP)}${cards}</div><button class="onboarding__dashboard-btn" aria-label="Go to Dashboard">Go to Dashboard</button></div>${buildInfoPanel()}</div>`;
}

function wireCards(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".onboarding__card[data-connection]:not(.onboarding__card--app)").forEach(card => {
    card.addEventListener("click", () => {
      const kind = card.dataset["connection"];
      if (kind) invoke("open_connection_flow", { kind }).catch(() => {});
    });
  });
}

function wireSubCards(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".onboarding__sub-card-trigger[data-connection]").forEach(card => {
    card.addEventListener("click", () => {
      const kind = card.dataset["connection"];
      if (!kind || kind === ConnectionKind.IbmCloudBob || kind === ConnectionKind.OpenAi) return;
      invoke("open_connection_flow", { kind }).catch(() => {});
    });
  });
}

function wireGroupCards(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".onboarding__group-header").forEach(header => {
    header.addEventListener("click", () => {
      const wasExpanded = header.getAttribute("aria-expanded") === "true";
      container.querySelectorAll<HTMLElement>(".onboarding__group").forEach(group => {
        const groupHeader = requireElement<HTMLButtonElement>(group, ".onboarding__group-header");
        const children = requireElement<HTMLElement>(group, ".onboarding__group-children");
        const expanded = !wasExpanded && groupHeader === header;
        groupHeader.setAttribute("aria-expanded", String(expanded));
        children.setAttribute("aria-hidden", String(!expanded));
        group.classList.toggle("onboarding__group--expanded", expanded);
      });
    });
  });
  wireSubCards(container);
}

export function wireProviderForms(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".onboarding__secret-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const input = requireElement<HTMLInputElement>(container, `[data-secret-key="${button.dataset["secretToggle"]}"]`);
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.textContent = visible ? "Hide" : "Show";
      button.setAttribute("aria-pressed", String(visible));
    });
  });
  container.querySelectorAll<HTMLFormElement>(".onboarding__provider-form").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const status = form.querySelector<HTMLElement>(".onboarding__provider-status");
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>("[data-secret-key]"));
      try {
        for (const input of inputs) {
          if (input.value.trim()) await invoke("store_secret", { key: input.dataset["secretKey"], secret: input.value.trim() });
        }
        const priorityInput = form.querySelector<HTMLInputElement>("[data-priority]");
        if (priorityInput?.checked) {
          await invoke("set_llm_provider_priority", {
            primary: priorityInput.dataset["priority"],
            fallbackEnabled: true,
          });
        }
        if (status) status.textContent = "Credentials saved.";
      } catch {
        if (status) status.textContent = "Could not save provider settings.";
      }
    });
  });
}

function wireListCog(container: HTMLElement): void {
  requireElement<HTMLButtonElement>(container, ".onboarding__list-cog").addEventListener("click", () => openSettingsModal("connections"));
}

function wireDashboardBtn(container: HTMLElement): void {
  requireElement<HTMLButtonElement>(container, ".onboarding__dashboard-btn").addEventListener("click", () => mountDashboard(container));
}

function wireInfoLinks(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>(".onboarding__info-link").forEach(btn => {
    btn.addEventListener("click", () => invoke("open_help_section", { target: btn.dataset["target"] }).catch(() => {}));
  });
}

// ======================================================================
// Mount
// ======================================================================
export async function mountOnboarding(container: HTMLElement, force = false): Promise<void> {
  const hasConnections = await invoke<boolean>("check_connections").catch(() => false);
  if (hasConnections && !force) {
    mountDashboard(container);
    return;
  }
  const discoveredApps = await loadDiscoveredApps();
  container.innerHTML = buildView(discoveredApps);
  wireAppIconDropdowns(container);
  wireCards(container);
  wireGroupCards(container);
  wireProviderForms(container);
  wireListCog(container);
  wireDashboardBtn(container);
  wireInfoLinks(container);
}
