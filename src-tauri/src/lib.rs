// ==============================================================================
// Imports
// ==============================================================================
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::Manager;

pub mod auth;
pub mod commands;
pub mod launcher;
pub mod storage;
pub mod tray;
pub mod ProcessManager;

use crate::auth::OAuthService::createOAuthStateStore;
use crate::commands::Commands::{
    check_connections, clear_all_secrets, delete_secret, exchange_oauth_code,
    execute_chat, get_available_models, get_installed_context_apps, get_oauth_url,
    launch_app_context, minimize_to_tray, open_connection_flow, open_help_section,
    retrieve_secret, save_llm_secret, set_llm_provider_priority, start_overlay, stop_overlay, store_secret,
    toggle_overlay_mode, choose_application_file, set_selected_app, get_app_settings, save_app_settings, AppState,
};
use crate::storage::SecretStore::SecretStore;
use crate::tray::TrayManager::{setupSystemTray, TrayState};

// ==============================================================================
// Constants
// ==============================================================================
// ==============================================================================
// Run
// ==============================================================================

// Main Tauri application setup and run loop
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let trayState = Arc::new(TrayState {
        overlayMode: AtomicBool::new(false),
    });

    let appState = AppState {
        oauthStore: createOAuthStateStore(),
        secretStore: Arc::new(SecretStore::new()),
        trayState: trayState.clone(),
        processManager: Arc::new(crate::ProcessManager::ProcessManager::new()),
    };

    tauri::Builder::default()
        .manage(appState)
        .setup(move |app| {
            let icon = app.default_window_icon().cloned().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "Bundled app icon is missing")
            })?;
            let window = app.get_webview_window("main").ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "Main application window is missing")
            })?;
            window.set_icon(icon)?;

            let _ = setupSystemTray(app.handle(), trayState.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_connections,
            open_connection_flow,
            open_help_section,
            get_oauth_url,
            exchange_oauth_code,
            store_secret,
            retrieve_secret,
            delete_secret,
            clear_all_secrets,
            save_llm_secret,
            set_llm_provider_priority,
            execute_chat,
            get_available_models,
            launch_app_context,
            get_installed_context_apps,
            set_selected_app,
            choose_application_file,
            start_overlay,
            stop_overlay,
            toggle_overlay_mode,
            minimize_to_tray,
            get_app_settings,
            save_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
