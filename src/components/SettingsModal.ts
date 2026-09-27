// ==============================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";
import { APP_CATEGORIES, buildAppIconDropdown, loadDiscoveredApps, wireAppIconDropdowns, type AppCategory, type DiscoveredApps } from "./AppIconDropdown";
import { buildProviderFields, wireProviderForms } from "./Onboarding";

import closeIcon      from "../assets/icons/Close.svg?raw";
import slackIcon      from "../assets/icons/Slack.svg?raw";
import jiraIcon       from "../assets/icons/Jira.svg?raw";
import discordIcon    from "../assets/icons/Discord.svg?raw";
import teamsIcon      from "../assets/icons/MicrosoftTeams.svg?raw";
import robotIcon      from "../assets/icons/Robot.svg?raw";
import codeEditorIcon from "../assets/icons/CodeEditor.svg?raw";
import webIcon        from "../assets/icons/Web.svg?raw";
import emailIcon      from "../assets/icons/Email.svg?raw";

import { playNotificationChime } from "./AudioCues";

import "../styles/SettingsModal.css";

// ==============================================================================
// Types
// ==============================================================================
type SettingsTab = "profile" | "connections" | "hotkeys" | "appearance" | "notifications";

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

interface AppSettingsPayload {
  autoHideWhenIdle:  boolean;
  autoHideWhenEmpty: boolean;
  alwaysShowToolbar: boolean;
  soundEnabled:      boolean;
}

interface NotificationConfig {
  globalMute:      boolean;
  mentions:        boolean;
  dms:             boolean;
  channelActivity: boolean;
  issueUpdates:    boolean;
  agentResponses:  boolean;
}

interface ProfileConfig {
  displayName:  string;
  organisation: string;
}

interface ServiceNotificationConfig {
  intervalSeconds: number;
  playSound: boolean;
  showOnOverlay: boolean;
  mentions: boolean;
  directMessages: boolean;
  channelActivity: boolean;
  issueUpdates: boolean;
  assignments: boolean;
}

// ==============================================================================
// Constants
// ==============================================================================
const CONNECTION_ROWS: Omit<ConnectionRow, "connected">[] = [
  { kind: "discord",    label: "Discord",     icon: discordIcon    },
  { kind: "slack",      label: "Slack",       icon: slackIcon      },
  { kind: "teams",      label: "Teams",       icon: teamsIcon      },
  { kind: "jira",       label: "Jira",        icon: jiraIcon       },
  { kind: "api-token",  label: "API / Agent", icon: robotIcon      },
  { kind: "ide",        label: "Code Editor", icon: codeEditorIcon },
  { kind: "browser",    label: "Browser",     icon: webIcon        },
  { kind: "email",      label: "Email",       icon: emailIcon      },
];

const DEFAULT_HOTKEYS: HotkeyMap = {
  "Toggle overlay":      "Alt+F1",
  "Mute notifications":  "Alt+M",
  "Open connections":    "Alt+C",
  "Open settings":       "Alt+,",
};

const SWATCH_COUNT = 6;

const SERVICE_POLL_OPTIONS = [15, 30, 60, 120];

const DEFAULT_SERVICE_NOTIFICATION_CONFIG: ServiceNotificationConfig = {
  intervalSeconds: 30,
  playSound: true,
  showOnOverlay: true,
  mentions: true,
  directMessages: true,
  channelActivity: false,
  issueUpdates: true,
  assignments: true,
};

// ==============================================================================
// Functions
// ==============================================================================

// --- Module-level state ---
let escListener: ((e: KeyboardEvent) => void) | null = null;
let hotkeyCapture: { listener: (e: KeyboardEvent) => void; key: HTMLElement } | null = null;

