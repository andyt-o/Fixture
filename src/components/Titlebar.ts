// ==============================================================================
// Imports
// ==============================================================================
import { listen }           from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke }           from "@tauri-apps/api/core";

import { openSettingsModal } from "./SettingsModal";
import { mountOnboarding } from "./Onboarding";
import { mountOverlay }    from "./OverlayController";

import minimizeIcon   from "../assets/icons/Minimize.svg?raw";
import maximizeIcon   from "../assets/icons/Maximize.svg?raw";
import closeIcon      from "../assets/icons/Close.svg?raw";
import logoIcon       from "../assets/icons/Fixture.svg?raw";
import soundOnIcon    from "../assets/icons/SoundToggled.svg?raw";
import soundOffIcon   from "../assets/icons/SoundMuted.svg?raw";
import layoutIcon     from "../assets/icons/Layout.svg?raw";
import powerIcon      from "../assets/icons/Power.svg?raw";
import settingsIcon   from "../assets/icons/Settings.svg?raw";

import "../styles/Titlebar.css";

// ==============================================================================
// Types
// ==============================================================================
const enum ConnectionStatus {
  Online   = "online",
  Degraded = "degraded",
  Offline  = "offline",
}

// ==============================================================================
// Constants
// ==============================================================================
const SETTINGS_TAB_MAP: Record<string, Parameters<typeof openSettingsModal>[0]> = {
  "Profile":        "profile",
  "Connections":    "connections",
  "Hotkeys":        "hotkeys",
  "Appearance":     "appearance",
  "Notifications":  "notifications",
};

const MENUS: { label: string; items: string[] }[] = [
  {
    label: "Settings",
    items: [
      "Profile",
      "Connections",
      "Hotkeys",
      "Appearance",
      "Notifications",
    ],
  },
  {
    label: "View",
    items: [
      "Floating HUD",
      "Docked Sidebar",
      "Mini-Pill",
      "Click-Through",
      "Opacity",
    ],
  },
  {
    label: "Help",
    items: [
      "Documentation",
      "Keyboard Shortcuts",
      "Privacy Notice",
      "About",
      "Check for Updates",
    ],
  },
];

// ==============================================================================
// Functions
// ==============================================================================
function showMenuBackdrop(): void {
  if (document.getElementById("menu-backdrop")) return;
  const el = document.createElement("div");
  el.id = "menu-backdrop";
  el.className = "titlebar__backdrop";
  document.body.appendChild(el);
}

