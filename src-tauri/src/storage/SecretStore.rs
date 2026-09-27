// ==============================================================================
// Imports
// ==============================================================================
use keyring::Entry;

// ==============================================================================
// Types
// ==============================================================================
pub struct SecretStore {
    serviceName: String,
}

// ==============================================================================
// Constants
// ==============================================================================
pub const KEYRING_SERVICE_NAME: &str = "com.fixture.app";

pub const KNOWN_ACCOUNTS: &[&str] = &[
    "slack_access_token",
    "slack_refresh_token",
    "discord_access_token",
    "discord_refresh_token",
    "teams_access_token",
    "teams_refresh_token",
    "jira_access_token",
    "jira_refresh_token",
    "api_key",
    "openai_gateway_key",
    "watsonx_cloud_key",
    "llm_provider_priority",
];

// ==============================================================================
// Functions
// ==============================================================================
impl SecretStore {
    // Initializes the SecretStore instance with default service name
    pub fn new() -> Self {
        Self {
            serviceName: KEYRING_SERVICE_NAME.to_string(),
        }
    }

    // Stores a secret value for the specified account in system keyring
    pub fn setSecret(&self, account: &str, secret: &str) -> Result<(), String> {
        let entry = Entry::new(&self.serviceName, account)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        entry
            .set_password(secret)
            .map_err(|e| format!("Failed to set keyring password: {}", e))
    }

    // Retrieves a secret value for the specified account
    pub fn getSecret(&self, account: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(&self.serviceName, account)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        match entry.get_password() {
            Ok(pwd) => Ok(Some(pwd)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve keyring password: {}", e)),
        }
    }

    // Removes a secret entry for the specified account
    pub fn deleteSecret(&self, account: &str) -> Result<(), String> {
        let entry = Entry::new(&self.serviceName, account)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete keyring password: {}", e)),
        }
    }

    // Purges all known credential accounts from the system keyring
    pub fn clearAllSecrets(&self) -> Result<usize, String> {
        let mut count = 0;
        for account in KNOWN_ACCOUNTS {
            let entry = Entry::new(&self.serviceName, account)
                .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
            if let Ok(_) = entry.delete_credential() {
                count += 1;
            }
        }
        Ok(count)
    }
}
