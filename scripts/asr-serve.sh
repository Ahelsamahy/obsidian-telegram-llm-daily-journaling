#!/usr/bin/env bash
# Local OpenAI-compatible ASR for the plugin (default port 8765).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -x .venv-asr/bin/python ]]; then
	echo "Run first: npm run asr:install" >&2
	exit 1
fi
# shellcheck disable=SC1091
source .venv-asr/bin/activate
if [[ -f .env ]]; then
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
fi
KEY="${MLX_ASR_API_KEY:-local-dev-asr-key}"
HOST="${MLX_ASR_HOST:-127.0.0.1}"
PORT="${MLX_ASR_PORT:-8765}"
MODEL="${MLX_ASR_MODEL:-Qwen/Qwen3-ASR-0.6B}"
exec mlx-qwen3-asr serve --host "$HOST" --port "$PORT" --api-key "$KEY" --model "$MODEL"
