#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$HOME/voicestudio-gpu/app/.venv/bin/python"
PID_FILE="$ROOT/service.pid"

cd "$ROOT"
mkdir -p models
if [[ ! -x "$PYTHON" ]]; then
  echo "Missing shared CUDA Python environment: $PYTHON" >&2
  exit 1
fi
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Localens GPU is already running" >&2
  exit 1
fi

echo $$ > "$PID_FILE"
export HF_HOME="$ROOT/models"
export HF_HUB_DISABLE_XET=1
export TOKENIZERS_PARALLELISM=false
export PYTHONUNBUFFERED=1
export LOCALENS_MODEL="${LOCALENS_MODEL:-google/siglip-base-patch16-224}"
exec "$PYTHON" -m uvicorn server:app --host 127.0.0.1 --port 3910 --workers 1
