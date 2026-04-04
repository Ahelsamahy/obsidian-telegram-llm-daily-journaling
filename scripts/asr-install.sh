#!/usr/bin/env bash
# One-time: Python venv + mlx-qwen3-asr[serve] (Apple Silicon + Python 3.10+).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -d .venv-asr ]]; then
	python3 -m venv .venv-asr
fi
# shellcheck disable=SC1091
source .venv-asr/bin/activate
pip install --upgrade pip
pip install "mlx-qwen3-asr[serve]"
echo "ASR venv ready. Start server: npm run asr:serve"
echo "Match plugin settings: ASR base URL http://127.0.0.1:8765/v1, same API key as MLX_ASR_API_KEY in .env"
