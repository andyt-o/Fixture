// ==============================================================================
// Imports
// ==============================================================================
use std::process::Command;
use std::path::Path;
use serde::{Deserialize, Serialize};

// ==============================================================================
// Types
// ==============================================================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppTargetInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub iconDataUri: Option<String>,
    pub isDefault: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPayload {
    pub target: String,
    pub path: Option<String>,
    pub url: Option<String>,
    pub recipient: Option<String>,
    pub subject: Option<String>,
    pub body: Option<String>,
}

// ==============================================================================
// Constants
// ==============================================================================
pub const CATEGORY_IDE: &str = "ide";
pub const CATEGORY_MAIL: &str = "email";
pub const CATEGORY_BROWSER: &str = "browser";
pub const CATEGORY_SLACK: &str = "slack";
pub const CATEGORY_DISCORD: &str = "discord";

// ==============================================================================
// Functions
// ==============================================================================

// Launches an external application context based on target kind and payload
pub fn openWithContext(payload: &ContextPayload) -> Result<(), String> {
    match payload.target.as_str() {
        "vscode" | "code" => launchVsCode(payload.path.as_deref()),
        "email" | "mail" => launchMailClient(payload.recipient.as_deref(), payload.subject.as_deref(), payload.body.as_deref()),
        "slack" => launchSlack(payload.url.as_deref()),
        "discord" => launchDiscord(payload.url.as_deref()),
        "browser" => launchBrowser(payload.url.as_deref().unwrap_or("https://google.com")),
        _ => Err(format!("Unsupported application target: {}", payload.target)),
    }
}

// Queries installed applications matching a given category
pub fn queryInstalledApps(category: &str) -> Vec<AppTargetInfo> {
    match category {
        CATEGORY_IDE => queryInstalledEditors(),
        CATEGORY_MAIL => queryInstalledMailClients(),
        CATEGORY_BROWSER => queryInstalledBrowsers(),
        _ => Vec::new(),
    }
}

pub fn appFromPath(category: &str, path: &str) -> AppTargetInfo {
    #[cfg(target_os = "windows")]
    let iconDataUri = extractWindowsIcon(path);
    #[cfg(not(target_os = "windows"))]
    let iconDataUri = None;

    let name = Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Selected application")
        .to_string();
    AppTargetInfo {
        id: path.to_string(),
        name,
        category: category.to_string(),
        iconDataUri,
        isDefault: true,
    }
}

// Dispatches URI protocol opening or system shell execution
fn launchUri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| format!("Failed to launch URI on Windows: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Failed to launch URI on macOS: {}", e))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(uri)
            .spawn()
            .map_err(|e| format!("Failed to launch URI on Linux: {}", e))?;
        Ok(())
    }
}

// Launches VS Code or registered IDE target
fn launchVsCode(path: Option<&str>) -> Result<(), String> {
    let uri = match path {
        Some(p) => format!("vscode://file/{}", p),
        None => "vscode://".to_string(),
    };
    launchUri(&uri)
}

// Launches default or selected mail client with mailto scheme
fn launchMailClient(recipient: Option<&str>, subject: Option<&str>, body: Option<&str>) -> Result<(), String> {
    let mut uri = format!("mailto:{}", recipient.unwrap_or(""));
    let mut params = Vec::new();

    if let Some(sub) = subject {
        params.push(format!("subject={}", sub));
    }
    if let Some(b) = body {
        params.push(format!("body={}", b));
    }

    if !params.is_empty() {
        uri.push('?');
        uri.push_str(&params.join("&"));
    }

    launchUri(&uri)
}

// Launches Slack channel or deep link
fn launchSlack(url: Option<&str>) -> Result<(), String> {
    let uri = url.unwrap_or("slack://");
    launchUri(uri)
}

// Launches Discord deep link or client
fn launchDiscord(url: Option<&str>) -> Result<(), String> {
    let uri = url.unwrap_or("discord://");
    launchUri(uri)
}

// Opens destination in system default web browser
fn launchBrowser(url: &str) -> Result<(), String> {
    launchUri(url)
}

// Enumerate code editors installed on system
fn queryInstalledEditors() -> Vec<AppTargetInfo> {
    #[cfg(target_os = "windows")]
    {
        return queryWindowsDefaultApp("ide");
    }

    #[cfg(not(target_os = "windows"))]
    {
    let mut apps = Vec::new();
    apps.push(AppTargetInfo {
        id: "vscode".to_string(),
        name: "Visual Studio Code".to_string(),
        category: CATEGORY_IDE.to_string(),
        iconDataUri: None,
        isDefault: true,
    });
    apps.push(AppTargetInfo {
        id: "cursor".to_string(),
        name: "Cursor".to_string(),
        category: CATEGORY_IDE.to_string(),
        iconDataUri: None,
        isDefault: false,
    });
    apps
    }
}

