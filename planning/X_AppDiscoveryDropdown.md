# App Discovery & Icon Dropdown Selection Plan

## Overview
This plan specifies the architecture and implementation for querying installed OS context applications (Code Editors, Mail Clients, Web Browsers) across Windows, macOS, and Linux. 

Instead of an OAuth flow or manual file path browsing, connections for **Code Editor**, **Email**, and **Browser** present an **Icon-Only Dropdown Menu** directly within both the onboarding connection cards and the Settings modal. The dropdown renders genuine native application icons extracted dynamically by the Rust backend, allowing users to seamlessly pick their preferred tool by visual recognition.

---

## Target Files to Affect

| File | Change Description |
|---|---|
| `src-tauri/src/launcher/AppDiscovery.rs` | New Rust module querying installed protocol/category handlers (Windows Registry, macOS LaunchServices, Linux MIME) and extracting PNG icons as Base64 Data URIs. |
| `src-tauri/src/launcher/mod.rs` | Exports `AppDiscovery` and `QuickLauncher`. |
| `src-tauri/src/commands/Commands.rs` | Adds Tauri IPC commands `get_installed_apps(category: String)` and `set_selected_app(category: String, app_id: String)`. |
| `src/components/Onboarding.ts` | Replaces the text action/OAuth trigger on `ide`, `email`, and `browser` cards with an inline icon-only dropdown selector. |
| `src/components/SettingsModal.ts` | Updates the Connections tab to display icon-only dropdown selectors for Code Editor, Email, and Browser rows. |
| `src/styles/Onboarding.css` | Adds styles for `.onboarding__icon-dropdown`, icon triggers, popup menu, and selected icon badges. |
| `src/styles/SettingsModal.css` | Adds matching styles for icon-only dropdown triggers within settings rows. |

---

## Cross-Platform Discovery & Icon Extraction Pipeline

### 1. Data Structures (`src-tauri/src/launcher/AppDiscovery.rs`)
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredApp {
    pub id: String,           // Bundle ID, ProgID, or .desktop file name
    pub name: String,         // Used strictly for accessibility aria-label & tooltip
    pub iconDataUri: String,  // "data:image/png;base64,iVBORw0KGgo..."
    pub isDefault: bool,      // Whether this app is currently the OS default
}
```

### 2. Platform Extraction Logic
- **Windows**:
  - **Mail**: Queries `HKLM\SOFTWARE\Clients\Mail` and `HKCR\mailto\OpenWithProgids`.
  - **Code Editors**: Enumerates registered developers tools in `HKCU\Software\Classes\Applications` (`Code.exe`, `cursor.exe`, `windsurf.exe`, `sublime_text.exe`, etc.) and system `PATH`.
  - **Browsers**: Queries `HKLM\SOFTWARE\Clients\StartMenuInternet`.
  - **Icon Extraction**: Calls Win32 `ExtractIconExW` / `SHGetFileInfoW`, renders the `HICON` to an RGBA bitmap, encodes to PNG bytes, and converts to a Base64 data URI.
- **macOS**:
  - **Handlers**: Uses `LSCopyAllHandlersForURLScheme("mailto")` and LaunchServices content type queries (`public.plain-text`, `http`).
  - **Resolution**: Resolves bundle identifiers via `NSWorkspace.urlForApplication`.
  - **Icon Extraction**: Calls `NSWorkspace.shared.icon(forFile:)`, extracts image representation via `NSBitmapImageRep`, encodes to PNG bytes, and base64 encodes.
- **Linux**:
  - **Handlers**: Parses `/usr/share/applications/mimeinfo.cache` and `~/.config/mimeapps.list` for `x-scheme-handler/mailto`, `x-scheme-handler/http`, and `text/plain`.
  - **Icon Extraction**: Reads `.desktop` icon entry and resolves the raster PNG from `/usr/share/icons/hicolor/48x48/apps/` or `/usr/share/pixmaps/`.

---

## Frontend Icon-Only Dropdown Design & UX

### Visual Layout
- The card/row retains its category label on the left (e.g. `Code Editor`, `Email`, `Browser`).
- Instead of a text button labeled "Connect" or showing the app title, the action slot renders the **active selected application icon** inside an interactive trigger button with a subtle chevron caret.
- Clicking the trigger opens a compact floating menu displaying a grid/row of **icons only** (e.g., VS Code icon, Cursor icon, Sublime icon, etc.).
- **No text labels** are rendered inside the dropdown menu items — only crisp, high-resolution application icons with accessible `aria-label` and native HTML `title` attributes for tooltips on hover.

### HTML Structure (Inline in Cards & Settings Rows)
```html
<div class="icon-dropdown" data-category="email">
  <button class="icon-dropdown__trigger" aria-haspopup="listbox" aria-expanded="false" title="Selected: Thunderbird">
    <img src="${selectedApp.iconDataUri}" class="icon-dropdown__current-icon" alt="${selectedApp.name}" />
    <span class="icon-dropdown__caret"><!-- CaretDown SVG --></span>
  </button>
  <div class="icon-dropdown__menu" role="listbox" aria-hidden="true">
    <!-- Icon-only options -->
    <button class="icon-dropdown__item icon-dropdown__item--selected" data-app-id="thunderbird" role="option" aria-label="Thunderbird" title="Thunderbird">
      <img src="${app.iconDataUri}" class="icon-dropdown__item-icon" alt="" />
    </button>
    <button class="icon-dropdown__item" data-app-id="outlook" role="option" aria-label="Outlook" title="Outlook">
      <img src="${app.iconDataUri}" class="icon-dropdown__item-icon" alt="" />
    </button>
  </div>
</div>
```

---

## Backend-to-Frontend Interaction Flow

1. **Mount & Discovery**:
   - On component mount (`Onboarding.ts` or `SettingsModal.ts`), the frontend calls:
     ```typescript
     const mailApps = await invoke<DiscoveredApp[]>("get_installed_apps", { category: "email" });
     const editorApps = await invoke<DiscoveredApp[]>("get_installed_apps", { category: "ide" });
     const browserApps = await invoke<DiscoveredApp[]>("get_installed_apps", { category: "browser" });
     ```
2. **Selection & Active State**:
   - If the user previously selected an app, the stored ID is loaded from local settings/backend.
   - If not previously selected, the dropdown automatically defaults to the app where `isDefault === true`.
3. **Dropdown Selection**:
   - Clicking an icon option updates the trigger's displayed icon, marks the option as selected, closes the dropdown menu, and calls:
     ```typescript
     await invoke("set_selected_app", { category: "email", appId: "thunderbird" });
     ```
4. **Context Launching**:
   - When a user triggers an "Open in Mail" or "Open in Editor" shortcut or button, `QuickLauncher` launches the specific application binary or bundle ID selected by the user.

---

## Phased Implementation Steps

### Phase 1: Rust Backend Discovery & Extraction
1. Create `src-tauri/src/launcher/AppDiscovery.rs` with platform-specific queries (`cfg(windows)`, `cfg(target_os = "macos")`, `cfg(target_os = "linux")`).
2. Implement PNG extraction and Base64 data URI conversion.
3. Expose Tauri IPC commands `get_installed_apps` and `set_selected_app` in `src-tauri/src/commands/Commands.rs`.

### Phase 2: Frontend Dropdown Component & Styling
1. Add `.icon-dropdown` layout, hover, and active states in `src/styles/Onboarding.css` and `src/styles/SettingsModal.css`.
2. Update `Onboarding.ts` to wire `ide`, `email`, and `browser` cards with the icon-only dropdown.
3. Update `SettingsModal.ts` Connections tab to render the icon-only selector on corresponding rows.
