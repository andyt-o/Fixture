# Cross-Platform Dynamic App Discovery Plan

## Goal

Replace hardcoded app catalogs and name guessing with dynamic discovery from each operating system's app registration data. The frontend should continue receiving one stable app record shape while Windows, macOS, and Linux use their native discovery and metadata sources.

The current implementation is incomplete: Windows returns only the default handler for each category, macOS and Linux return placeholder records, and `describeWindowsApp` maps a small hardcoded set of strings to names. This plan replaces those behaviors with platform-backed discovery.

## Categories and Discovery Rules

The supported categories remain `ide`, `browser`, and `email`.

- Browser and email candidates should come from applications registered to handle `http`/`https` and `mailto` respectively. Mark the OS-selected handler as the default.
- IDE candidates should come from registered applications with an editor capability, such as supported text-file types or an explicit editor registration. Do not infer IDEs from arbitrary executable names or a maintained vendor list. If an OS does not expose a reliable IDE classification, expose registered text-file handlers and label the capability honestly.
- Return all discoverable candidates for a category, not just the default. Keep user selection persisted independently from the OS default.
- Treat missing registrations and metadata as normal: omit unusable candidates or use a clearly defined executable/bundle/desktop-entry name fallback. Do not fabricate installed apps.

## Shared Backend Contract

Keep a shared serialized record for all platforms:

```rust
pub struct AppTargetInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub iconDataUri: Option<String>,
    pub isDefault: bool,
}
```

`id` must be a stable platform identifier suitable for persisted selection and launch dispatch: a registry application identifier or executable path on Windows, bundle identifier or bundle URL on macOS, and desktop-entry ID on Linux. Discovery must preserve enough launch information to open the selected app; avoid persisting display names as identifiers.

Keep the Tauri command `get_installed_context_apps` and the frontend `invoke` contract stable unless implementation work identifies a necessary schema change. `set_selected_app` continues persisting the selected platform identifier. `get_installed_context_apps` should merge discovery with persisted selection and represent that selection distinctly from the OS default if both values are needed; do not overload `isDefault` to mean both.

## Platform Discovery

### Windows

- Use Windows registry/application registration APIs to enumerate registered applications and their supported protocols or file associations.
- Resolve browser and email candidates from registered `https`/`http` and `mailto` handlers, including the OS default handler.
- Discover IDE candidates from registered text-file handlers or explicit application registrations that declare editor support. Do not scan all of `HKLM` or the uninstall list as a proxy for category support.
- Obtain the registered display name from application/ProgID metadata (for example `FriendlyAppName` or the registered application name). If absent, read executable version-resource metadata such as `ProductName` or `FileDescription`; finally fall back to the executable filename.
- Obtain icons from the registered icon location or executable resources and encode them as PNG data URIs where available.
- Use a Windows API crate (`windows` or `windows-sys`) or a focused registry crate for registry and shell metadata access. Prefer direct APIs over spawning `reg.exe` and PowerShell subprocesses for discovery.

### macOS

- Query Launch Services for applications registered to handle `mailto`, `http`, and `https`, and query the default handler for each scheme.
- Discover editor candidates from registered text-document handlers or an explicit editor capability; do not return fixed VS Code/Cursor entries.
- Use bundle identifiers and resolved bundle URLs as IDs/launch targets. Read display names and icons from bundle metadata and `NSWorkspace`/Launch Services.
- Implement through the macOS frameworks via an appropriate Rust binding or a small, bounded native bridge.

### Linux

- Use desktop-entry registrations and MIME associations to enumerate handlers for `x-scheme-handler/mailto`, `x-scheme-handler/http`, `x-scheme-handler/https`, and text documents.
- Determine defaults from the desktop environment's MIME association data, respecting user-level configuration before system-level configuration.
- Use desktop-entry IDs as stable identifiers and obtain names/icons from the entries and installed icon theme. Resolve icon names through standard icon directories rather than fixed app paths.
- Support common XDG desktop environments and return an empty/partial result when registration data is unavailable rather than inventing apps.

## Redundant and Hardcoded Logic to Remove

Move app discovery and metadata resolution out of `QuickLauncher.rs` into a focused discovery module (for example `AppDiscovery.rs`). Keep `QuickLauncher.rs` responsible for launching a selected app or URI.

Remove these discovery-only helpers from `QuickLauncher.rs` once their replacements are wired:

- `queryInstalledEditors`, `queryInstalledMailClients`, and `queryInstalledBrowsers`, which currently duplicate category dispatch and provide platform-specific placeholder behavior.
- `queryWindowsDefaultApp`, `queryRegistryValue`, and `parseExecutablePath`, replacing shell-based registry parsing with structured platform API access.
- `describeWindowsApp`, whose hardcoded vendor/name dictionary does not scale and is Windows-only.
- Fixed macOS/Linux records for VS Code, Cursor, “System Mail Client,” and “System Default Browser.”
- Any duplicate discovery/icon extraction implementation left in `QuickLauncher.rs`; there should be one discovery path and one shared result type.

Retain `appFromPath` only if the user-selected file picker remains a supported fallback. Keep its platform-specific icon extraction in the discovery/platform layer, and ensure the selected path can actually be launched by `launch_app_context` rather than merely displayed.

## Files to Affect

| File | Planned change |
|---|---|
| `src-tauri/src/launcher/AppDiscovery.rs` | Add the shared discovery contract and platform-specific enumeration, default detection, display-name lookup, and icon extraction. |
| `src-tauri/src/launcher/mod.rs` | Export the discovery module. |
| `src-tauri/src/launcher/QuickLauncher.rs` | Remove discovery and naming helpers; launch from selected platform identifiers or registered launch targets. |
| `src-tauri/src/commands/Commands.rs` | Route `get_installed_context_apps` through the discovery module and merge persisted selection safely. |
| `src-tauri/src/storage/SecretStore.rs` | No change expected unless selection storage needs migration or a typed settings boundary. |
| `src/components/AppIconDropdown.ts` | Preserve the common record shape; distinguish selected app from OS default if needed. |
| `src-tauri/Cargo.toml` | Add target-specific Windows/macOS dependencies only when selected APIs require them. |
| `planning/X_AppDiscoveryDropdown.md` | Update the completed UI plan to point to this active platform-discovery implementation plan and remove obsolete discovery claims after implementation. |

## Implementation Steps

1. Confirm the cross-platform app ID and launch-target representation; make persisted selections distinguishable from OS defaults.
2. Implement dynamic Windows registration enumeration, names, icons, and defaults. Remove the static name dictionary and command-line registry parsing.
3. Implement macOS Launch Services discovery and bundle metadata/icons; remove fixed placeholder records.
4. Implement Linux desktop-entry/MIME discovery and icon resolution; remove fixed placeholder records.
5. Route the existing Tauri command through one platform dispatcher and deduplicate selection merging.
6. Update launcher dispatch so a discovered or selected app ID opens that app with the requested context, while retaining URI-handler fallback where appropriate.
7. Update the older app-discovery plan and project status only after implementation is complete; record each implementation iteration in `CHANGELOG.md`.

## Acceptance Criteria

- No hardcoded vendor app-name catalog or fixed installed-app records remain in discovery.
- Each platform enumerates apps from its registration mechanism and returns names/icons from app metadata when available.
- Browser and email results reflect registered handlers and identify the OS default.
- IDE results are based on registered editor/text capabilities and do not claim arbitrary installed programs are editors.
- Persisted selection remains stable and can be launched; default status and user selection are not conflated.
- All platforms serialize the same frontend-facing record shape; unavailable metadata degrades predictably.