function cancelHotkeyCapture(): void {
  if (!hotkeyCapture) return;
  document.removeEventListener("keydown", hotkeyCapture.listener, true);
  hotkeyCapture.key.textContent = hotkeyCapture.key.dataset["binding"] ?? "";
  hotkeyCapture.key.classList.remove("settings-modal__hotkey-key--capturing");
  hotkeyCapture = null;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required settings modal element not found: ${selector}`);
  return element;
}

function buildConnectionRow(row: Omit<ConnectionRow, "connected">, connected: boolean, discoveredApps: DiscoveredApps): string {
  const statusClass = connected ? " settings-modal__conn-status--connected" : "";
  const statusText  = connected ? "Connected" : "Not connected";
  const actionClass = connected ? " settings-modal__conn-action--disconnect" : "";
  const actionText  = connected ? "Disconnect" : "Connect";
  const isAppRow = APP_CATEGORIES.includes(row.kind as AppCategory);
  const action = row.kind === "api-token"
    ? `<button class="settings-modal__conn-action" type="button" aria-expanded="false" data-provider-toggle>Configure</button>`
    : isAppRow
    ? buildAppIconDropdown(row.kind as AppCategory, discoveredApps[row.kind as AppCategory], row.icon)
    : `<button class="settings-modal__conn-action${actionClass}" data-kind="${row.kind}" data-connected="${connected}">${actionText}</button>`;

  const hasDetailedSettings = ["discord", "slack", "jira"].includes(row.kind);
  const detailedSettings = hasDetailedSettings ? buildServiceSettings(row.kind) : "";

  const providerSettings = row.kind === "api-token" ? `
    <div class="settings-modal__provider-settings" aria-hidden="true">
      <details class="settings-modal__provider-card"><summary>IBM Cloud &amp; Bob</summary>${buildProviderFields("ibm-cloud-bob")}</details>
      <details class="settings-modal__provider-card"><summary>OpenAI</summary>${buildProviderFields("openai")}</details>
    </div>` : "";

  return `
    <div class="settings-modal__conn-row" data-kind="${row.kind}">
      <span class="settings-modal__conn-icon" aria-hidden="true">${row.icon}</span>
      <span class="settings-modal__conn-label">${row.label}</span>
      <span class="settings-modal__conn-status${statusClass}">${statusText}</span>
      ${action}
    </div>
    ${detailedSettings}
    ${providerSettings}
  `;
}

function buildServiceSettings(kind: string): string {
  const isJira = kind === "jira";
  const activityControls = isJira
    ? `${buildToggleRow(`${kind}-issue-updates`, "Issue updates", "Status changes on watched issues", true)}${buildToggleRow(`${kind}-assignments`, "Assignments", "Changes to issue assignees", true)}`
    : `${buildToggleRow(`${kind}-mentions`, "Mentions", "Messages that mention you", true)}${buildToggleRow(`${kind}-dms`, "Direct messages", "Incoming direct messages", true)}${buildToggleRow(`${kind}-channels`, "Channel activity", "New messages in watched channels", false)}`;
  const pollOptions = SERVICE_POLL_OPTIONS.map(seconds => `<option value="${seconds}"${seconds === 30 ? " selected" : ""}>${seconds} seconds</option>`).join("");

  return `
    <section class="settings-modal__service-settings" data-service-settings="${kind}" aria-label="${kind} settings">
      <div class="settings-modal__service-controls">
        <label class="settings-modal__service-field">
          <span class="settings-modal__service-field-label">${isJira ? "Issue polling" : "Notification polling"}</span>
          <select class="settings-modal__jira-poll-select" data-service-poll="${kind}">${pollOptions}<option value="null">Manual only</option></select>
        </label>
        ${buildToggleRow(`${kind}-sound`, "Notification sound", "Play a sound for new activity", true)}
        ${buildToggleRow(`${kind}-overlay`, "Show on overlay", "Display activity in the Fixture overlay", true)}
      </div>
      <div class="settings-modal__service-activity">
        <span class="settings-modal__service-section-label">Activity to show</span>
        ${activityControls}
      </div>
      <button class="settings-modal__service-save" type="button" data-service-save="${kind}">Save ${kind} settings</button>
    </section>
  `;
}

function buildProfilePanel(): string {
  return `
    <div class="settings-modal__panel-heading">Profile</div>
    <div class="settings-modal__field-group">
      <label class="settings-modal__label" for="sm-display-name">Display name</label>
      <input class="settings-modal__input" id="sm-display-name" type="text" placeholder="Your name" />
    </div>
    <div class="settings-modal__field-group">
      <label class="settings-modal__label" for="sm-organisation">Organisation</label>
      <input class="settings-modal__input" id="sm-organisation" type="text" placeholder="Your organisation" />
    </div>
    <div class="settings-modal__avatar" id="sm-avatar" aria-label="Avatar">
      <span class="settings-modal__avatar-initials" id="sm-avatar-initials">?</span>
    </div>
    <button class="settings-modal__save-btn" id="sm-profile-save">Save</button>
  `;
}

function buildConnectionsPanel(): string {
  const rows = CONNECTION_ROWS.map(r => buildConnectionRow(r, false, { ide: [], browser: [], email: [] })).join("");
  return `
    <div class="settings-modal__panel-heading">Connections</div>
    <div id="sm-conn-rows">${rows}</div>
  `;
}

function buildHotkeysPanel(): string {
  const rows = Object.entries(DEFAULT_HOTKEYS).map(([action, binding]) => `
    <div class="settings-modal__hotkey-row" data-action="${action}">
      <span class="settings-modal__hotkey-label">${action}</span>
      <kbd class="settings-modal__hotkey-key" data-binding="${binding}">${binding}</kbd>
      <button class="settings-modal__hotkey-edit">Edit</button>
    </div>
  `).join("");

  return `
    <div class="settings-modal__panel-heading">Hotkeys</div>
    <div class="settings-modal__hotkey-list">${rows}</div>
    <button class="settings-modal__save-btn" id="sm-hotkeys-save">Save</button>
  `;
}

function buildAppearancePanel(): string {
  const swatches = Array.from({ length: SWATCH_COUNT }, (_, i) => {
    const varName = `--sm-swatch-${i + 1}`;
    return `<button class="settings-modal__swatch" data-color-var="${varName}" style="background-color:var(${varName})" aria-label="Accent colour ${i + 1}"></button>`;
  }).join("");

  return `
    <div class="settings-modal__panel-heading">Appearance</div>
    <div class="settings-modal__field-group">
      <span class="settings-modal__label">Theme</span>
      <div class="settings-modal__radio-group" id="sm-theme">
        <button class="settings-modal__radio-pill" data-value="system">System</button>
        <button class="settings-modal__radio-pill" data-value="dark">Dark</button>
        <button class="settings-modal__radio-pill" data-value="light">Light</button>
      </div>
    </div>
    <div class="settings-modal__field-group">
      <label class="settings-modal__label" for="sm-opacity">Opacity <span id="sm-opacity-value">100</span>%</label>
      <input class="settings-modal__slider" id="sm-opacity" type="range" min="20" max="100" value="100" />
    </div>
    <div class="settings-modal__field-group">
      <span class="settings-modal__label">Font size</span>
      <div class="settings-modal__radio-group" id="sm-font-size">
        <button class="settings-modal__radio-pill" data-value="small">Small</button>
        <button class="settings-modal__radio-pill settings-modal__radio-pill--active" data-value="default">Default</button>
        <button class="settings-modal__radio-pill" data-value="large">Large</button>
      </div>
    </div>
    <div class="settings-modal__field-group">
      <span class="settings-modal__label">Accent colour</span>
      <div class="settings-modal__swatches">${swatches}</div>
      <input class="settings-modal__input settings-modal__input--hex" id="sm-accent-hex" type="text" placeholder="#64b6ac" maxlength="7" />
    </div>
    <div class="settings-modal__divider"></div>
    <div class="settings-modal__panel-subheading">Overlay Behavior</div>
    ${buildToggleRow("sm-overlay-toolbar", "Always show toolbar", "Keep titlebar visible in overlay mode", false)}
    ${buildToggleRow("sm-overlay-autohide-idle", "Auto-hide when idle", "Dim or hide overlay when cursor is away", false)}
    ${buildToggleRow("sm-overlay-autohide-empty", "Auto-hide when empty", "Collapse overlay when no notifications are pending", false)}
    <button class="settings-modal__save-btn" id="sm-appearance-save">Save</button>
  `;
}

function buildToggleRow(id: string, label: string, sublabel: string, checked: boolean): string {
  const checkedAttr = checked ? " checked" : "";
  return `
    <div class="settings-modal__toggle-row">
      <div class="settings-modal__toggle-body">
        <span class="settings-modal__toggle-label">${label}</span>
        <span class="settings-modal__toggle-sublabel">${sublabel}</span>
      </div>
      <label class="settings-modal__toggle" aria-label="${label}">
        <input type="checkbox" class="settings-modal__toggle-input" id="${id}"${checkedAttr} />
        <span class="settings-modal__toggle-track"></span>
      </label>
    </div>
  `;
}

function buildNotificationsPanel(): string {
  return `
    <div class="settings-modal__panel-heading">Notifications</div>
    ${buildToggleRow("sm-notif-mute",     "Global mute",       "Silence all notifications",                 false)}
    ${buildToggleRow("sm-notif-sound",    "Notification sounds", "Play audio chime when receiving updates",  true)}
    <div class="settings-modal__sound-preview-row">
      <button type="button" class="settings-modal__test-btn" id="sm-test-sound">Preview Sound</button>
    </div>
    <div class="settings-modal__divider"></div>
    ${buildToggleRow("sm-notif-mentions", "Mentions",          "When someone mentions you",                 true)}
    ${buildToggleRow("sm-notif-dms",      "Direct messages",   "All incoming DMs",                          true)}
    ${buildToggleRow("sm-notif-channel",  "Channel activity",  "New messages in watched channels",          false)}
    ${buildToggleRow("sm-notif-issues",   "Issue updates",     "Jira status changes and assignments",       true)}
    ${buildToggleRow("sm-notif-agent",    "Agent responses",   "Replies from connected AI / API agents",    true)}
    <button class="settings-modal__save-btn" id="sm-notifications-save">Save</button>
  `;
}

function buildModal(): string {
  const tabs: { tab: SettingsTab; label: string }[] = [
    { tab: "profile",      label: "Profile"       },
    { tab: "connections",  label: "Connections"   },
    { tab: "hotkeys",      label: "Hotkeys"       },
    { tab: "appearance",   label: "Appearance"    },
    { tab: "notifications",label: "Notifications" },
  ];

  const tabButtons = tabs.map(({ tab, label }) =>
    `<button class="settings-modal__tab" data-tab="${tab}" aria-selected="false">${label}</button>`
  ).join("");

  const panels = [
    { tab: "profile",       html: buildProfilePanel()       },
    { tab: "connections",   html: buildConnectionsPanel()   },
    { tab: "hotkeys",       html: buildHotkeysPanel()       },
    { tab: "appearance",    html: buildAppearancePanel()    },
    { tab: "notifications", html: buildNotificationsPanel() },
  ].map(({ tab, html }) =>
    `<div class="settings-modal__panel settings-modal__panel--hidden" data-panel="${tab}">${html}</div>`
  ).join("");

  return `
    <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="settings-modal__backdrop"></div>
      <div class="settings-modal__shell">
        <nav class="settings-modal__nav">
          <span class="settings-modal__nav-heading">Settings</span>
          ${tabButtons}
          <button class="settings-modal__close" aria-label="Close settings"><span class="settings-modal__close-icon" aria-hidden="true">${closeIcon}</span></button>
        </nav>
        <div class="settings-modal__content">${panels}</div>
      </div>
    </div>
  `;
}

function switchTab(modal: HTMLElement, tab: SettingsTab): void {
  cancelHotkeyCapture();
  modal.querySelectorAll<HTMLButtonElement>(".settings-modal__tab").forEach(btn => {
    const active = btn.dataset["tab"] === tab;
    btn.classList.toggle("settings-modal__tab--active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  modal.querySelectorAll<HTMLElement>(".settings-modal__panel").forEach(panel => {
    panel.classList.toggle("settings-modal__panel--hidden", panel.dataset["panel"] !== tab);
  });

  loadPanelData(modal, tab);
}

async function loadPanelData(modal: HTMLElement, tab: SettingsTab): Promise<void> {
  if (tab === "profile") {
    const data = await invoke<ProfileConfig>("get_profile").catch(() => ({
      displayName: "", organisation: "",
    }));
    const nameInput = requireElement<HTMLInputElement>(modal, "#sm-display-name");
    const orgInput  = requireElement<HTMLInputElement>(modal, "#sm-organisation");
    const initials  = requireElement<HTMLElement>(modal, "#sm-avatar-initials");
    nameInput.value = data.displayName;
    orgInput.value = data.organisation;
    initials.textContent = data.displayName.slice(0, 2).toUpperCase() || "?";
  }

  if (tab === "connections") {
    const [states, discoveredApps, serviceConfigs] = await Promise.all([
      invoke<ConnectionMap>("get_connection_states").catch(() => ({} as ConnectionMap)),
      loadDiscoveredApps(),
      Promise.all(["discord", "slack", "jira"].map(kind =>
        invoke<ServiceNotificationConfig>("get_service_notification_settings", { kind })
          .catch(() => ({ ...DEFAULT_SERVICE_NOTIFICATION_CONFIG }))
      )),
    ]);

    const rowsContainer = requireElement<HTMLElement>(modal, "#sm-conn-rows");
    rowsContainer.innerHTML = CONNECTION_ROWS.map(r =>
      buildConnectionRow(r, !!states[r.kind], discoveredApps)
    ).join("");
    wireAppIconDropdowns(modal);
    ["discord", "slack", "jira"].forEach((kind, index) => {
      const settings = requireElement<HTMLElement>(rowsContainer, `[data-service-settings="${kind}"]`);
      applyServiceNotificationConfig(settings, serviceConfigs[index]);
    });

    wireConnectionButtons(modal);
    wireServiceSettings(modal);
    modal.querySelectorAll<HTMLButtonElement>("[data-provider-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const settings = requireElement<HTMLElement>(modal, ".settings-modal__provider-settings");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        settings.setAttribute("aria-hidden", String(expanded));
      });
    });
    wireProviderForms(modal);
  }

  if (tab === "hotkeys") {
    const bindings = await invoke<HotkeyMap>("get_hotkeys").catch(() => ({ ...DEFAULT_HOTKEYS }));
    modal.querySelectorAll<HTMLElement>(".settings-modal__hotkey-row").forEach(row => {
      const action  = row.dataset["action"] ?? "";
      const binding = bindings[action] ?? DEFAULT_HOTKEYS[action] ?? "";
      const key     = requireElement<HTMLElement>(row, ".settings-modal__hotkey-key");
      key.textContent = binding;
      key.dataset["binding"] = binding;
    });
  }

  if (tab === "appearance") {
    const cfg = await invoke<AppearanceConfig>("get_appearance").catch(() => ({
      theme: "system" as const, opacity: 100, fontSize: "default" as const, accentColor: "#64b6ac",
    }));

    modal.querySelectorAll<HTMLButtonElement>("#sm-theme .settings-modal__radio-pill").forEach(pill => {
      pill.classList.toggle("settings-modal__radio-pill--active", pill.dataset["value"] === cfg.theme);
    });
    document.documentElement.dataset["theme"] = cfg.theme;

    const opacityInput = requireElement<HTMLInputElement>(modal, "#sm-opacity");
    const opacityLabel = requireElement<HTMLElement>(modal, "#sm-opacity-value");
    opacityInput.value = String(cfg.opacity);
    opacityLabel.textContent = String(cfg.opacity);

    modal.querySelectorAll<HTMLButtonElement>("#sm-font-size .settings-modal__radio-pill").forEach(pill => {
      pill.classList.toggle("settings-modal__radio-pill--active", pill.dataset["value"] === cfg.fontSize);
    });

    const hexInput = requireElement<HTMLInputElement>(modal, "#sm-accent-hex");
    hexInput.value = cfg.accentColor;

    const appSettings = await invoke<{
      autoHideWhenIdle: boolean;
      autoHideWhenEmpty: boolean;
      alwaysShowToolbar: boolean;
    }>("get_app_settings").catch(() => ({
      autoHideWhenIdle: false,
      autoHideWhenEmpty: false,
      alwaysShowToolbar: false,
    }));

    const tbInput = modal.querySelector<HTMLInputElement>("#sm-overlay-toolbar");
    if (tbInput) tbInput.checked = appSettings.alwaysShowToolbar;

    const idleInput = modal.querySelector<HTMLInputElement>("#sm-overlay-autohide-idle");
    if (idleInput) idleInput.checked = appSettings.autoHideWhenIdle;

    const emptyInput = modal.querySelector<HTMLInputElement>("#sm-overlay-autohide-empty");
    if (emptyInput) emptyInput.checked = appSettings.autoHideWhenEmpty;
  }

  if (tab === "notifications") {
    const cfg = await invoke<NotificationConfig>("get_notifications").catch(() => ({
      globalMute: false, mentions: true, dms: true,
      channelActivity: false, issueUpdates: true, agentResponses: true,
    }));
    const map: Record<string, boolean> = {
      "sm-notif-mute": cfg.globalMute, "sm-notif-mentions": cfg.mentions,
      "sm-notif-dms": cfg.dms, "sm-notif-channel": cfg.channelActivity,
      "sm-notif-issues": cfg.issueUpdates, "sm-notif-agent": cfg.agentResponses,
    };
    Object.entries(map).forEach(([id, checked]) => {
      const el = modal.querySelector<HTMLInputElement>(`#${id}`);
      if (el) el.checked = checked;
    });

    const appSettings = await invoke<{ soundEnabled: boolean }>("get_app_settings").catch(() => ({ soundEnabled: true }));
    const soundInput = modal.querySelector<HTMLInputElement>("#sm-notif-sound");
    if (soundInput) soundInput.checked = appSettings.soundEnabled;

    const testSoundBtn = modal.querySelector<HTMLButtonElement>("#sm-test-sound");
    testSoundBtn?.addEventListener("click", () => {
      void playNotificationChime();
    });
  }
  }

}

