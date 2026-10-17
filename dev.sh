#!/usr/bin/env bash
# One-command local dev: starts the FastAPI backend and the Next.js frontend together.
# Node is used from the local install if a system Node isn't on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_NODE="$HOME/.local/node/node-v22.11.0-darwin-arm64/bin"
if ! command -v node >/dev/null 2>&1 && [ -d "$LOCAL_NODE" ]; then
  export PATH="$LOCAL_NODE:$PATH"
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ backend  → http://localhost:8077  (docs at /docs)"
(
  cd "$ROOT/backend"
  [ -d .venv ] || uv venv .venv
  .venv/bin/uvicorn app.main:app --reload --port 8077
) &

echo "▶ frontend → http://localhost:3000"
(
  cd "$ROOT/frontend"
  [ -d node_modules ] || npm install
  npm run dev
) &

wait
