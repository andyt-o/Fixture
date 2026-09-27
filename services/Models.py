# === Imports ===
from typing import List, Optional
from pydantic import BaseModel, Field

# === Types ===
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    provider: Optional[str] = Field(default="openai")
    modelName: Optional[str] = Field(default="gpt-4o")
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    projectId: Optional[str] = None
    spaceId: Optional[str] = None
    serviceInstanceId: Optional[str] = None
    assistantId: Optional[str] = None
    fallbackProvider: Optional[str] = None
    fallbackApiKey: Optional[str] = None
    fallbackModelName: Optional[str] = None
    fallbackBaseUrl: Optional[str] = None
    fallbackProjectId: Optional[str] = None
    enableFallback: bool = Field(default=True)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    maxTokens: Optional[int] = None

class ChatResponse(BaseModel):
    reply: str
    modelUsed: str
    providerUsed: str = Field(default="openai")
    fallbackTriggered: bool = Field(default=False)
    fallbackReason: Optional[str] = None
    tokensPrompt: Optional[int] = 0
    tokensCompletion: Optional[int] = 0

class HealthResponse(BaseModel):
    status: str
    port: int

class ModelsResponse(BaseModel):
    provider: str
    models: List[str]