function wireConnectionButtons(modal: HTMLElement): void {
  modal.querySelectorAll<HTMLButtonElement>(".settings-modal__conn-action").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.hasAttribute("data-provider-toggle")) return;
      const kind      = btn.dataset["kind"]      ?? "";
      const connected = btn.dataset["connected"] === "true";
      if (connected) {
        invoke("disconnect_service", { kind }).catch(() => {});
      } else {
        invoke("open_connection_flow", { kind }).catch(() => {});
      }
    });
  });

}

function applyServiceNotificationConfig(settings: HTMLElement, config: ServiceNotificationConfig): void {
  const kind = settings.dataset["serviceSettings"] ?? "";
  const poll = requireElement<HTMLSelectElement>(settings, `[data-service-poll="${kind}"]`);
  poll.value = config.intervalSeconds > 0 ? String(config.intervalSeconds) : "null";
  const values: Record<string, boolean> = {
    [`${kind}-sound`]: config.playSound,
    [`${kind}-overlay`]: config.showOnOverlay,
    [`${kind}-mentions`]: config.mentions,
    [`${kind}-dms`]: config.directMessages,
    [`${kind}-channels`]: config.channelActivity,
    [`${kind}-issue-updates`]: config.issueUpdates,
    [`${kind}-assignments`]: config.assignments,
  };
  Object.entries(values).forEach(([id, checked]) => {
    const input = settings.querySelector<HTMLInputElement>(`#${id}`);
    if (input) input.checked = checked;
  });
}

