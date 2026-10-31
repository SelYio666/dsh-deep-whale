# -*- coding: utf-8 -*-
"""深海鲸鱼女仆 · Python 侧统一配置（对齐 whale.config.json / 环境变量）"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _cfg() -> dict:
    try:
        return json.loads((ROOT / "whale.config.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


CFG = _cfg()


def _abs(p) -> Path:
    q = Path(str(p))
    return q if q.is_absolute() else (ROOT / q)


DATA_DIR = _abs(os.environ.get("WHALE_DATA_DIR") or CFG.get("dataDir") or "./data")
STATE_DIR = DATA_DIR / "state"
MEDIA_ROOT = DATA_DIR / "media"
STICKER_DIR = MEDIA_ROOT / "whale-stickers"
VIDEO_DIR = MEDIA_ROOT / "whale-video"
VOICE_DIR = DATA_DIR / "voice"
SELF_DIR = DATA_DIR / "self"
BACKUP_DIR = DATA_DIR / "backups"
MEMORY_JSON = STATE_DIR / "memory.json"
OWNER_TOOLS_JSON = STATE_DIR / "owner-tools.json"
BRAIN_DB = STATE_DIR / "brain.db"
PERSONA_FILE = SELF_DIR / "persona.txt"
STYLE_FILE = SELF_DIR / "style.txt"
STICKER_CATALOGUE = SELF_DIR / "sticker-catalogue.json"
MEME_LIBRARY = SELF_DIR / "meme-library.json"
AUDIO_CACHE = MEDIA_ROOT / "audio-cache"

_L = CFG.get("llm") or {}
LLM_BASE = str(os.environ.get("WHALE_LLM_BASE") or _L.get("baseUrl") or "https://api.deepseek.com/v1").rstrip("/")
LLM_KEY = str(os.environ.get("WHALE_LLM_KEY") or _L.get("apiKey") or "")
LLM_MODEL = str(os.environ.get("WHALE_LLM_MODEL") or _L.get("model") or "deepseek-chat")
LLM_MAX_TOKENS = int(os.environ.get("WHALE_LLM_MAX_TOKENS") or _L.get("maxTokens") or 2048)
OWNER_QQ = str(os.environ.get("WHALE_OWNER_QQ") or CFG.get("ownerQq") or "1000000001")
PYTHON_BIN = str(os.environ.get("WHALE_PYTHON") or CFG.get("pythonBin") or sys.executable)


def ensure_dirs() -> None:
    for d in (DATA_DIR, STATE_DIR, STICKER_DIR, VIDEO_DIR, VOICE_DIR, SELF_DIR, BACKUP_DIR, AUDIO_CACHE):
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass


def llm_headers() -> dict:
    return {
        "Authorization": "Bearer " + LLM_KEY,
        "Content-Type": "application/json",
        "User-Agent": "whale-maid/1.0",
        "x-client-session": "whale-maid",
    }
