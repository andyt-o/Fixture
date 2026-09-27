// ==============================================================================
// Imports
// ==============================================================================
use std::process::{Child, Command};
use std::sync::Arc;
use tokio::sync::Mutex;

// ==============================================================================
// Types
// ==============================================================================
#[derive(Clone)]
pub struct ProcessManager {
    child: Arc<Mutex<Option<Child>>>,
    sessionToken: Arc<Mutex<Option<String>>>,
}

// ==============================================================================
// Constants
// ==============================================================================
pub const DEFAULT_SERVER_PORT: u16 = 8765;

// ==============================================================================
// Functions
// ==============================================================================
impl ProcessManager {
    // Instantiates a new ProcessManager
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            sessionToken: Arc::new(Mutex::new(None)),
        }
    }

    // Lazily spawns the Python FastAPI microservice if not already running
    pub async fn ensureRunning(&self) -> Result<String, String> {
        let mut childLock = self.child.lock().await;
        let mut tokenLock = self.sessionToken.lock().await;

        if childLock.is_some() {
            if let Some(token) = tokenLock.as_ref() {
                return Ok(token.clone());
            }
        }

        let token = generateSessionToken();

        let pythonBin = if cfg!(target_os = "windows") {
            ".venv/Scripts/python.exe"
        } else {
            ".venv/bin/python"
        };

        let child = Command::new(pythonBin)
            .args(["-m", "services.Server"])
            .env("FIXTURE_INTERNAL_TOKEN", &token)
            .env("FIXTURE_SERVER_PORT", DEFAULT_SERVER_PORT.to_string())
            .spawn()
            .map_err(|e| format!("Failed to spawn Python microservice sidecar: {}", e))?;

        *childLock = Some(child);
        *tokenLock = Some(token.clone());

        Ok(token)
    }

    // Gracefully terminates the child process if active
    pub async fn stop(&self) {
        let mut childLock = self.child.lock().await;
        let mut tokenLock = self.sessionToken.lock().await;

        if let Some(mut child) = childLock.take() {
            let _ = child.kill();
        }
        *tokenLock = None;
    }
}

// Generates an ephemeral random session secret
fn generateSessionToken() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{:016x}{:016x}", nanos, nanos.wrapping_mul(6364136223846793005))
}