function readServiceNotificationConfig(settings: HTMLElement): ServiceNotificationConfig {
  const kind = settings.dataset["serviceSettings"] ?? "";
  const checked = (name: string, fallback: boolean): boolean =>
    settings.querySelector<HTMLInputElement>(`#${kind}-${name}`)?.checked ?? fallback;
  const pollValue = requireElement<HTMLSelectElement>(settings, `[data-service-poll="${kind}"]`).value;
  return {
    intervalSeconds: pollValue === "null" ? 0 : Number(pollValue),
    playSound: checked("sound", true),
    showOnOverlay: checked("overlay", true),
    mentions: checked("mentions", true),
    directMessages: checked("dms", true),
    channelActivity: checked("channels", false),
    issueUpdates: checked("issue-updates", true),
    assignments: checked("assignments", true),
  };
}

function wireServiceSettings(modal: HTMLElement): void {
  modal.querySelectorAll<HTMLButtonElement>("[data-service-save]").forEach(button => {
    button.addEventListener("click", () => {
      const kind = button.dataset["serviceSave"] ?? "";
      const settings = requireElement<HTMLElement>(modal, `[data-service-settings="${kind}"]`);
      invoke("save_service_notification_settings", {
        kind,
        settings: readServiceNotificationConfig(settings),
      }).catch(() => {});
    });
  });
}

