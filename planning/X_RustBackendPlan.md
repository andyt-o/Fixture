# Rust Backend Architecture: System Tray, Keyring, OAuth2 & Quickbinding Shortcuts

## Overview
This plan outlines the architecture and implementation steps for Fixture's Rust backend in [`src-tauri`](file:///mnt/c/Users/andyt/VSC/Fixture/src-tauri). The goal is to provide the operational backbone supporting:
1. **Overlay & Tray Mode**: Enabling overlay mode where the application minimizes to the system tray (disk tray) and remains un-obtrusive to the user, with tray menu controls (Show/Hide, Overlay Mode toggle, Quit). Cross-platform support maps to Win32 `Shell_NotifyIcon` on Windows, AppIndicator/DBus on Linux, and `NSStatusItem` on macOS via Tauri's unified `TrayIconBuilder`.
2. **Keyring Secret Storage & Credential Purge**: Secure system keyring management for storing sensitive credentials (OAuth tokens, API keys, client secrets) via [`keyring`](file:///mnt/c/Users/andyt/VSC/Fixture/src-tauri/Cargo.toml#L15), with capabilities to selectively remove or completely wipe all saved credentials.
3. **OAuth2 Flow Orchestration**: Generating authorization URLs, managing CSRF tokens / PKCE verifiers, handling callback redirects/tokens for supported platforms (Slack, Discord, Microsoft Teams, Jira).
4. **Lazy Microservice & Poller Lifecycles**:
   - The Python microservice sidecar is dormant by default; it only launches when the user configures an LLM API key / IBM Cloud credential. Internal ephemeral session tokens are generated only upon demand.
   - The Jira Tokio smart polling worker only starts when Jira is connected via OAuth, and terminates immediately upon disconnection.
5. **App Launching & OS Default Querying**: Quickbinding actions to "Open with" external context apps (e.g., VS Code, Microsoft Mail, Slack, Discord, Web Browser) without requiring manual file path browsing by the user.

---

## Architecture & Code Conventions
Per [`AGENTS.md`](file:///mnt/c/Users/andyt/VSC/Fixture/AGENTS.md):
- **PascalCase** for distinct types, structs, enums, traits, and file names (e.g. `TrayManager.rs`, `SecretStore.rs`, `OAuthService.rs`, `QuickLauncher.rs`).
- **camelCase** for variables, functions, methods, parameters, and properties.
- **CAPITALIZED** for global constants (e.g. `KEYRING_SERVICE_NAME`).
- **Partition Dividers**: Strictly organize files into partition divider headers (`// === Imports ===`, `// === Types ===`, `// === Constants ===`, `// === Functions ===` or `// === Mount ===`).
- Explanatory prose comments limited to 1-2 lines directly above functions/blocks in `.rs` files.
- No Git/Bash commands; use MCP tools exclusively.

---

## Modular File Structure

```text
src-tauri/
├── Cargo.toml                  # Tauri dependencies, tray-icon, image-png features
├── tauri.conf.json             # Window and tray configurations
└── src/
    ├── main.rs                 # Rust runtime binary entrypoint
    ├── lib.rs                  # App builder, Tauri commands registration, tray setup
    ├── auth/
    │   ├── mod.rs
    │   └── OAuthService.rs     # OAuth2 URL generation, token exchange, and state handling
    ├── storage/
    │   ├── mod.rs
    │   └── SecretStore.rs      # Keyring-backed credential storage, retrieval, and complete purge
    ├── launcher/
    │   ├── mod.rs
    │   └── QuickLauncher.rs    # OS registry querying, protocol dispatch, and "Open with" launcher
    ├── tray/
    │   ├── mod.rs
    │   └── TrayManager.rs      # System tray creation, menu handling, overlay mode toggling
    ├── ProcessManager.rs       # Python microservice sidecar supervisor & session secret lifecycle
    └── commands/
        ├── mod.rs
        └── Commands.rs         # Tauri IPC commands bridge exposing backend capabilities to frontend
```

---

## Detailed Component Specifications

### 1. Overlay & System Tray (`tray/TrayManager.rs` + `tauri.conf.json`)
- **Cross-Platform Mechanism**:
  - Uses Tauri v2 `TrayIconBuilder`.
  - Windows: Hooks directly into the Win32 `Shell_NotifyIcon` notification tray.
  - Linux: Utilizes `AppIndicator` / `StatusNotifierItem` DBus daemon.
- **Tray Menu**:
  - "Show Fixture"
  - "Toggle Overlay Mode"
  - "Mute Notifications"
  - Separator
  - "Quit Fixture"
- **Overlay Window Management**:
  - Hides from taskbar when entering overlay mode.
  - Toggles `alwaysOnTop(true)` and borderless presentation.
  - Minimizes to tray cleanly when unfocused or closed based on user setting.

### 2. System Secrets & Keyring Management (`storage/SecretStore.rs`)
- **Keyring Integration**:
  - Service domain `com.fixture.app`.
  - Stores credentials in Windows Credential Manager (DPAPI) on Windows, Secret Service on Linux.
  - Provides `setSecret`, `getSecret`, `deleteSecret`, and `clearAllSecrets`.

### 3. OAuth2 Orchestration (`auth/OAuthService.rs`)
- **Supported Providers**: Slack, Discord, Microsoft Teams, Jira.
- **Flow**: Generates PKCE code challenge and state token; exchanges authorization code with provider endpoints; persists tokens to `SecretStore`.

### 4. Lazy Lifecycle Architecture (Microservice & Jira Poller)
- **Zero Idle Overhead**:
  - The Python FastAPI/LangGraph sidecar is **not spawned at startup**.
  - Ephemeral tokens (`X-Fixture-Internal-Token`) are only generated when an active LLM key (IBM Cloud or fallback key) is configured.
  - If keys are wiped or disconnected, the process is terminated gracefully.
- **Jira Smart Poller**:
  - Tokio interval task is idle until Jira OAuth credentials exist.
  - On user disconnect, a cancellation token halts the poller immediately.

### 5. Application Launching & OS Default Querying (`launcher/QuickLauncher.rs`)

#### How App Launching & Discovery Operates (No Manual File Path Selection Needed)
Users do **not** need to browse the file system to locate `.exe` binaries. The backend discovers and invokes applications using three complementary layers:

1. **Protocol & Deep Link Handling (Zero-Configuration)**:
   - Modern desktop applications register standard system protocol schemes during installation:
     - **VS Code**: `vscode://file/<path>` or `vscode-insiders://`
     - **Mail**: `mailto:<email>?subject=...&body=...`
     - **Slack**: `slack://channel?team=<team>&id=<id>`
     - **Discord**: `discord://-/channels/<guild>/<channel>`
     - **Browser**: Standard `https://...`
   - When the backend dispatches a protocol URL via the OS Shell (`ShellExecuteExW` on Windows, `xdg-open` on Linux), the operating system automatically resolves and launches the registered default application without needing the installation path.

2. **OS Default Application Querying**:
   - Rather than scanning entire hard drives, the backend queries the OS application registry directly:
     - **On Windows**: Queries the Registry keys:
       - `HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoice` (default mail client).
       - `HKCR\Applications\Code.exe` or `HKCU\Software\Classes\Applications` for developer tools.
       - Known PATH environments for developer command line tools (`code`, `cursor`, `windsurf`, `subl`).
     - **On Linux**: Reads `~/.config/mimeapps.list` and `/usr/share/applications/` desktop entries to detect default handlers for `x-scheme-handler/mailto`, `text/plain`, etc.
   - The frontend can call `invoke("get_installed_context_apps")` to present discovered tools to the user.

3. **Optional Custom Path Override**:
   - If a user has a portable or non-standard editor installation, they can optionally provide a path or command flag in Settings, but it is never mandatory.

### 6. Tauri IPC Command Bridge (`commands/Commands.rs` & `lib.rs`)
- Exposes:
  - `check_connections() -> Result<bool, String>`
  - `open_connection_flow(kind: String) -> Result<AuthUrlPayload, String>`
  - `get_oauth_url(provider: String, clientId: Option<String>) -> Result<AuthUrlPayload, String>`
  - `exchange_oauth_code(provider: String, code: String, authState: String, clientSecret: Option<String>) -> Result<bool, String>`
  - `store_secret(key: String, secret: String) -> Result<(), String>`
  - `retrieve_secret(key: String) -> Result<Option<String>, String>`
  - `delete_secret(key: String) -> Result<(), String>`
  - `clear_all_secrets() -> Result<usize, String>`
  - `save_llm_secret(provider: String, token: String) -> Result<(), String>`
  - `set_llm_provider_priority(primary: String, fallback_enabled: bool) -> Result<(), String>`
  - `execute_chat(payload: ChatRequestPayload) -> Result<ChatResponsePayload, String>`
  - `toggle_overlay_mode(enabled: bool) -> Result<(), String>`
  - `minimize_to_tray() -> Result<(), String>`
  - `launch_app_context(target: String, payload: serde_json::Value) -> Result<(), String>`
  - `get_installed_context_apps() -> Result<Vec<AppTargetInfo>, String>`

### 7. Python Microservice & Dual-Key LLM Routing (`ProcessManager.rs` & `Commands.rs`)
- **Process Supervision (`ProcessManager.rs`)**:
  - Generates an ephemeral cryptographically secure random session secret (32-character hexadecimal token) at application boot.
  - Resolves virtual environment Python binary (`.venv/bin/python` or `.venv/Scripts/python.exe`) and launches `services.Server` on `127.0.0.1:8765`.
  - Injects `FIXTURE_INTERNAL_TOKEN` and `FIXTURE_SERVER_PORT` into the child process environment.
  - Maintains handle in `Arc<Mutex<Option<Child>>>` ensuring graceful SIGTERM/kill upon desktop app shutdown.
- **Dual-Key Priority & Fallback Execution (`commands/Commands.rs`)**:
  - Eliminates intermediate client wrappers by embedding direct `reqwest` dispatch into `execute_chat`.
  - Reads `llm_provider_priority` from `SecretStore` to determine active primary engine (`"openai"` vs. `"watsonx"`).
  - Fetches both `openai_gateway_key` and `watsonx_cloud_key` from OS Keyring.
  - Attaches `X-Fixture-Internal-Token: <sessionToken>` and issues loopback POST to `/api/chat`.
  - Parses response payload preserving failover indicators (`providerUsed`, `fallbackTriggered`, `fallbackReason`).

---

## Phased Implementation Roadmap
1. **Phase 1: Dependencies & Tray Features**: Update `Cargo.toml` with `tray-icon` and window flags.
2. **Phase 2: QuickLauncher & OS App Detection**: Implement `launcher/QuickLauncher.rs` with protocol launchers and OS default queries.
3. **Phase 3: System Tray & Overlay Transitions**: Implement `tray/TrayManager.rs` handling tray menu and overlay window modes.
4. **Phase 4: Lazy Lifecycle Management**: Integrate lazy activation for the Python sidecar and Jira Tokio smart poller.
5. **Phase 5: IPC Command Wiring**: Connect all new capabilities into `commands/Commands.rs` and `lib.rs`.