// Enumerate email clients installed on system
fn queryInstalledMailClients() -> Vec<AppTargetInfo> {
    #[cfg(target_os = "windows")]
    {
        return queryWindowsDefaultApp("email");
    }

    #[cfg(not(target_os = "windows"))]
    {
    let mut apps = Vec::new();
    apps.push(AppTargetInfo {
        id: "default_mail".to_string(),
        name: "System Mail Client".to_string(),
        category: CATEGORY_MAIL.to_string(),
        iconDataUri: None,
        isDefault: true,
    });
    apps
    }
}

// Enumerate web browsers installed on system
fn queryInstalledBrowsers() -> Vec<AppTargetInfo> {
    #[cfg(target_os = "windows")]
    {
        return queryWindowsDefaultApp("browser");
    }

    #[cfg(not(target_os = "windows"))]
    {
    let mut apps = Vec::new();
    apps.push(AppTargetInfo {
        id: "default_browser".to_string(),
        name: "System Default Browser".to_string(),
        category: CATEGORY_BROWSER.to_string(),
        iconDataUri: None,
        isDefault: true,
    });
    apps
    }
}

#[cfg(target_os = "windows")]
fn queryWindowsDefaultApp(category: &str) -> Vec<AppTargetInfo> {
    let (association_key, association_value) = match category {
        "ide" => (r"HKCR\.txt", "/ve"),
        "email" => (r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoice", "/v ProgId"),
        "browser" => (r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice", "/v ProgId"),
        _ => return Vec::new(),
    };
    let Some(program_id) = queryRegistryValue(association_key, association_value) else {
        return Vec::new();
    };
    let command_key = format!(r"HKCR\{}\shell\open\command", program_id);
    let Some(command_line) = queryRegistryValue(&command_key, "/ve") else {
        return Vec::new();
    };
    let Some(executable) = parseExecutablePath(&command_line) else {
        return Vec::new();
    };
    let name = describeWindowsApp(category, &program_id, &executable);
    let iconDataUri = extractWindowsIcon(&executable);

    vec![AppTargetInfo {
        id: executable,
        name,
        category: category.to_string(),
        iconDataUri,
        isDefault: true,
    }]
}

#[cfg(target_os = "windows")]
fn queryRegistryValue(key: &str, value_argument: &str) -> Option<String> {
    let mut command = Command::new("reg.exe");
    command.args(["query", key]);
    if value_argument == "/ve" {
        command.arg("/ve");
    } else {
        command.args(["/v", value_argument.trim_start_matches("/v ")]);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let output = String::from_utf8_lossy(&output.stdout);
    output.lines().find_map(|line| {
        let (_, value) = line.split_once("REG_SZ")?;
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

#[cfg(target_os = "windows")]
fn parseExecutablePath(command_line: &str) -> Option<String> {
    let command_line = command_line.trim();
    if let Some(quoted_path) = command_line.strip_prefix('"') {
        return quoted_path.split_once('"').map(|(path, _)| path.to_string());
    }
    command_line.split_whitespace().next().map(str::to_string)
}

#[cfg(target_os = "windows")]
fn describeWindowsApp(category: &str, program_id: &str, executable: &str) -> String {
    let normalized = format!("{} {}", program_id, executable).to_lowercase();
    for (needle, name) in [
        ("code", "Visual Studio Code"),
        ("cursor", "Cursor"),
        ("windsurf", "Windsurf"),
        ("chrome", "Google Chrome"),
        ("firefox", "Firefox"),
        ("msedge", "Microsoft Edge"),
        ("outlook", "Outlook"),
        ("thunderbird", "Thunderbird"),
    ] {
        if normalized.contains(needle) {
            return name.to_string();
        }
    }
    let application_type = match category {
        "ide" => "Default editor",
        "email" => "Default mail app",
        _ => "Default browser",
    };
    application_type.to_string()
}

#[cfg(target_os = "windows")]
fn extractWindowsIcon(executable: &str) -> Option<String> {
    let script = "$p=$args[0]; Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Icon]::ExtractAssociatedIcon($p); if ($null -eq $i) { exit 1 }; $b=$i.ToBitmap(); $m=New-Object System.IO.MemoryStream; $b.Save($m,[System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray())";
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script, executable])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let base64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!base64.is_empty()).then(|| format!("data:image/png;base64,{}", base64))
}
