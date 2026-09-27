// ==============================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";

import fixtureIcon from "../assets/icons/Fixture.svg?raw";
import layoutIcon  from "../assets/icons/Layout.svg?raw";
import maximizeIcon from "../assets/icons/Maximize.svg?raw";
import closeIcon   from "../assets/icons/Close.svg?raw";
import caretIcon   from "../assets/icons/Caret.svg?raw";

import { mountDashboard } from "./Dashboard";
import { mountTitlebar }  from "./Titlebar";
import "../styles/Overlay.css";

// ==============================================================================
// Types
// ==============================================================================
export type OverlayVariant = "floating-hud" | "mini-pill" | "docked-sidebar";

interface FeedItem {
  serviceKind: string;
  actor: string;
  description: string;
  timestamp: number;
}

// ==============================================================================
// Functions
// ==============================================================================

function buildFeedCards(items: FeedItem[]): string {
  if (items.length === 0) {
    return `<div class="overlay-hud__empty">No active notifications</div>`;
  }

  return items.map(item => `
    <div class="overlay-hud__card">
      <div class="overlay-hud__card-row">
        <span class="overlay-hud__card-actor">${item.actor}</span>
        <span class="overlay-hud__card-time">${formatRelativeTime(item.timestamp)}</span>
      </div>
      <span class="overlay-hud__card-desc">${item.description}</span>
    </div>
  `).join("");
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function buildHudView(items: FeedItem[]): string {
  return `
    <div class="overlay-hud">
      <header class="overlay-hud__header">
        <div class="overlay-hud__drag-handle">
          <span class="overlay-hud__logo">${fixtureIcon}</span>
          <span class="overlay-hud__title">Fixture</span>
          <span class="overlay-hud__badge">HUD</span>
        </div>
        <div class="overlay-hud__actions">
          <button class="overlay-hud__btn" id="hud-pill" title="Switch to Mini-Pill">${layoutIcon}</button>
          <button class="overlay-hud__btn" id="hud-restore" title="Restore Dashboard">${maximizeIcon}</button>
          <button class="overlay-hud__btn" id="hud-minimize" title="Minimize to Tray">${closeIcon}</button>
        </div>
      </header>

      <main class="overlay-hud__body">
        <div class="overlay-hud__stream" id="hud-stream">
          ${buildFeedCards(items)}
        </div>
      </main>

      <footer class="overlay-hud__footer">
        <button class="overlay-hud__quick" data-action="vscode">Code</button>
        <button class="overlay-hud__quick" data-action="email">Mail</button>
        <button class="overlay-hud__quick" data-action="slack">Slack</button>
      </footer>
    </div>
  `;
}

function buildPillView(count: number): string {
  return `
    <div class="overlay-pill">
      <div class="overlay-pill__lead">
        <span class="overlay-pill__dot"></span>
        <span class="overlay-pill__icon">${fixtureIcon}</span>
        <span class="overlay-pill__count">${count}</span>
      </div>
      <div class="overlay-pill__actions">
        <button class="overlay-pill__btn" id="pill-expand" title="Expand to HUD">${caretIcon}</button>
        <button class="overlay-pill__btn" id="pill-restore" title="Restore Dashboard">${maximizeIcon}</button>
      </div>
    </div>
  `;
}

function wireHudActions(container: HTMLElement): void {
  const pillBtn = container.querySelector<HTMLButtonElement>("#hud-pill");
  const restoreBtn = container.querySelector<HTMLButtonElement>("#hud-restore");
  const minBtn = container.querySelector<HTMLButtonElement>("#hud-minimize");

  pillBtn?.addEventListener("click", () => {
    mountOverlay(container, "mini-pill");
  });

  restoreBtn?.addEventListener("click", () => {
    restoreToDesktop(container);
  });

  minBtn?.addEventListener("click", () => {
    invoke("minimize_to_tray").catch(() => {});
  });

  container.querySelectorAll<HTMLButtonElement>(".overlay-hud__quick").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset["action"] ?? "vscode";
      invoke("launch_app_context", {
        target,
        payload: { target },
      }).catch(() => {});
    });
  });
}

function wirePillActions(container: HTMLElement): void {
  const expandBtn = container.querySelector<HTMLButtonElement>("#pill-expand");
  const restoreBtn = container.querySelector<HTMLButtonElement>("#pill-restore");

  expandBtn?.addEventListener("click", () => {
    mountOverlay(container, "floating-hud");
  });

  restoreBtn?.addEventListener("click", () => {
    restoreToDesktop(container);
  });
}

interface AppSettings {
  autoHideWhenIdle: boolean;
  autoHideWhenEmpty: boolean;
  alwaysShowToolbar: boolean;
  soundEnabled: boolean;
}

let idleTimer: number | null = null;

function setupProximityAutoHide(cardElement: HTMLElement, autoHideWhenIdle: boolean): void {
  if (!autoHideWhenIdle) return;

  const resetIdle = () => {
    cardElement.classList.remove("overlay-hud--dimmed", "overlay-pill--dimmed");
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      cardElement.classList.add("overlay-hud--dimmed", "overlay-pill--dimmed");
    }, 3000);
  };

  cardElement.addEventListener("mouseenter", resetIdle);
  cardElement.addEventListener("mousemove", resetIdle);
  cardElement.addEventListener("mouseleave", () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      cardElement.classList.add("overlay-hud--dimmed", "overlay-pill--dimmed");
    }, 1000);
  });

  resetIdle();
}

// Restores application window from overlay mode back to full desktop Dashboard
export async function restoreToDesktop(container: HTMLElement): Promise<void> {
  if (idleTimer) window.clearTimeout(idleTimer);
  await invoke("stop_overlay").catch(() => {});

  const titlebar = document.getElementById("titlebar");
  if (titlebar) {
    titlebar.style.display = "";
    mountTitlebar(titlebar);
  }

  const content = document.getElementById("content") ?? container;
  mountDashboard(content);
}

// ==============================================================================
// Mount
// ==============================================================================

// Mounts the active overlay variant into the target container
export async function mountOverlay(
  container: HTMLElement,
  variant: OverlayVariant = "floating-hud",
): Promise<void> {
  await invoke("start_overlay", { variant }).catch(() => {});

  const settings = await invoke<AppSettings>("get_app_settings").catch(() => ({
    autoHideWhenIdle: false,
    autoHideWhenEmpty: false,
    alwaysShowToolbar: false,
    soundEnabled: true,
  }));

  const titlebar = document.getElementById("titlebar");
  if (titlebar) {
    titlebar.style.display = settings.alwaysShowToolbar ? "" : "none";
  }

  const items = await invoke<FeedItem[]>("get_activity_feed").catch(() => []);

  // If auto-hide on empty is enabled and there are no notifications, fall back to compact mini-pill
  const activeVariant = (settings.autoHideWhenEmpty && items.length === 0) ? "mini-pill" : variant;

  if (activeVariant === "mini-pill") {
    container.innerHTML = buildPillView(items.length);
    wirePillActions(container);
    const pill = container.querySelector<HTMLElement>(".overlay-pill");
    if (pill) setupProximityAutoHide(pill, settings.autoHideWhenIdle);
  } else {
    container.innerHTML = buildHudView(items);
    wireHudActions(container);
    const hud = container.querySelector<HTMLElement>(".overlay-hud");
    if (hud) setupProximityAutoHide(hud, settings.autoHideWhenIdle);
  }
}
