# === Imports ===
import hmac
import os
import re
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# === Types ===
class InternalTokenMiddleware(BaseHTTPMiddleware):
    # Validates internal session token passed by the Rust backend to prevent unauthorized local process access.
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)
        expectedToken = os.environ.get(ENV_TOKEN_KEY, "")
        if expectedToken:
            clientToken = request.headers.get(INTERNAL_TOKEN_HEADER, "")
            if not verifyInternalToken(clientToken, expectedToken):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Unauthorized: Invalid internal session token"}
                )
        return await call_next(request)

class RedactionFilter:
    # Provides pattern matching and redaction utilities for sensitive tokens and system paths.
    @staticmethod
    def sanitize(text: str) -> str:
        return sanitizeContent(text)

# === Constants ===
INTERNAL_TOKEN_HEADER = "X-Fixture-Internal-Token"
ENV_TOKEN_KEY = "FIXTURE_INTERNAL_TOKEN"

UNIFIED_SENSITIVE_KEY_REGEX = re.compile(
    r"(?:"
    r"sk-[a-zA-Z0-9_-]{20,}"
    r"|gh[pousr]_[a-zA-Z0-9]{36,}"
    r"|github_pat_[a-zA-Z0-9_]{22,}"
    r"|hf_[a-zA-Z0-9]{34,}"
    r"|xox[baprs]-[0-9a-zA-Z-]{20,}"
    r"|(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24,}"
    r"|(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}"
    r"|AIza[0-9A-Za-z\-_]{35}"
    r"|glpat-[a-zA-Z0-9\-=_]{20,}"
    r"|npm_[a-zA-Z0-9]{36,}"
    r")"
)

BEARER_TOKEN_REGEX = re.compile(r"Bearer\s+[a-zA-Z0-9_\-\.]{20,}", re.IGNORECASE)
FILE_PATH_REGEX = re.compile(r"(/[a-zA-Z0-9_.-]+){3,}|[a-zA-Z]:\\[a-zA-Z0-9_.\\]+")

# === Functions ===
# Scrubs known SaaS API keys, bearer tokens, and private absolute file paths from text in a single pass.
def sanitizeContent(text: str) -> str:
    if not text:
        return text
    sanitized = UNIFIED_SENSITIVE_KEY_REGEX.sub("[REDACTED_API_KEY]", text)
    sanitized = BEARER_TOKEN_REGEX.sub("Bearer [REDACTED_TOKEN]", sanitized)
    sanitized = FILE_PATH_REGEX.sub("[REDACTED_PATH]", sanitized)
    return sanitized

# Performs constant-time comparison of session secrets.
def verifyInternalToken(providedToken: str, expectedToken: str) -> bool:
    if not providedToken or not expectedToken:
        return False
    return hmac.compare_digest(providedToken.strip(), expectedToken.strip())
