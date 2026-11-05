#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$HOME/voicestudio-gpu/app/.venv/bin/python"
OLLAMA_ROOT="$HOME/ollama-gpu"
PID_FILE="$ROOT/service.pid"
OLLAMA_PID=""
API_PID=""

cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$OLLAMA_PID" ]] && kill "$OLLAMA_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

cd "$ROOT"
if [[ ! -x "$PYTHON" || ! -x "$OLLAMA_ROOT/bin/ollama" ]]; then
  echo "Missing local CUDA Python or Ollama runtime" >&2
  exit 1
fi
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Localens GPU is already running" >&2
  exit 1
fi

echo $$ > "$PID_FILE"
export OLLAMA_HOST="127.0.0.1:11434"
export OLLAMA_MODELS="$OLLAMA_ROOT/models"
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_KEEP_ALIVE=10m
export OLLAMA_FLASH_ATTENTION=1
export PYTHONUNBUFFERED=1
export LOCALENS_MODEL="${LOCALENS_MODEL:-qwen3-vl:2b-instruct}"

"$OLLAMA_ROOT/bin/ollama" serve > "$ROOT/ollama.log" 2>&1 &
OLLAMA_PID=$!
for _ in $(seq 1 120); do
  curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
  kill -0 "$OLLAMA_PID" 2>/dev/null || { echo "Ollama failed to start" >&2; exit 1; }
  sleep 0.5
done
curl -fsS http://127.0.0.1:11434/api/version >/dev/null
"$OLLAMA_ROOT/bin/ollama" show "$LOCALENS_MODEL" >/dev/null || {
  echo "Missing $LOCALENS_MODEL. Download it once before starting Localens." >&2
  exit 1
}

"$PYTHON" -m uvicorn server:app --host 127.0.0.1 --port 3910 --workers 1 &
API_PID=$!
wait "$API_PID"
