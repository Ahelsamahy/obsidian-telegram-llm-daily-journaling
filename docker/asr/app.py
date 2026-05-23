from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

API_KEY = os.getenv("MLX_ASR_API_KEY") or os.getenv("ASR_API_KEY", "")
# This Docker app is a faster-whisper compatibility server, not the MLX/Qwen
# runtime. Keep its model selection separate from MLX_ASR_MODEL so a Qwen Hub id
# in .env does not get passed into WhisperModel by mistake.
DEFAULT_MODEL = os.getenv("ASR_MODEL", "small")
COMPUTE_TYPE = os.getenv("ASR_COMPUTE_TYPE", "int8")
DEVICE = os.getenv("ASR_DEVICE", "cpu")

app = FastAPI(title="OpenAI-compatible local ASR", version="1.0.0")


def _expected_auth() -> Optional[str]:
    if API_KEY:
        return f"Bearer {API_KEY}"
    return None


def _check_auth(authorization: Optional[str] = Header(default=None)) -> None:
    expected = _expected_auth()
    if expected is None:
        return
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@lru_cache(maxsize=4)
def _load_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/audio/transcriptions", dependencies=[Depends(_check_auth)])
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
) -> dict[str, str]:
    suffix = Path(file.filename or "audio").suffix or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        data = await file.read()
        tmp.write(data)
        tmp_path = tmp.name

    try:
        whisper = _load_model(model)
        segments, _ = whisper.transcribe(tmp_path)
        text = " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    if not text:
        raise HTTPException(status_code=422, detail="No speech detected")

    return {"text": text}
