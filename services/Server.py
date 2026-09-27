# === Imports ===
import os
import sys
from pathlib import Path

serviceDir = Path(__file__).resolve().parent
repoRoot = serviceDir.parent
if str(repoRoot) not in sys.path:
    sys.path.insert(0, str(repoRoot))
if str(serviceDir) not in sys.path:
    sys.path.insert(0, str(serviceDir))

from typing import Optional
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from services.ChatRouter import executeChat, fetchAvailableModels
    from services.Models import ChatRequest, ChatResponse, HealthResponse, ModelsResponse
    from services.Security import InternalTokenMiddleware
except ImportError:
    from ChatRouter import executeChat, fetchAvailableModels
    from Models import ChatRequest, ChatResponse, HealthResponse, ModelsResponse
    from Security import InternalTokenMiddleware

# === Types ===
# Server specific composite structures if needed.

# === Constants ===
SERVER_HOST = "127.0.0.1"
DEFAULT_SERVER_PORT = 8765
ALLOWED_ORIGINS = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
]

# === Functions ===
# Instantiates and configures the FastAPI application with security middlewares and routes.
def createApplication() -> FastAPI:
    appInstance = FastAPI(
        title="Fixture LLM Microservice",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
    )

    appInstance.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    appInstance.add_middleware(InternalTokenMiddleware)

    @appInstance.get("/health", response_model=HealthResponse)
    async def getHealth() -> HealthResponse:
        currentPort = int(os.environ.get("FIXTURE_SERVER_PORT", str(DEFAULT_SERVER_PORT)))
        return HealthResponse(status="healthy", port=currentPort)

    @appInstance.get("/api/models", response_model=ModelsResponse)
    async def getModels(
        provider: str = "openai",
        apiKey: Optional[str] = None,
        baseUrl: Optional[str] = None,
    ) -> ModelsResponse:
        modelList = await fetchAvailableModels(provider=provider, apiKey=apiKey, baseUrl=baseUrl)
        return ModelsResponse(provider=provider, models=modelList)

    @appInstance.post("/api/chat", response_model=ChatResponse)
    async def postChat(request: ChatRequest) -> ChatResponse:
        try:
            return await executeChat(request)
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Inference error: {str(error)}"
            ) from error

    return appInstance

# Launches the Uvicorn ASGI server bound strictly to the local loopback interface.
def startServer() -> None:
    listenPort = int(os.environ.get("FIXTURE_SERVER_PORT", str(DEFAULT_SERVER_PORT)))
    uvicorn.run(
        "services.Server:app",
        host=SERVER_HOST,
        port=listenPort,
        log_level="info",
        reload=False,
    )

# === Mount ===
app = createApplication()

# === Run ===
if __name__ == "__main__":
    startServer()
