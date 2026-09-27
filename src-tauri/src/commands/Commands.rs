// ==============================================================================
// Imports
// ==============================================================================
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use serde::{Deserialize, Serialize};

use crate::auth::OAuthService::{
    exchangeAuthCode, generateAuthUrl, AuthUrlPayload, OAuthProvider, OAuthStateStore,
};
use crate::launcher::QuickLauncher::{
    appFromPath, openWithContext, queryInstalledApps, AppTargetInfo, ContextPayload,
};
use crate::storage::SecretStore::SecretStore;
use crate::tray::TrayManager::{applyOverlayMode, TrayState};
use crate::ProcessManager::ProcessManager;

// ==============================================================================
// Types
// ==============================================================================
pub struct AppState {
    pub(crate) oauthStore: OAuthStateStore,
    pub secretStore: Arc<SecretStore>,
    pub trayState: Arc<TrayState>,
    pub processManager: Arc<ProcessManager>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequestPayload {
    pub prompt: String,
    pub messages: Option<Vec<serde_json::Value>>,
    pub modelName: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponsePayload {
    pub reply: String,
    pub providerUsed: String,
    pub fallbackTriggered: bool,
    pub fallbackReason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettingsPayload {
    pub autoHideWhenIdle: bool,
    pub autoHideWhenEmpty: bool,
    pub alwaysShowToolbar: bool,
    pub soundEnabled: bool,
}

// ==============================================================================
// Functions
// ==============================================================================

// Checks if any connections currently exist in the credential store
#[tauri::command]
pub async fn check_connections(state: State<'_, AppState>) -> Result<bool, String> {
    let slackToken = state.secretStore.getSecret("slack_access_token")?;
    let discordToken = state.secretStore.getSecret("discord_access_token")?;
    let teamsToken = state.secretStore.getSecret("teams_access_token")?;
    let jiraToken = state.secretStore.getSecret("jira_access_token")?;
    let apiKey = state.secretStore.getSecret("api_key")?;

    Ok(slackToken.is_some()
        || discordToken.is_some()
        || teamsToken.is_some()
        || jiraToken.is_some()
        || apiKey.is_some())
}

// Handles connection initiation flow for a given connection kind from UI
#[tauri::command]
pub async fn open_connection_flow(
    kind: String,
    state: State<'_, AppState>,
) -> Result<AuthUrlPayload, String> {
    let provider = match kind.as_str() {
        "slack" => OAuthProvider::Slack,
        "discord" => OAuthProvider::Discord,
        "microsoft-teams" => OAuthProvider::MicrosoftTeams,
        "jira" => OAuthProvider::Jira,
        _ => return Err(format!("Unsupported OAuth connection kind: {}", kind)),
    };

    let envKey = match provider {
        OAuthProvider::Slack => "SLACK_CLIENT_ID",
        OAuthProvider::Discord => "DISCORD_CLIENT_ID",
        OAuthProvider::MicrosoftTeams => "TEAMS_CLIENT_ID",
        OAuthProvider::Jira => "JIRA_CLIENT_ID",
        _ => "DEFAULT_CLIENT_ID",
    };

    let clientId = std::env::var(envKey).unwrap_or_else(|_| "default_client_id".to_string());

    generateAuthUrl(provider, &clientId, None, &state.oauthStore).await
}

// Generates an authorization URL for OAuth authentication
#[tauri::command]
pub async fn get_oauth_url(
    provider: String,
    clientId: Option<String>,
    state: State<'_, AppState>,
) -> Result<AuthUrlPayload, String> {
    let (oauthProvider, envKey) = match provider.as_str() {
        "slack" => (OAuthProvider::Slack, "SLACK_CLIENT_ID"),
        "discord" => (OAuthProvider::Discord, "DISCORD_CLIENT_ID"),
        "microsoft-teams" | "teams" => (OAuthProvider::MicrosoftTeams, "TEAMS_CLIENT_ID"),
        "jira" => (OAuthProvider::Jira, "JIRA_CLIENT_ID"),
        _ => return Err(format!("Unknown OAuth provider: {}", provider)),
    };

    let id = clientId
        .or_else(|| std::env::var(envKey).ok())
        .unwrap_or_else(|| "default_client_id".to_string());

    generateAuthUrl(oauthProvider, &id, None, &state.oauthStore).await
}

// Exchanges authorization code and securely stores access/refresh tokens
#[tauri::command]
pub async fn exchange_oauth_code(
    provider: String,
    code: String,
    authState: String,
    clientSecret: Option<String>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let (oauthProvider, idKey, secretKey) = match provider.as_str() {
        "slack" => (OAuthProvider::Slack, "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"),
        "discord" => (OAuthProvider::Discord, "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"),
        "microsoft-teams" | "teams" => (OAuthProvider::MicrosoftTeams, "TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET"),
        "jira" => (OAuthProvider::Jira, "JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"),
        _ => return Err(format!("Unknown OAuth provider: {}", provider)),
    };

    let clientId = std::env::var(idKey).unwrap_or_else(|_| "default_client_id".to_string());
    let secret = clientSecret
        .or_else(|| std::env::var(secretKey).ok())
        .unwrap_or_else(|| "default_client_secret".to_string());

    let tokens = exchangeAuthCode(
        oauthProvider,
        &clientId,
        &secret,
        &code,
        &authState,
        None,
        &state.oauthStore,
    )
    .await?;

    match oauthProvider {
        OAuthProvider::Slack => {
            state.secretStore.setSecret("slack_access_token", &tokens.accessToken)?;
            if let Some(refresh) = tokens.refreshToken {
                state.secretStore.setSecret("slack_refresh_token", &refresh)?;
            }
        }
        OAuthProvider::Discord => {
            state.secretStore.setSecret("discord_access_token", &tokens.accessToken)?;
            if let Some(refresh) = tokens.refreshToken {
                state.secretStore.setSecret("discord_refresh_token", &refresh)?;
            }
        }
        OAuthProvider::MicrosoftTeams => {
            state.secretStore.setSecret("teams_access_token", &tokens.accessToken)?;
            if let Some(refresh) = tokens.refreshToken {
                state.secretStore.setSecret("teams_refresh_token", &refresh)?;
            }
        }
        OAuthProvider::Jira => {
            state.secretStore.setSecret("jira_access_token", &tokens.accessToken)?;
            if let Some(refresh) = tokens.refreshToken {
                state.secretStore.setSecret("jira_refresh_token", &refresh)?;
            }
        }
        _ => {}
    }

    Ok(true)
}

// Stores an arbitrary secret value in the system keyring
#[tauri::command]
pub async fn store_secret(
    key: String,
    secret: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.secretStore.setSecret(&key, &secret)
}

// Retrieves an arbitrary secret from the system keyring
#[tauri::command]
pub async fn retrieve_secret(
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    state.secretStore.getSecret(&key)
}

// Deletes a specific secret from the system keyring
#[tauri::command]
pub async fn delete_secret(
    key: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.secretStore.deleteSecret(&key)
}

// Wipes all application credentials from the system keyring
#[tauri::command]
pub async fn clear_all_secrets(
    state: State<'_, AppState>,
) -> Result<usize, String> {
    state.processManager.stop().await;
    state.secretStore.clearAllSecrets()
}

// Saves a specific LLM secret key
#[tauri::command]
pub async fn save_llm_secret(
    provider: String,
    token: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let key = format!("{}_key", provider);
    state.secretStore.setSecret(&key, &token)
}

// Sets active LLM provider priority preference
#[tauri::command]
pub async fn set_llm_provider_priority(
    primary: String,
    fallback_enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.secretStore.setSecret("llm_primary_provider", &primary)?;
    state.secretStore.setSecret("llm_fallback_enabled", &fallback_enabled.to_string())
}

// Executes a chat prompt against the local Python microservice sidecar
#[tauri::command]
pub async fn execute_chat(
    payload: ChatRequestPayload,
    state: State<'_, AppState>,
) -> Result<ChatResponsePayload, String> {
    let internalToken = state.processManager.ensureRunning().await?;

    let primary = state.secretStore.getSecret("llm_primary_provider")?
        .unwrap_or_else(|| "watsonx".to_string());
    let fallbackEnabled = state.secretStore.getSecret("llm_fallback_enabled")?
        .map(|v| v == "true")
        .unwrap_or(true);

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "prompt": payload.prompt,
        "messages": payload.messages,
        "modelName": payload.modelName,
        "primary": primary,
        "fallbackEnabled": fallbackEnabled,
    });

    let res = client
        .post(format!("http://127.0.0.1:{}/api/chat", crate::ProcessManager::DEFAULT_SERVER_PORT))
        .header("X-Fixture-Internal-Token", internalToken)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Python LLM microservice: {}", e))?;

    let responseJson: ChatResponsePayload = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse microservice response: {}", e))?;

    Ok(responseJson)
}

// Fetches available model identifiers for a given provider from the microservice or returns curated fallbacks
#[tauri::command]
pub async fn get_available_models(
    provider: String,
    base_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let sessionToken = state.processManager.ensureRunning().await?;
    let mut requestUrl = format!("http://127.0.0.1:{}/api/models?provider={}", crate::ProcessManager::DEFAULT_SERVER_PORT, provider);
    if let Some(ref base) = base_url {
        requestUrl.push_str(&format!("&baseUrl={}", base));
    }

    let apiKey = match provider.to_lowercase().as_str() {
        "watsonx" => state.secretStore.getSecret("watsonx_cloud_key")?,
        _ => state.secretStore.getSecret("openai_gateway_key")?
            .or_else(|| state.secretStore.getSecret("api_key").ok().flatten()),
    };

    if let Some(ref key) = apiKey {
        requestUrl.push_str(&format!("&apiKey={}", key));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&requestUrl)
        .header("X-Fixture-Internal-Token", sessionToken)
        .send()
        .await
        .map_err(|e| format!("Failed to reach microservice: {}", e))?;

    if !response.status().is_success() {
        return Ok(match provider.to_lowercase().as_str() {
            "watsonx" => vec![
                "ibm/granite-3-8b-instruct".to_string(),
                "ibm/granite-13b-chat-v2".to_string(),
                "meta-llama/llama-3-3-70b-instruct".to_string(),
                "mistralai/mistral-large".to_string(),
            ],
            _ => vec![
                "gpt-4o".to_string(),
                "gpt-4o-mini".to_string(),
                "o1".to_string(),
                "o3-mini".to_string(),
            ],
        });
    }

    let jsonBody = response.json::<serde_json::Value>().await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let models = jsonBody.get("models")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|m| m.as_str().map(String::from)).collect())
        .unwrap_or_default();

    Ok(models)
}

