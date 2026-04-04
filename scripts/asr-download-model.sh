#!/usr/bin/env bash
# Prefetch Hugging Face weights for the same repo id used by mlx-qwen3-asr serve.
# Run from the plugin repo: npm run asr:download-model -- "Qwen/Qwen3-ASR-0.6B"
# Optional: MLX_ASR_MODEL, HF_TOKEN / HUGGINGFACE_HUB_TOKEN in .env (same as asr:serve).
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
MODEL="${1:-${MLX_ASR_MODEL:-Qwen/Qwen3-ASR-0.6B}}"
export MODEL_ID="$MODEL"
TOKEN="${HF_TOKEN:-${HUGGINGFACE_HUB_TOKEN:-}}"
export HF_TOKEN="$TOKEN"
export HUGGINGFACE_HUB_TOKEN="$TOKEN"

pip show huggingface_hub &>/dev/null || pip install -q huggingface_hub

python - <<'PY'
import os

from huggingface_hub import snapshot_download

mid = os.environ["MODEL_ID"]
token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN") or None
if token == "":
	token = None
path = snapshot_download(repo_id=mid, token=token)
print("Snapshot ready:", path)
PY
