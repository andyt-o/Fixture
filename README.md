# Fixture

A Tauri v2 desktop overlay application that unifies team communication (Slack, Discord, Microsoft Teams), issue tracking (Jira), and LLM-powered agent interaction (IBM Watsonx, OpenAI) into a lightweight, non-intrusive screen overlay.

---

## Prerequisites

- **Node.js** — v20 or later
- **Rust** — stable toolchain via [rustup](https://rustup.rs)
- **Python** — 3.12 (pinned in `.python-version`)
- **uv** — Python package manager: `pip install uv` or see the [install guide](https://docs.astral.sh/uv/getting-started/installation/)
- **Tauri system dependencies** — WebView2 on Windows, webkit2gtk on Linux, WebKit on macOS. See the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

---

## Setup

### 1. Install Node dependencies

```
npm install
```

### 2. Install Python dependencies

```
uv sync
```

Creates a `.venv` at the repo root using Python 3.12 and installs FastAPI, Uvicorn, LangChain, LangGraph, and all packages declared in `pyproject.toml`.

---

## Development

Runs the full Tauri app in development mode with hot-reload on the frontend (Vite at `localhost:5173`) and Rust recompilation on change.

```
npm run tauri dev
```

Tauri handles both steps — it starts the Vite dev server and then launches the compiled Rust binary and application window.

The Python LLM microservice (`services/Server.py`) is **not started automatically at launch**. It is spawned on-demand by the Rust `ProcessManager` the first time an LLM command is executed (i.e. once an API key is configured and a chat is triggered from the UI).

---

## Production Build

Compiles the frontend and produces a bundled Tauri application installer or executable.

```
npm run tauri build
```

Output artifacts land in `src-tauri/target/release/bundle/`.

---

## Running the Python Microservice Standalone

The microservice normally runs as a managed sidecar. To start it independently for testing or debugging:

```
.venv/bin/python -m services.Server
```

On Windows:

```
.venv\Scripts\python.exe -m services.Server
```

It binds to `http://127.0.0.1:8765` by default. The Rust backend injects `FIXTURE_INTERNAL_TOKEN` and `FIXTURE_SERVER_PORT` into the child process environment automatically. When running standalone, requests without the token header will be rejected with `401 Unauthorized` unless you set the variable manually.

---

## Project Structure

```
Fixture/
├── src/                       # TypeScript frontend (Vite)
│   ├── components/            # UI components (Dashboard, OverlayController, SettingsModal, ...)
│   ├── styles/                # CSS stylesheets
│   └── assets/icons/          # SVG icons
├── src-tauri/                 # Rust backend (Tauri)
│   └── src/
│       ├── commands/          # Tauri IPC command handlers
│       ├── auth/              # OAuth2 PKCE flow
│       ├── storage/           # OS keyring secret store
│       ├── tray/              # System tray and overlay window management
│       ├── launcher/          # OS app discovery and protocol dispatch
│       └── ProcessManager.rs  # Python sidecar lifecycle manager
├── services/                  # Python microservice (FastAPI + LangChain + LangGraph)
│   ├── Server.py
│   ├── ChatRouter.py
│   ├── Models.py
│   └── Security.py
├── planning/                  # Architecture and implementation plan files
├── pyproject.toml             # Python dependencies (managed by uv)
├── package.json               # Node dependencies and npm scripts
└── src-tauri/Cargo.toml       # Rust dependencies
```