// Launches external application based on contextual target
#[tauri::command]
pub async fn launch_app_context(
    target: String,
    payload: ContextPayload,
) -> Result<(), String> {
    let mut p = payload;
    p.target = target;
    openWithContext(&p)
}

// Retrieves all installed context apps for a given category
#[tauri::command]
pub async fn get_installed_context_apps(
    category: String,
    state: State<'_, AppState>,
) -> Result<Vec<AppTargetInfo>, String> {
    if !matches!(category.as_str(), "ide" | "browser" | "email") {
        return Err(format!("Unsupported application category: {}", category));
    }

    let selection_key = format!("selected_context_app_{}", category);
    let selected_id = state.secretStore.getSecret(&selection_key)?;
    let mut apps = queryInstalledApps(&category);

    if let Some(selected_id) = selected_id {
        let mut found = false;
        for app in &mut apps {
            app.isDefault = app.id == selected_id;
            found |= app.isDefault;
        }

        if !found {
            apps.push(appFromPath(&category, &selected_id));
        }
    }

    Ok(apps)
}

#[tauri::command]
pub async fn set_selected_app(
    category: String,
    app_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !matches!(category.as_str(), "ide" | "browser" | "email") {
        return Err(format!("Unsupported application category: {}", category));
    }
    if app_id.trim().is_empty() {
        return Err("Application selection cannot be empty".to_string());
    }

    state.secretStore.setSecret(&format!("selected_context_app_{}", category), &app_id)
}

