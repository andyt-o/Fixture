# Project Status — Fixture

> Audit date: 2026-10-18

================================================================================
# 1. What This Project Is
================================================================================

Fixture is a Tauri v2 desktop overlay application (TypeScript frontend + Rust backend + Python microservice sidecar). Its purpose is to act as a unified hub for team communication (Slack, Discord, Microsoft Teams), issue tracking (Jira), and LLM-powered agent interaction (IBM Watsonx, OpenAI). It presents as a normal desktop window in configuration mode and transforms into a non-intrusive screen overlay (floating HUD, mini-pill, docked sidebar) during active use.

---

================================================================================
# 2. Plan File Inventory
================================================================================

### Completed Plans (`X_` prefix)
- `X_ScreenOverlayPlatformPlan.md` — Initial project vision and architecture overview. Documented overlay variants, platform integrations, component structure, color palette, and icon specs. Superseded by later plans.
- `X_RustBackendPlan.md` — Rust backend architecture: tray mode, keyring, OAuth2, QuickLauncher, ProcessManager, Commands bridge. Majority implemented.
- `X_Dashboard.md` — Dashboard component design. Implemented.
- `X_ChatGroupCard.md` — Chat group card component plan. Implemented.
- `X_FluidScaling.md` — CSS fluid scaling via `clamp()` on `:root { font-size }`. Implemented in `Globals.css`.
- `X_OverlayPresentationPlan.md` — Overlay variants (floating HUD, mini-pill, docked sidebar), Rust window transform commands, frontend `OverlayController.ts`. Implemented.
- `X_SettingsModal.md` — Settings modal: tabs (Profile, Connections, Hotkeys, Appearance, Notifications), toggle rows, hotkey capture. Implemented.
- `X_SettingsCustomizationPlan.md` — Advanced overlay/notification settings: auto-hide, toolbar toggle, sound cues. `AudioCues.ts`, `OverlayController.ts` proximity detection, `get_app_settings`/`save_app_settings` Rust commands. Implemented.
- `X_AppDiscoveryDropdown.md` — App icon dropdown (IDE, browser, email categories), `QuickLauncher.rs`, `AppIconDropdown.ts`. Implemented.

### Active Plans (`W_` prefix)
- `W_MicroserviceLLM.md` — Python FastAPI/LangChain/LangGraph microservice, dual-key LLM routing (IBM Watsonx + OpenAI), security middleware, Rust `ProcessManager`, `SecretStore`, `JiraPoller`. **Partially implemented — see Section 4.**
- `W_ProjectStatus.md` — This file.

---

================================================================================
# 3. What Has Been Implemented
================================================================================

### Frontend (`src/`)
- `main.ts` — Entry point, mounts `Titlebar` and `Dashboard` or checks onboarding flow.
- `components/Titlebar.ts` — Titlebar with window controls, layout/variant switcher, launch power button.
- `components/Dashboard.ts` — Full dashboard with rail, 4-column tab strip (Activity, Connections, Issues, Agent), live data loading from Tauri commands.
- `components/OverlayController.ts` — Overlay mount: floating HUD and mini-pill variants, feed cards, proximity auto-hide, settings-driven auto-hide on empty, HUD/pill action wiring.
- `components/SettingsModal.ts` — Full 5-tab settings modal (Profile, Connections, Hotkeys, Appearance, Notifications) with connection rows, service-level notification/polling settings, hotkey capture, appearance controls (theme, opacity, font size, accent color), overlay behavior toggles, save handlers wired to Tauri commands.
- `components/AudioCues.ts` — Web Audio API two-tone chime, respects `soundEnabled` and `globalMute`.
- `components/AppIconDropdown.ts` — App category dropdowns (IDE, browser, email) with OS-discovered app lists.
- `components/Onboarding.ts` — Provider forms for IBM Cloud/Bob and OpenAI credential entry.
- `styles/` — `Globals.css`, `Dashboard.css`, `Overlay.css`, `SettingsModal.css`, `Titlebar.css`, `Onboarding.css`.

### Rust Backend (`src-tauri/src/`)
- `lib.rs` — App builder, tray setup, full `invoke_handler` registration.
- `main.rs` — Rust binary entry point.
- `ProcessManager.rs` — Lazy Python sidecar spawn, ephemeral session token, graceful stop.
- `tray/TrayManager.rs` — System tray creation, overlay mode toggling (window geometry resize, always-on-top, skip-taskbar), tray menu handling.
- `auth/OAuthService.rs` — OAuth2 PKCE URL generation and code exchange for Slack, Discord, Teams, Jira.
- `storage/SecretStore.rs` — Keyring-backed `setSecret`, `getSecret`, `deleteSecret`, `clearAllSecrets`.
- `launcher/QuickLauncher.rs` — Protocol dispatch, OS app registry queries, app-from-path fallback.
- `commands/Commands.rs` — Tauri IPC bridge implementing:
  - `check_connections`, `open_connection_flow`, `get_oauth_url`, `exchange_oauth_code`
  - `store_secret`, `retrieve_secret`, `delete_secret`, `clear_all_secrets`
  - `save_llm_secret`, `set_llm_provider_priority`, `execute_chat`, `get_available_models`
  - `launch_app_context`, `get_installed_context_apps`, `set_selected_app`, `choose_application_file`
  - `start_overlay`, `stop_overlay`, `toggle_overlay_mode`, `minimize_to_tray`
  - `get_app_settings`, `save_app_settings`
  - `open_help_section` (stub only)