function wireHotkeyEditing(modal: HTMLElement): void {
  modal.querySelectorAll<HTMLButtonElement>(".settings-modal__hotkey-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      cancelHotkeyCapture();
      const row = btn.closest<HTMLElement>(".settings-modal__hotkey-row");
      if (!row) throw new Error("Required settings modal element not found: .settings-modal__hotkey-row");
      const key = requireElement<HTMLElement>(row, ".settings-modal__hotkey-key");

      key.textContent = "Press a key…";
      key.classList.add("settings-modal__hotkey-key--capturing");

      const onKeyDown = (e: KeyboardEvent): void => {
        e.preventDefault();
        const parts: string[] = [];
        if (e.ctrlKey)  parts.push("Ctrl");
        if (e.altKey)   parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey)  parts.push("Meta");
        const keyLabel = e.key.length === 1 ? e.key.toUpperCase() : e.key;
        if (!["Control","Alt","Shift","Meta"].includes(e.key)) parts.push(keyLabel);

        const binding = parts.join("+");
        key.textContent = binding;
        key.dataset["binding"] = binding;
        key.classList.remove("settings-modal__hotkey-key--capturing");
        document.removeEventListener("keydown", onKeyDown, true);
        hotkeyCapture = null;
      };

      hotkeyCapture = { listener: onKeyDown, key };
      document.addEventListener("keydown", onKeyDown, true);
    });
  });
}

