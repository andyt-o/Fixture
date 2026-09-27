# === Imports ===
import hashlib
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

serviceDir = Path(__file__).resolve().parent
repoRoot = serviceDir.parent
if str(repoRoot) not in sys.path:
    sys.path.insert(0, str(repoRoot))
if str(serviceDir) not in sys.path:
    sys.path.insert(0, str(serviceDir))

import httpx
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

try:
    from services.Models import ChatMessage, ChatRequest, ChatResponse
    from services.Security import sanitizeContent
except ImportError:
    from Models import ChatMessage, ChatRequest, ChatResponse
    from Security import sanitizeContent

# === Types ===
# Holds operational configurations or graph state if required.

# === Constants ===
DEFAULT_MODEL_NAME = "gpt-4o"
DEFAULT_WATSONX_MODEL = "ibm/granite-3-8b-instruct"
DEFAULT_WATSONX_URL = "https://us-south.ml.cloud.ibm.com"
DEFAULT_ORCHESTRATE_URL = "https://api.orchestrate.watsonx.ibm.com"
DEFAULT_TIMEOUT_SECONDS = 60.0
FALLBACK_LOCAL_KEY = "local-environment-token"
IBM_IAM_TOKEN_URL = "https://iam.cloud.ibm.com/identity/token"
IAM_TOKEN_EXPIRY_BUFFER_SECONDS = 120

iamTokenCache: Dict[str, Dict[str, Any]] = {}

# === Functions ===
# Dynamically configures a ChatOpenAI client supporting cloud OpenAI or local OpenAI-compatible endpoints.
def buildChatModel(
    request: ChatRequest,
    apiKeyOverride: Optional[str] = None,
    baseUrlOverride: Optional[str] = None,
    modelNameOverride: Optional[str] = None,
) -> ChatOpenAI:
    resolvedApiKey = apiKeyOverride or request.apiKey or FALLBACK_LOCAL_KEY
    resolvedBaseUrl = baseUrlOverride or request.baseUrl
    resolvedModel = modelNameOverride or request.modelName or DEFAULT_MODEL_NAME

    if resolvedBaseUrl:
        return ChatOpenAI(
            model=resolvedModel,
            base_url=resolvedBaseUrl,
            api_key=resolvedApiKey,
            temperature=request.temperature,
            max_tokens=request.maxTokens,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
    return ChatOpenAI(
        model=resolvedModel,
        api_key=resolvedApiKey,
        temperature=request.temperature,
        max_tokens=request.maxTokens,
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )

# Converts incoming message schemas into LangChain core messages.
def convertToLangchainMessages(request: ChatRequest) -> List[BaseMessage]:
    messages: List[BaseMessage] = []
    if request.messages:
        for item in request.messages:
            if item.role.lower() == "system":
                messages.append(SystemMessage(content=item.content))
            elif item.role.lower() == "assistant":
                messages.append(AIMessage(content=item.content))
            else:
                messages.append(HumanMessage(content=item.content))
    if request.prompt and (not messages or messages[-1].content != request.prompt):
        messages.append(HumanMessage(content=request.prompt))
    return messages

# Exchanges an IBM Cloud API key for an ephemeral IAM access token with in-memory TTL caching.
async def exchangeIbmIamToken(apiKey: str) -> str:
    cleanedKey = apiKey.strip()
    cacheKey = hashlib.sha256(cleanedKey.encode()).hexdigest()
    currentTime = time.time()

    if cacheKey in iamTokenCache:
        cachedEntry = iamTokenCache[cacheKey]
        if currentTime < cachedEntry.get("expiresAt", 0):
            return str(cachedEntry.get("accessToken", ""))

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        tokenResponse = await client.post(
            IBM_IAM_TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": cleanedKey,
            },
        )
        if not tokenResponse.is_success:
            errMsg = tokenResponse.text
            try:
                errJson = tokenResponse.json()
                errMsg = errJson.get("errorMessage") or errJson.get("message") or errMsg
            except Exception:
                pass
            raise RuntimeError(f"IBM IAM authentication failed ({tokenResponse.status_code}): {sanitizeContent(str(errMsg))}")

        tokenPayload = tokenResponse.json()
        accessToken = str(tokenPayload.get("access_token", ""))
        expiresIn = int(tokenPayload.get("expires_in", 3600))
        iamTokenCache[cacheKey] = {
            "accessToken": accessToken,
            "expiresAt": currentTime + expiresIn - IAM_TOKEN_EXPIRY_BUFFER_SECONDS,
        }
        return accessToken