function hideMenuBackdrop(): void {
  document.getElementById("menu-backdrop")?.remove();
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required titlebar element not found: ${selector}`);
  return element;
}

function buildMenuBar(): string {
  const menus = MENUS.map(({ label, items }) => {
    const dropdownItems = items
      .map(item => `<button class="titlebar__dropdown-item">${item}</button>`)
      .join("");

    return `
      <div class="titlebar__menu">
        <button class="titlebar__menu-btn">${label}</button>
        <div class="titlebar__dropdown">${dropdownItems}</div>
      </div>
    `;
  }).join("");

  return `<div class="titlebar__menubar">${menus}</div>`;
}

function buildIconButtons(): string {
  return `
    <div class="titlebar__icons" aria-label="Quick actions">
      <button class="titlebar__icon-btn" id="tb-settings" aria-label="Open connections settings"><span class="titlebar__button-icon" aria-hidden="true">${settingsIcon}</span></button>
      <span   class="titlebar__status status--offline" id="tb-status"  aria-label="Connection status"></span>
      <button class="titlebar__icon-btn" id="tb-mute"    aria-label="Mute notifications"><span class="titlebar__button-icon" aria-hidden="true">${soundOnIcon}</span></button>
      <button class="titlebar__icon-btn" id="tb-variant" aria-label="Active overlay variant"><span class="titlebar__button-icon" aria-hidden="true">${layoutIcon}</span></button>
      <button class="titlebar__icon-btn" id="tb-launch"  aria-label="Launch overlay"><span class="titlebar__button-icon" aria-hidden="true">${powerIcon}</span></button>
    </div>
  `;
}

function wireMuteToggle(container: HTMLElement): void {
  const btn = requireElement<HTMLButtonElement>(container, "#tb-mute");
  let muted = false;

  btn.addEventListener("click", () => {
    muted = !muted;
    requireElement<HTMLElement>(btn, ".titlebar__button-icon").innerHTML = muted ? soundOffIcon : soundOnIcon;
    btn.setAttribute("aria-label", muted ? "Unmute notifications" : "Mute notifications");
  });
}

function wireTitlebarCog(container: HTMLElement): void {
  container.querySelector<HTMLButtonElement>("#tb-settings")
    ?.addEventListener("click", () => openSettingsModal("connections"));
}

function wireMenuBar(container: HTMLElement): void {
  const menus = container.querySelectorAll<HTMLElement>(".titlebar__menu");

  menus.forEach(menu => {
    const btn      = requireElement<HTMLButtonElement>(menu, ".titlebar__menu-btn");
    const dropdown = requireElement<HTMLElement>(menu, ".titlebar__dropdown");
    const menuLabel = btn.textContent?.trim() ?? "";

    btn.addEventListener("click", e => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("titlebar__menu--open");
      menus.forEach(m => m.classList.remove("titlebar__menu--open"));
      hideMenuBackdrop();
      if (!isOpen) {
        const rect = btn.getBoundingClientRect();
        dropdown.style.left = `${rect.left}px`;
        menu.classList.add("titlebar__menu--open");
        showMenuBackdrop();
      }
    });

    dropdown.querySelectorAll<HTMLButtonElement>(".titlebar__dropdown-item").forEach(item => {
      item.addEventListener("click", () => {
        const itemLabel = item.textContent?.trim() ?? "";

        if (menuLabel === "Settings" && SETTINGS_TAB_MAP[itemLabel]) {
          openSettingsModal(SETTINGS_TAB_MAP[itemLabel]);
        } else if (menuLabel === "View") {
          invoke("open_view_mode", { mode: itemLabel }).catch(() => {});
        } else if (menuLabel === "Help") {
          invoke("open_help_section", { section: itemLabel }).catch(() => {});
        }

        menus.forEach(m => m.classList.remove("titlebar__menu--open"));
        hideMenuBackdrop();
      });
    });
  });

  document.addEventListener("mousedown", e => {
    const menubar = requireElement<HTMLElement>(container, ".titlebar__menubar");
    if (!menubar.contains(e.target as Node)) {
      menus.forEach(m => m.classList.remove("titlebar__menu--open"));
      hideMenuBackdrop();
    }
  });
}

function wireStatusDot(): void {
  const dot = requireElement<HTMLElement>(document, "#tb-status");

  listen<ConnectionStatus>("connection-status", ({ payload }) => {
    dot.className = `titlebar__status status--${payload}`;
  });
}

function wireWindowControls(container: HTMLElement): void {
  const appWindow = getCurrentWindow();

  requireElement<HTMLButtonElement>(container, ".titlebar__btn--minimize")
    .addEventListener("click", () => appWindow.minimize());

  requireElement<HTMLButtonElement>(container, ".titlebar__btn--maximize")
    .addEventListener("click", () => appWindow.toggleMaximize());

  requireElement<HTMLButtonElement>(container, ".titlebar__btn--close")
    .addEventListener("click", () => appWindow.close());
}

// ==============================================================================
// Mount
// ==============================================================================
export function mountTitlebar(container: HTMLElement): void {
  invoke<{ theme: "system" | "dark" | "light" }>("get_appearance")
    .then(config => { document.documentElement.dataset["theme"] = config.theme; })
    .catch(() => {});
  container.innerHTML = `
    <div class="titlebar">
      <button class="titlebar__logo" id="tb-home" aria-label="Return to onboarding"><span class="titlebar__logo-icon" aria-hidden="true">${logoIcon}</span></button>
      ${buildMenuBar()}
      ${buildIconButtons()}
      <div class="titlebar__controls">
        <button class="titlebar__btn titlebar__btn--minimize" aria-label="Minimize"><span class="titlebar__control-icon" aria-hidden="true">${minimizeIcon}</span></button>
        <button class="titlebar__btn titlebar__btn--maximize" aria-label="Maximize"><span class="titlebar__control-icon" aria-hidden="true">${maximizeIcon}</span></button>
        <button class="titlebar__btn titlebar__btn--close"    aria-label="Close"><span class="titlebar__control-icon" aria-hidden="true">${closeIcon}</span></button>
      </div>
    </div>
  `;

  wireMenuBar(container);
  requireElement<HTMLButtonElement>(container, "#tb-home").addEventListener("click", () => {
    const content = document.getElementById("content");
    if (!content) throw new Error("Required application content element not found: #content");
    mountOnboarding(content, true);
  });
  wireMuteToggle(container);
  wireTitlebarCog(container);
  requireElement<HTMLButtonElement>(container, "#tb-launch").addEventListener("click", () => {
    const content = document.getElementById("content");
    if (content) mountOverlay(content, "floating-hud");
  });
  requireElement<HTMLButtonElement>(container, "#tb-variant").addEventListener("click", () => {
    const content = document.getElementById("content");
    if (content) mountOverlay(content, "mini-pill");
  });
  wireWindowControls(container);
  wireStatusDot();
}