### Python Microservice (`services/`)
- `Server.py` — FastAPI app, CORS middleware (Tauri origins only), `InternalTokenMiddleware`, `GET /health`, `GET /api/models`, `POST /api/chat`.
- `Security.py` — `InternalTokenMiddleware` token verification and log redaction filter.
- `Models.py` — Pydantic `ChatRequest`, `ChatResponse`, `HealthResponse`, `ModelsResponse`.
- `ChatRouter.py` — Dynamic LangChain client builder, multi-provider routing (OpenAI, Watsonx.ai, Watsonx Orchestrate), dual-key failover.

---

================================================================================
# 4. What Is Missing / Incomplete
================================================================================

### 4A. Rust Commands and Settings Migration

Settings now use the unified `get_settings` / `save_settings` commands and persist as one JSON value. The old per-section settings commands have been removed from the frontend and Rust handler. `get_connection_states`, `disconnect_service`, `get_activity_feed`, `get_jira_issues`, `get_agent_activity`, `get_active_layout`, and `open_view_mode` are registered. Feed, issue, and agent commands currently return empty collections; `open_view_mode` currently validates the requested mode without changing the window.

The following functionality still needs implementation beyond the IPC stubs:

| Command | Called By | Purpose |
|---|---|---|
| Activity adapters/store | `Dashboard.ts`, `OverlayController.ts` | Populate `get_activity_feed`; command currently returns an empty list |
| Jira poller/store | `Dashboard.ts` | Populate `get_jira_issues`; command currently returns an empty list |
| Agent activity store | `Dashboard.ts` | Populate `get_agent_activity`; command currently returns an empty list |
| Overlay variant state | `Dashboard.ts`, `Titlebar.ts` | Make `get_active_layout` and `open_view_mode` reflect/apply the chosen variant |

### 4B. Missing: `JiraPoller.rs`
- `W_MicroserviceLLM.md` specifies a Tokio interval worker (`JiraPoller.rs`) in `src-tauri/src/`.
- The file does not exist. No Jira polling loop, no delta JQL dispatching, no Tauri event emission to the frontend.
- The unified `save_settings` payload should update the Jira poller interval dynamically when the poller is added.

### 4C. Missing: Platform Activity Adapters
- No Slack, Discord, or Teams event listeners or polling loops exist anywhere in the Rust backend.
- `get_activity_feed` has no data source — the HUD stream and Dashboard Activity column always render empty.

### 4D. Missing: Agent Activity Store
- Chat responses from `execute_chat` are returned to the frontend but not stored in any log.
- `get_agent_activity` has no backing store; Agent tab always shows empty.

### 4E. `open_help_section` — Stub Only
- Currently `println!` to stdout. No real help routing or documentation implemented.

### 4F. Onboarding Flow — Unverified
- `Onboarding.ts` exists with provider form fields for IBM Cloud/Bob and OpenAI.
- End-to-end boot flow (onboarding check → credential entry → dashboard transition) has not been confirmed to work without UI glitches.

---

================================================================================
# 5. MVP Readiness Assessment
================================================================================

### Works at Runtime
- Application window, titlebar, dashboard layout, tab-strip navigation.
- Settings modal with all five tabs rendered and hotkey capture UI working.
- Overlay mode transitions: `start_overlay`, `stop_overlay`, tray hiding, variant switching (HUD ↔ mini-pill).
- OAuth2 URL generation for Slack, Discord, Teams, Jira (no callback handler yet).
- Keyring credential storage, retrieval, deletion.
- App discovery dropdown for IDE, browser, email (OS-queried).
- Protocol dispatch quick-launcher (VS Code, Slack, Discord, mail, browser).
- LLM chat execution via `execute_chat` → Python microservice → Watsonx/OpenAI (requires `.venv` and configured keys).
- Notification sound chime respecting `soundEnabled` and `globalMute`.
- Proximity auto-hide and empty-stream auto-hide on overlay.
- Unified `get_settings`/`save_settings` persist the profile, hotkeys, appearance, notification, overlay, and service settings blob via `SecretStore`.

### Silently Broken at Runtime (Always Fail to Empty/Default)
- `get_activity_feed` → HUD stream and Activity column always empty until activity adapters exist.
- `get_jira_issues` → Issues column always empty.
- `get_agent_activity` → Agent column always empty.
- `open_view_mode` → validates the requested view but does not yet change the window variant.
- Jira polling → `JiraPoller.rs` absent entirely.

---

================================================================================
# 6. Priority Order for Next Work
================================================================================

1. **Implement `JiraPoller.rs`**
   - Tokio interval task with `watch` channel for dynamic interval updates.
   - Delta JQL query dispatch to Jira REST API using the stored access token.
   - Tauri event emission so `get_jira_issues` has live data to return.
   - Wire `save_service_notification_settings` to update the poller interval.

2. **Platform Activity Adapters (Slack, Discord)**
   - In-memory `ActivityStore` shared state in `AppState`.
   - Polling or WebSocket adapters writing normalized `FeedItem` entries into the store.
   - `get_activity_feed` reads from the store.

3. **Agent Activity Log**
   - Append `execute_chat` responses to an in-memory or persisted activity log.
   - `get_agent_activity` reads from that log.

4. **Complete overlay variant dispatch** for `open_view_mode` and keep `get_active_layout` synchronized with tray/window state.

5. **Onboarding Flow Validation**
   - Confirm `main.ts` onboarding check routes correctly.
   - Confirm credential entry → dashboard transition works end-to-end without rendering issues.