# Executes inference via standard OpenAI or local OpenAI-compatible endpoints.
async def executeOpenAiChat(
    request: ChatRequest,
    apiKeyOverride: Optional[str] = None,
    baseUrlOverride: Optional[str] = None,
    modelNameOverride: Optional[str] = None,
) -> ChatResponse:
    chatModel = buildChatModel(
        request,
        apiKeyOverride=apiKeyOverride,
        baseUrlOverride=baseUrlOverride,
        modelNameOverride=modelNameOverride,
    )
    langchainMessages = convertToLangchainMessages(request)
    llmResult = await chatModel.ainvoke(langchainMessages)
    rawReply = llmResult.content if isinstance(llmResult.content, str) else str(llmResult.content)
    cleanReply = sanitizeContent(rawReply)
    usageMetadata = getattr(llmResult, "usage_metadata", {}) or {}
    promptTokens = usageMetadata.get("input_tokens", 0)
    completionTokens = usageMetadata.get("output_tokens", 0)
    return ChatResponse(
        reply=cleanReply,
        modelUsed=modelNameOverride or request.modelName or DEFAULT_MODEL_NAME,
        providerUsed="openai",
        fallbackTriggered=False,
        tokensPrompt=promptTokens,
        tokensCompletion=completionTokens,
    )

