// ==============================================================================
// Imports
// ==============================================================================
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use oauth2::PkceCodeChallenge;

// ==============================================================================
// Types
// ==============================================================================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OAuthProvider {
    Slack,
    Discord,
    MicrosoftTeams,
    Jira,
    ApiToken,
    Ide,
    Browser,
    Email,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUrlPayload {
    pub authUrl: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenExchangeResult {
    pub provider: OAuthProvider,
    pub accessToken: String,
    pub refreshToken: Option<String>,
    pub expiresIn: Option<u64>,
}

#[derive(Debug, Clone)]
pub(crate) struct PendingOAuthSession {
    pub provider: OAuthProvider,
    pub pkceVerifier: String,
}

// Global thread-safe state storing in-flight OAuth sessions awaiting callback
pub(crate) type OAuthStateStore = Arc<Mutex<HashMap<String, PendingOAuthSession>>>;

// ==============================================================================
// Constants
// ==============================================================================
pub const SLACK_AUTH_URL: &str = "https://slack.com/oauth/v2/authorize";
pub const SLACK_TOKEN_URL: &str = "https://slack.com/api/oauth.v2.access";

pub const DISCORD_AUTH_URL: &str = "https://discord.com/api/oauth2/authorize";
pub const DISCORD_TOKEN_URL: &str = "https://discord.com/api/oauth2/token";

pub const TEAMS_AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
pub const TEAMS_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

pub const JIRA_AUTH_URL: &str = "https://auth.atlassian.com/authorize";
pub const JIRA_TOKEN_URL: &str = "https://oauth.atlassian.com/oauth/token";

pub const DEFAULT_REDIRECT_URI: &str = "http://127.0.0.1:41423/callback";

// ==============================================================================
// Functions
// ==============================================================================

// Creates an empty state store for pending OAuth authorizations
pub(crate) fn createOAuthStateStore() -> OAuthStateStore {
    Arc::new(Mutex::new(HashMap::new()))
}

// Generates authorization link with PKCE and stores state
pub(crate) async fn generateAuthUrl(
    provider: OAuthProvider,
    clientId: &str,
    redirectUri: Option<&str>,
    store: &OAuthStateStore,
) -> Result<AuthUrlPayload, String> {
    let state = format!("{}_{}", format!("{:?}", provider).to_lowercase(), uuid_v4_simple());
    let (pkceChallenge, pkceVerifier) = PkceCodeChallenge::new_random_sha256();
    let challenge = pkceChallenge.as_str();
    let redirect = redirectUri.unwrap_or(DEFAULT_REDIRECT_URI);

    let authUrl = match provider {
        OAuthProvider::Slack => {
            format!(
                "{}?client_id={}&scope=channels:read,chat:write,users:read&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
                SLACK_AUTH_URL, clientId, urlencoding_encode(redirect), state, challenge
            )
        }
        OAuthProvider::Discord => {
            format!(
                "{}?client_id={}&response_type=code&scope=identify%20guilds%20messages.read&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
                DISCORD_AUTH_URL, clientId, urlencoding_encode(redirect), state, challenge
            )
        }
        OAuthProvider::MicrosoftTeams => {
            format!(
                "{}?client_id={}&response_type=code&scope=User.Read%20ChatMessage.Read%20offline_access&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
                TEAMS_AUTH_URL, clientId, urlencoding_encode(redirect), state, challenge
            )
        }
        OAuthProvider::Jira => {
            format!(
                "{}?audience=api.atlassian.com&client_id={}&scope=read:jira-user%20read:jira-work&redirect_uri={}&state={}&response_type=code&prompt=consent&code_challenge={}&code_challenge_method=S256",
                JIRA_AUTH_URL, clientId, urlencoding_encode(redirect), state, challenge
            )
        }
        _ => return Err(format!("OAuth not supported for provider: {:?}", provider)),
    };

    let session = PendingOAuthSession {
        provider,
        pkceVerifier: pkceVerifier.secret().clone(),
    };

    let mut sessions = store.lock().await;
    sessions.insert(state.clone(), session);

    Ok(AuthUrlPayload { authUrl, state })
}

// Exchanges authorization code with provider token endpoint
pub(crate) async fn exchangeAuthCode(
    provider: OAuthProvider,
    clientId: &str,
    clientSecret: &str,
    code: &str,
    state: &str,
    redirectUri: Option<&str>,
    store: &OAuthStateStore,
) -> Result<TokenExchangeResult, String> {
    let session = {
        let mut sessions = store.lock().await;
        sessions.remove(state).ok_or_else(|| "Invalid or expired OAuth state token".to_string())?
    };

    if session.provider != provider {
        return Err("OAuth provider mismatch for state".to_string());
    }

    let redirect = redirectUri.unwrap_or(DEFAULT_REDIRECT_URI);
    let client = reqwest::Client::new();

    match provider {
        OAuthProvider::Slack => {
            let params = [
                ("client_id", clientId),
                ("client_secret", clientSecret),
                ("code", code),
                ("redirect_uri", redirect),
                ("code_verifier", session.pkceVerifier.as_str()),
            ];

            let res = client
                .post(SLACK_TOKEN_URL)
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Slack token exchange failed: {}", e))?;

            let json: serde_json::Value = res
                .json()
                .await
                .map_err(|e| format!("Failed to parse Slack response: {}", e))?;

            if json.get("ok").and_then(|v| v.as_bool()) != Some(true) {
                let err_msg = json.get("error").and_then(|v| v.as_str()).unwrap_or("unknown_error");
                return Err(format!("Slack OAuth error: {}", err_msg));
            }

            let accessToken = json
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing access_token in Slack response".to_string())?
                .to_string();

            Ok(TokenExchangeResult {
                provider,
                accessToken,
                refreshToken: None,
                expiresIn: None,
            })
        }
        OAuthProvider::Discord => {
            let params = [
                ("client_id", clientId),
                ("client_secret", clientSecret),
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect),
                ("code_verifier", session.pkceVerifier.as_str()),
            ];

            let res = client
                .post(DISCORD_TOKEN_URL)
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Discord token exchange failed: {}", e))?;

            let json: serde_json::Value = res
                .json()
                .await
                .map_err(|e| format!("Failed to parse Discord response: {}", e))?;

            let accessToken = json
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing access_token in Discord response".to_string())?
                .to_string();

            let refreshToken = json
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let expiresIn = json.get("expires_in").and_then(|v| v.as_u64());

            Ok(TokenExchangeResult {
                provider,
                accessToken,
                refreshToken,
                expiresIn,
            })
        }
        OAuthProvider::MicrosoftTeams => {
            let params = [
                ("client_id", clientId),
                ("client_secret", clientSecret),
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", redirect),
                ("code_verifier", session.pkceVerifier.as_str()),
            ];

            let res = client
                .post(TEAMS_TOKEN_URL)
                .form(&params)
                .send()
                .await
                .map_err(|e| format!("Microsoft Teams token exchange failed: {}", e))?;

            let json: serde_json::Value = res
                .json()
                .await
                .map_err(|e| format!("Failed to parse Teams response: {}", e))?;

            let accessToken = json
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing access_token in Teams response".to_string())?
                .to_string();

            let refreshToken = json
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let expiresIn = json.get("expires_in").and_then(|v| v.as_u64());

            Ok(TokenExchangeResult {
                provider,
                accessToken,
                refreshToken,
                expiresIn,
            })
        }
        OAuthProvider::Jira => {
            let payload = serde_json::json!({
                "grant_type": "authorization_code",
                "client_id": clientId,
                "client_secret": clientSecret,
                "code": code,
                "redirect_uri": redirect,
                "code_verifier": session.pkceVerifier,
            });

            let res = client
                .post(JIRA_TOKEN_URL)
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Jira token exchange failed: {}", e))?;

            let json: serde_json::Value = res
                .json()
                .await
                .map_err(|e| format!("Failed to parse Jira response: {}", e))?;

            let accessToken = json
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing access_token in Jira response".to_string())?
                .to_string();

            let refreshToken = json
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let expiresIn = json.get("expires_in").and_then(|v| v.as_u64());

            Ok(TokenExchangeResult {
                provider,
                accessToken,
                refreshToken,
                expiresIn,
            })
        }
        _ => Err(format!("Token exchange not implemented for: {:?}", provider)),
    }
}

// Fallback simple pseudorandom token generator avoiding additional dependency
fn uuid_v4_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{:016x}{:016x}", nanos, nanos.wrapping_mul(6364136223846793005))
}

// Percent-encodes characters for URL parameters
fn urlencoding_encode(s: &str) -> String {
    let mut encoded = String::new();
    for byte in s.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}