function wireAppearanceControls(modal: HTMLElement): void {
  modal.querySelectorAll<HTMLButtonElement>("#sm-theme .settings-modal__radio-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      modal.querySelectorAll("#sm-theme .settings-modal__radio-pill")
        .forEach(p => p.classList.remove("settings-modal__radio-pill--active"));
      pill.classList.add("settings-modal__radio-pill--active");
    });
  });

  modal.querySelectorAll<HTMLButtonElement>("#sm-font-size .settings-modal__radio-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      modal.querySelectorAll("#sm-font-size .settings-modal__radio-pill")
        .forEach(p => p.classList.remove("settings-modal__radio-pill--active"));
      pill.classList.add("settings-modal__radio-pill--active");
    });
  });

  const opacityInput = requireElement<HTMLInputElement>(modal, "#sm-opacity");
  const opacityLabel = requireElement<HTMLElement>(modal, "#sm-opacity-value");
  opacityInput.addEventListener("input", () => {
    opacityLabel.textContent = opacityInput.value;
  });

  modal.querySelectorAll<HTMLButtonElement>(".settings-modal__swatch").forEach(swatch => {
    swatch.addEventListener("click", () => {
      const colorVar = swatch.dataset["colorVar"] ?? "";
      const color    = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
      const hexInput = requireElement<HTMLInputElement>(modal, "#sm-accent-hex");
      hexInput.value = color;
    });
  });
}

