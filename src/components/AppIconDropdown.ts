// ================================================================================
// Imports
// ==============================================================================
import { invoke } from "@tauri-apps/api/core";

// ================================================================================
// Types
// ==============================================================================
export type AppCategory = "ide" | "browser" | "email";

export interface DiscoveredApp {
  id: string;
  name: string;
  iconDataUri: string | null;
  isDefault: boolean;
}

export type DiscoveredApps = Record<AppCategory, DiscoveredApp[]>;

// ================================================================================
// Constants
// ==============================================================================
export const APP_CATEGORIES: AppCategory[] = ["ide", "browser", "email"];
const FILE_CHOOSER_LABEL = "Choose from File Explorer";

// ================================================================================
// Functions
// ==============================================================================
function escapeAttribute(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "\"": "&quot;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
  };
  return value.replace(/[&"<>']/g, char => replacements[char]);
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required app dropdown element not found: ${selector}`);
  return element;
}

function requireClosest<T extends Element>(element: Element, selector: string): T {
  const match = element.closest<T>(selector);
  if (!match) throw new Error(`Required app dropdown element not found: ${selector}`);
  return match;
}

export async function loadDiscoveredApps(): Promise<DiscoveredApps> {
  const entries = await Promise.all(APP_CATEGORIES.map(async category => {
    const apps = await invoke<DiscoveredApp[]>("get_installed_context_apps", { category }).catch(() => []);
    return [category, apps] as const;
  }));
  return Object.fromEntries(entries) as DiscoveredApps;
}

export function buildAppIconDropdown(category: AppCategory, apps: DiscoveredApp[], fallbackIcon: string): string {
  const selectedApp = apps.find(app => app.isDefault) ?? apps[0];
  const selectedImage = selectedApp?.iconDataUri
    ? `<img class="icon-dropdown__current-icon" src="${escapeAttribute(selectedApp.iconDataUri)}" alt="${escapeAttribute(selectedApp.name)}" />`
    : `<span class="icon-dropdown__fallback-icon">${fallbackIcon}</span>`;
  const options = apps.map(app => {
    const selectedClass = app.id === selectedApp?.id ? " icon-dropdown__item--selected" : "";
    const appIcon = app.iconDataUri
      ? `<img class="icon-dropdown__item-icon" src="${escapeAttribute(app.iconDataUri)}" alt="" />`
      : `<span class="icon-dropdown__fallback-icon">${fallbackIcon}</span>`;
    return `<button class="icon-dropdown__item${selectedClass}" data-app-id="${escapeAttribute(app.id)}" role="option" aria-label="${escapeAttribute(app.name)}" title="${escapeAttribute(app.name)}" aria-selected="${app.id === selectedApp?.id}">${appIcon}<span class="icon-dropdown__item-label">${escapeAttribute(app.name)}</span></button>`;
  }).join("");

  return `<div class="icon-dropdown" data-category="${category}" data-selected-app="${escapeAttribute(selectedApp?.id ?? "")}"><button class="icon-dropdown__trigger" aria-haspopup="listbox" aria-expanded="false" title="${selectedApp ? `Selected: ${escapeAttribute(selectedApp.name)}` : `Choose ${category} app`}" aria-label="${selectedApp ? `Selected: ${escapeAttribute(selectedApp.name)}` : `Choose ${category} app`}">${selectedImage}<span class="icon-dropdown__caret">⌄</span></button><div class="icon-dropdown__menu" role="listbox" aria-hidden="true">${options}<button class="icon-dropdown__browse" type="button" role="option" aria-selected="false"><span class="icon-dropdown__browse-icon" aria-hidden="true">📁</span><span class="icon-dropdown__browse-label">${FILE_CHOOSER_LABEL}</span></button><span class="icon-dropdown__fallback-template" hidden>${fallbackIcon}</span></div></div>`;
}

export function wireAppIconDropdowns(root: HTMLElement): void {
  if (root.dataset["appDropdownWired"] === "true") return;
  root.dataset["appDropdownWired"] = "true";

  root.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest<HTMLButtonElement>(".icon-dropdown__trigger");
    if (trigger) {
      const dropdown = requireClosest<HTMLElement>(trigger, ".icon-dropdown");
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      root.querySelectorAll<HTMLElement>(".icon-dropdown").forEach(item => {
        const itemTrigger = requireElement<HTMLButtonElement>(item, ".icon-dropdown__trigger");
        const itemMenu = requireElement<HTMLElement>(item, ".icon-dropdown__menu");
        const itemExpanded = item === dropdown && !expanded;
        itemTrigger.setAttribute("aria-expanded", String(itemExpanded));
        itemMenu.setAttribute("aria-hidden", String(!itemExpanded));
      });
      return;
    }

    const option = target.closest<HTMLButtonElement>(".icon-dropdown__item");
    if (option) {
      const dropdown = requireClosest<HTMLElement>(option, ".icon-dropdown");
      const trigger = requireElement<HTMLButtonElement>(dropdown, ".icon-dropdown__trigger");
      const category = dropdown.dataset["category"] as AppCategory;
      const appId = option.dataset["appId"];
      if (!appId) throw new Error("Selected app option is missing its app ID");
      const appName = option.title;
      const icon = option.querySelector<HTMLImageElement>(".icon-dropdown__item-icon");
      if (icon) {
        const currentImage = document.createElement("img");
        currentImage.className = "icon-dropdown__current-icon";
        currentImage.src = icon.src;
        currentImage.alt = appName;
        requireElement<HTMLElement>(trigger, ".icon-dropdown__current-icon, .icon-dropdown__fallback-icon").replaceWith(currentImage);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "icon-dropdown__fallback-icon";
        fallback.innerHTML = requireElement<HTMLElement>(dropdown, ".icon-dropdown__fallback-template").innerHTML;
        requireElement<HTMLElement>(trigger, ".icon-dropdown__current-icon, .icon-dropdown__fallback-icon").replaceWith(fallback);
      }
      updateSelectedLabel(trigger, appName);
      trigger.setAttribute("aria-expanded", "false");
      dropdown.dataset["selectedApp"] = appId;
      requireElement<HTMLElement>(dropdown, ".icon-dropdown__menu").setAttribute("aria-hidden", "true");
      dropdown.querySelectorAll<HTMLButtonElement>(".icon-dropdown__item").forEach(item => {
        const selected = item === option;
        item.classList.toggle("icon-dropdown__item--selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      invoke("set_selected_app", { category, appId }).catch(() => {});
      return;
    }

    const browse = target.closest<HTMLButtonElement>(".icon-dropdown__browse");
    if (browse) {
      const dropdown = requireClosest<HTMLElement>(browse, ".icon-dropdown");
      const trigger = requireElement<HTMLButtonElement>(dropdown, ".icon-dropdown__trigger");
      const category = dropdown.dataset["category"] as AppCategory;
      trigger.setAttribute("aria-expanded", "false");
      requireElement<HTMLElement>(dropdown, ".icon-dropdown__menu").setAttribute("aria-hidden", "true");
      void chooseApplicationFile(dropdown, trigger, category);
      return;
    }

    root.querySelectorAll<HTMLElement>(".icon-dropdown").forEach(dropdown => {
      requireElement<HTMLButtonElement>(dropdown, ".icon-dropdown__trigger").setAttribute("aria-expanded", "false");
      requireElement<HTMLElement>(dropdown, ".icon-dropdown__menu").setAttribute("aria-hidden", "true");
    });
  });

}

async function chooseApplicationFile(dropdown: HTMLElement, trigger: HTMLButtonElement, category: AppCategory): Promise<void> {
  try {
    const selectedPath = await invoke<string | null>("choose_application_file");
    if (!selectedPath) return;
    await invoke("set_selected_app", { category, appId: selectedPath });
    const appName = selectedPath.split(/[\\/]/).pop() ?? selectedPath;
    const apps = await invoke<DiscoveredApp[]>("get_installed_context_apps", { category });
    const selectedApp = apps.find(app => app.id === selectedPath);
    const selectedElement = selectedApp?.iconDataUri
      ? Object.assign(document.createElement("img"), {
          className: "icon-dropdown__current-icon",
          src: selectedApp.iconDataUri,
          alt: appName,
        })
      : Object.assign(document.createElement("span"), {
          className: "icon-dropdown__fallback-icon",
          innerHTML: requireElement<HTMLElement>(dropdown, ".icon-dropdown__fallback-template").innerHTML,
        });
    requireElement<HTMLElement>(trigger, ".icon-dropdown__current-icon, .icon-dropdown__fallback-icon").replaceWith(selectedElement);
    updateSelectedLabel(trigger, appName);
    dropdown.dataset["selectedApp"] = selectedPath;
  } catch {
    return;
  }
}

function updateSelectedLabel(trigger: HTMLButtonElement, appName: string): void {
  trigger.title = `Selected: ${appName}`;
  trigger.setAttribute("aria-label", `Selected: ${appName}`);
}