# Executes inference against IBM Watsonx.ai chat API using IAM authentication with project resolution.
async def executeWatsonxChat(
    request: ChatRequest,
    apiKeyOverride: Optional[str] = None,
    baseUrlOverride: Optional[str] = None,
    modelNameOverride: Optional[str] = None,
    projectIdOverride: Optional[str] = None,
) -> ChatResponse:
    baseUrl = (baseUrlOverride or request.baseUrl or os.environ.get("WATSONX_URL") or DEFAULT_WATSONX_URL).rstrip("/")
    rawKey = apiKeyOverride or request.apiKey or ""
    if not rawKey:
        raise ValueError("IBM Cloud API key is missing for Watsonx provider")

    if rawKey.startswith("Bearer "):
        authToken = rawKey[7:]
    else:
        authToken = await exchangeIbmIamToken(rawKey)

    messagesPayload = []
    if request.messages:
        for item in request.messages:
            messagesPayload.append({"role": item.role, "content": item.content})
    if request.prompt and (not messagesPayload or messagesPayload[-1].get("content") != request.prompt):
        messagesPayload.append({"role": "user", "content": request.prompt})

    modelId = modelNameOverride or request.modelName or DEFAULT_WATSONX_MODEL
    requestBody: Dict[str, Any] = {
        "model_id": modelId,
        "messages": messagesPayload,
        "parameters": {
            "temperature": request.temperature,
            "max_new_tokens": request.maxTokens or 1024,
        },
    }

    resolvedProjectId = (
        projectIdOverride
        or request.projectId
        or os.environ.get("WATSONX_PROJECT_ID")
        or os.environ.get("IBM_PROJECT_ID")
    )
    resolvedSpaceId = (
        request.spaceId
        or os.environ.get("WATSONX_SPACE_ID")
        or os.environ.get("IBM_SPACE_ID")
    )

    if resolvedProjectId:
        requestBody["project_id"] = resolvedProjectId
    elif resolvedSpaceId:
        requestBody["space_id"] = resolvedSpaceId
    else:
        raise ValueError("IBM Watsonx requires a project_id or space_id (configure via request or WATSONX_PROJECT_ID)")

    chatEndpoint = f"{baseUrl}/ml/v1/text/chat?version=2024-03-14"
    headers = {
        "Authorization": f"Bearer {authToken}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        apiResponse = await client.post(chatEndpoint, headers=headers, json=requestBody)
        if not apiResponse.is_success:
            errMsg = apiResponse.text
            try:
                errJson = apiResponse.json()
                if "errors" in errJson and isinstance(errJson["errors"], list) and errJson["errors"]:
                    errMsg = errJson["errors"][0].get("message", errMsg)
                elif "message" in errJson:
                    errMsg = errJson["message"]
            except Exception:
                pass
            raise RuntimeError(f"IBM Watsonx API error ({apiResponse.status_code}): {sanitizeContent(str(errMsg))}")

        responseData = apiResponse.json()

    choices = responseData.get("choices", [])
    extractedReply = ""
    if choices and isinstance(choices, list):
        messageObj = choices[0].get("message", {})
        extractedReply = messageObj.get("content", "")
    elif "results" in responseData:
        resultsList = responseData.get("results", [])
        if resultsList:
            extractedReply = resultsList[0].get("generated_text", "")

    usage = responseData.get("usage", {})
    promptTokens = usage.get("prompt_tokens") or usage.get("input_token_count", 0)
    completionTokens = usage.get("completion_tokens") or usage.get("output_token_count", 0)

    return ChatResponse(
        reply=sanitizeContent(extractedReply),
        modelUsed=modelId,
        providerUsed="watsonx",
        fallbackTriggered=False,
        tokensPrompt=promptTokens,
        tokensCompletion=completionTokens,
    )

# Executes skill and assistant orchestration via IBM Watsonx Orchestrate.
async def executeWatsonxOrchestrateChat(
    request: ChatRequest,
    apiKeyOverride: Optional[str] = None,
    baseUrlOverride: Optional[str] = None,
    assistantIdOverride: Optional[str] = None,
) -> ChatResponse:
    baseUrl = (baseUrlOverride or request.baseUrl or os.environ.get("ORCHESTRATE_URL") or DEFAULT_ORCHESTRATE_URL).rstrip("/")
    rawKey = apiKeyOverride or request.apiKey or ""
    if not rawKey:
        raise ValueError("API key is missing for Watsonx Orchestrate provider")

    if rawKey.startswith("Bearer "):
        authToken = rawKey[7:]
    else:
        authToken = await exchangeIbmIamToken(rawKey)

    userMessage = request.prompt or ""
    if not userMessage and request.messages:
        userMessage = request.messages[-1].content

    assistantId = assistantIdOverride or request.assistantId or os.environ.get("WATSONX_ASSISTANT_ID") or "default-assistant"
    orchestrateEndpoint = f"{baseUrl}/v1/assistants/{assistantId}/runs"
    orchestratePayload: Dict[str, Any] = {
        "input": {"text": userMessage},
        "stream": False,
    }
    if request.serviceInstanceId:
        orchestratePayload["service_instance_id"] = request.serviceInstanceId

    headers = {
        "Authorization": f"Bearer {authToken}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
        apiResponse = await client.post(orchestrateEndpoint, headers=headers, json=orchestratePayload)
        if not apiResponse.is_success:
            errMsg = apiResponse.text
            try:
                errJson = apiResponse.json()
                errMsg = errJson.get("message") or errJson.get("errorMessage") or errMsg
            except Exception:
                pass
            raise RuntimeError(f"Watsonx Orchestrate error ({apiResponse.status_code}): {sanitizeContent(str(errMsg))}")

        responseData = apiResponse.json()

    rawOutput = (
        responseData.get("output", {}).get("text")
        or responseData.get("response", "")
        or str(responseData)
    )
    return ChatResponse(
        reply=sanitizeContent(str(rawOutput)),
        modelUsed=f"watsonx-orchestrate:{assistantId}",
        providerUsed="watsonx_orchestrate",
        fallbackTriggered=False,
        tokensPrompt=0,
        tokensCompletion=0,
    )

# Dispatches a request to a designated provider with specific credential overrides.
async def dispatchProvider(
    providerName: str,
    request: ChatRequest,
    isFallback: bool = False,
) -> ChatResponse:
    normalized = providerName.lower().strip()
    apiKey = request.fallbackApiKey if isFallback else request.apiKey
    baseUrl = request.fallbackBaseUrl if isFallback else request.baseUrl
    modelName = request.fallbackModelName if isFallback else request.modelName
    projectId = request.fallbackProjectId if isFallback else request.projectId

    if normalized == "watsonx":
        return await executeWatsonxChat(
            request,
            apiKeyOverride=apiKey,
            baseUrlOverride=baseUrl,
            modelNameOverride=modelName or DEFAULT_WATSONX_MODEL,
            projectIdOverride=projectId,
        )
    if normalized in ("watsonx_orchestrate", "orchestrate"):
        return await executeWatsonxOrchestrateChat(
            request,
            apiKeyOverride=apiKey,
            baseUrlOverride=baseUrl,
        )
    return await executeOpenAiChat(
        request,
        apiKeyOverride=apiKey,
        baseUrlOverride=baseUrl,
        modelNameOverride=modelName or DEFAULT_MODEL_NAME,
    )

# Orchestrates prioritized execution and seamless failover to secondary credentials upon failure.
async def executeChat(request: ChatRequest) -> ChatResponse:
    primaryProvider = (request.provider or "openai").lower().strip()
    try:
        primaryResult = await dispatchProvider(primaryProvider, request, isFallback=False)
        primaryResult.providerUsed = primaryProvider
        primaryResult.fallbackTriggered = False
        return primaryResult
    except Exception as primaryError:
        sanitizedPrimaryError = sanitizeContent(str(primaryError))
        fallbackProvider = (
            request.fallbackProvider
            or ("watsonx" if primaryProvider == "openai" else "openai")
        ).lower().strip()

        hasFallbackKey = bool(request.fallbackApiKey)
        if request.enableFallback and hasFallbackKey and fallbackProvider != primaryProvider:
            try:
                fallbackResult = await dispatchProvider(fallbackProvider, request, isFallback=True)
                fallbackResult.providerUsed = fallbackProvider
                fallbackResult.fallbackTriggered = True
                fallbackResult.fallbackReason = sanitizedPrimaryError
                return fallbackResult
            except Exception as fallbackError:
                sanitizedFallbackError = sanitizeContent(str(fallbackError))
                raise RuntimeError(
                    f"Primary provider ({primaryProvider}) failed: {sanitizedPrimaryError}. "
                    f"Fallback provider ({fallbackProvider}) also failed: {sanitizedFallbackError}."
                ) from fallbackError

        raise primaryError

# Fetches available model identifiers from the target provider or returns built-in curated defaults.
async def fetchAvailableModels(
    provider: str = "openai",
    apiKey: Optional[str] = None,
    baseUrl: Optional[str] = None,
) -> List[str]:
    normalized = provider.lower().strip()
    if normalized == "watsonx":
        curatedWatsonx = [
            "ibm/granite-3-8b-instruct",
            "ibm/granite-13b-chat-v2",
            "meta-llama/llama-3-3-70b-instruct",
            "meta-llama/llama-3-1-8b-instruct",
            "mistralai/mistral-large",
        ]
        if not apiKey:
            return curatedWatsonx
        try:
            authToken = apiKey[7:] if apiKey.startswith("Bearer ") else await exchangeIbmIamToken(apiKey)
            targetUrl = (baseUrl or os.environ.get("WATSONX_URL") or DEFAULT_WATSONX_URL).rstrip("/")
            specsUrl = f"{targetUrl}/ml/v1/foundation_model_specs?version=2024-03-14"
            headers = {"Authorization": f"Bearer {authToken}", "Accept": "application/json"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(specsUrl, headers=headers)
                if res.is_success:
                    resources = res.json().get("resources", [])
                    extracted = [m["model_id"] for m in resources if "model_id" in m]
                    return extracted if extracted else curatedWatsonx
        except Exception:
            pass
        return curatedWatsonx

    curatedOpenAi = [
        "gpt-4o",
        "gpt-4o-mini",
        "o1",
        "o3-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
    ]
    targetBaseUrl = (baseUrl or "https://api.openai.com/v1").rstrip("/")
    resolvedKey = apiKey or os.environ.get("OPENAI_API_KEY")
    if not resolvedKey and "localhost" not in targetBaseUrl and "127.0.0.1" not in targetBaseUrl:
        return curatedOpenAi

    try:
        modelsUrl = f"{targetBaseUrl}/models"
        headers = {"Authorization": f"Bearer {resolvedKey or 'local'}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(modelsUrl, headers=headers)
            if res.is_success:
                dataList = res.json().get("data", [])
                extracted = [m["id"] for m in dataList if "id" in m]
                return extracted if extracted else curatedOpenAi
    except Exception:
        pass
    return curatedOpenAi