function wireSaveButtons(modal: HTMLElement): void {
  requireElement<HTMLButtonElement>(modal, "#sm-profile-save").addEventListener("click", () => {
    const displayName  = requireElement<HTMLInputElement>(modal, "#sm-display-name").value;
    const organisation = requireElement<HTMLInputElement>(modal, "#sm-organisation").value;
    invoke("save_profile", { displayName, organisation }).catch(() => {});
    const initials = requireElement<HTMLElement>(modal, "#sm-avatar-initials");
    initials.textContent = displayName.slice(0, 2).toUpperCase() || "?";
  });

  requireElement<HTMLButtonElement>(modal, "#sm-hotkeys-save").addEventListener("click", () => {
    const bindings: HotkeyMap = {};
    modal.querySelectorAll<HTMLElement>(".settings-modal__hotkey-row").forEach(row => {
      const action  = row.dataset["action"] ?? "";
      const binding = requireElement<HTMLElement>(row, ".settings-modal__hotkey-key").dataset["binding"];
      bindings[action] = binding;
    });
    invoke("save_hotkeys", { bindings }).catch(() => {});
  });

  requireElement<HTMLButtonElement>(modal, "#sm-appearance-save").addEventListener("click", () => {
    const theme = requireElement<HTMLButtonElement>(modal, "#sm-theme .settings-modal__radio-pill--active")
      .dataset["value"] as AppearanceConfig["theme"];
    const opacity    = Number(requireElement<HTMLInputElement>(modal, "#sm-opacity").value);
    const fontSize   = requireElement<HTMLButtonElement>(modal, "#sm-font-size .settings-modal__radio-pill--active")
      .dataset["value"] as AppearanceConfig["fontSize"];
    const accentColor = requireElement<HTMLInputElement>(modal, "#sm-accent-hex").value;
    document.documentElement.dataset["theme"] = theme;
    invoke("save_appearance", { theme, opacity, fontSize, accentColor }).catch(() => {});

    const alwaysShowToolbar = modal.querySelector<HTMLInputElement>("#sm-overlay-toolbar")?.checked ?? false;
    const autoHideWhenIdle = modal.querySelector<HTMLInputElement>("#sm-overlay-autohide-idle")?.checked ?? false;
    const autoHideWhenEmpty = modal.querySelector<HTMLInputElement>("#sm-overlay-autohide-empty")?.checked ?? false;
    invoke<AppSettingsPayload>("get_app_settings")
      .then(curr => {
        invoke("save_app_settings", {
          settings: {
            ...curr,
            alwaysShowToolbar,
            autoHideWhenIdle,
            autoHideWhenEmpty,
          },
        }).catch(() => {});
      })
      .catch(() => {});
  });

  requireElement<HTMLButtonElement>(modal, "#sm-notifications-save").addEventListener("click", () => {
    const get = (id: string): boolean =>
      requireElement<HTMLInputElement>(modal, `#${id}`).checked;
    invoke("save_notifications", {
      globalMute: get("sm-notif-mute"), mentions: get("sm-notif-mentions"),
      dms: get("sm-notif-dms"), channelActivity: get("sm-notif-channel"),
      issueUpdates: get("sm-notif-issues"), agentResponses: get("sm-notif-agent"),
    }).catch(() => {});

    const soundEnabled = modal.querySelector<HTMLInputElement>("#sm-notif-sound")?.checked ?? true;
    invoke<AppSettingsPayload>("get_app_settings")
      .then(curr => {
        invoke("save_app_settings", {
          settings: {
            ...curr,
            soundEnabled,
          },
        }).catch(() => {});
      })
      .catch(() => {});
  });

}