#[tauri::command]
pub async fn choose_application_file() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-STA",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title='Choose application'; $d.Filter='Applications (*.exe;*.lnk)|*.exe;*.lnk|All files (*.*)|*.*'; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($d.FileName) }",
        ])
        .output()
        .map_err(|error| format!("Could not open File Explorer: {}", error))?;

    #[cfg(target_os = "macos")]
    let output = std::process::Command::new("osascript")
        .args(["-e", "POSIX path of (choose file with prompt \"Choose application\")"])
        .output()
        .map_err(|error| format!("Could not open the file picker: {}", error))?;

    #[cfg(target_os = "linux")]
    let output = std::process::Command::new("zenity")
        .args(["--file-selection", "--title=Choose application"])
        .output()
        .map_err(|error| format!("Could not open the file picker: {}", error))?;

    if !output.status.success() {
        return Ok(None);
    }
    let selected_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!selected_path.is_empty()).then_some(selected_path))
}

// Starts overlay mode with specified or default variant
#[tauri::command]
pub async fn start_overlay(
    variant: Option<String>,
    appHandle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.trayState.overlayMode.store(true, Ordering::SeqCst);
    if let Some(window) = appHandle.get_webview_window("main") {
        applyOverlayMode(&window, true, variant.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Stops overlay mode and returns to normal desktop window
#[tauri::command]
pub async fn stop_overlay(
    appHandle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.trayState.overlayMode.store(false, Ordering::SeqCst);
    if let Some(window) = appHandle.get_webview_window("main") {
        applyOverlayMode(&window, false, None).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Toggles overlay mode for the application window
#[tauri::command]
pub async fn toggle_overlay_mode(
    enabled: bool,
    appHandle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.trayState.overlayMode.store(enabled, Ordering::SeqCst);
    if let Some(window) = appHandle.get_webview_window("main") {
        applyOverlayMode(&window, enabled, None).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Minimizes the application window to the system tray
#[tauri::command]
pub async fn minimize_to_tray(appHandle: AppHandle) -> Result<(), String> {
    if let Some(window) = appHandle.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Handles opening documentation or help section triggers from UI
#[tauri::command]
pub async fn open_help_section(target: String) -> Result<(), String> {
    println!("Requested help section: {}", target);
    Ok(())
}

// Retrieves customizable application and overlay settings
#[tauri::command]
pub async fn get_app_settings(
    state: State<'_, AppState>,
) -> Result<AppSettingsPayload, String> {
    let autoHideWhenIdle = state.secretStore.getSecret("setting_auto_hide_idle")?
        .map(|v| v == "true")
        .unwrap_or(false);
    let autoHideWhenEmpty = state.secretStore.getSecret("setting_auto_hide_empty")?
        .map(|v| v == "true")
        .unwrap_or(false);
    let alwaysShowToolbar = state.secretStore.getSecret("setting_always_show_toolbar")?
        .map(|v| v == "true")
        .unwrap_or(false);
    let soundEnabled = state.secretStore.getSecret("setting_sound_enabled")?
        .map(|v| v == "true")
        .unwrap_or(true);

    Ok(AppSettingsPayload {
        autoHideWhenIdle,
        autoHideWhenEmpty,
        alwaysShowToolbar,
        soundEnabled,
    })
}

// Saves customizable application and overlay settings
#[tauri::command]
pub async fn save_app_settings(
    settings: AppSettingsPayload,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.secretStore.setSecret("setting_auto_hide_idle", &settings.autoHideWhenIdle.to_string())?;
    state.secretStore.setSecret("setting_auto_hide_empty", &settings.autoHideWhenEmpty.to_string())?;
    state.secretStore.setSecret("setting_always_show_toolbar", &settings.alwaysShowToolbar.to_string())?;
    state.secretStore.setSecret("setting_sound_enabled", &settings.soundEnabled.to_string())?;
    Ok(())
}