function closeSettingsModal(): void {
  cancelHotkeyCapture();
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
  if (escListener) {
    document.removeEventListener("keydown", escListener);
    escListener = null;
  }
}

// ==============================================================================
// Export
// ==============================================================================
export function openSettingsModal(tab: SettingsTab = "profile"): void {
  const root = document.getElementById("modal-root");
  if (!root) return;

  // If already open, just switch tabs
  const existing = root.querySelector<HTMLElement>(".settings-modal");
  if (existing) {
    switchTab(existing, tab);
    return;
  }

  root.innerHTML = buildModal();
  const modal = requireElement<HTMLElement>(root, ".settings-modal");

  // Activate the requested tab
  switchTab(modal, tab);

  // Wire close paths
  const closeBtn = requireElement<HTMLButtonElement>(modal, ".settings-modal__close");
  const backdrop = requireElement<HTMLElement>(modal, ".settings-modal__backdrop");

  closeBtn.addEventListener("click", closeSettingsModal);
  backdrop.addEventListener("click", closeSettingsModal);

  escListener = (e: KeyboardEvent) => { if (e.key === "Escape") closeSettingsModal(); };
  document.addEventListener("keydown", escListener);

  // Wire tab buttons
  modal.querySelectorAll<HTMLButtonElement>(".settings-modal__tab").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(modal, btn.dataset["tab"] as SettingsTab);
    });
  });

  // Wire interactive panel controls
  wireHotkeyEditing(modal);
  wireAppearanceControls(modal);
  wireSaveButtons(modal);
}
