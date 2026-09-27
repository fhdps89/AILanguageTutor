#!/usr/bin/env python3
"""Vision / OCR helpers."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.request
from io import BytesIO

import streamlit as st
from jsonschema import Draft202012Validator
from PIL import Image

VISION_SCHEMA = {
    "type": "object",
    "required": ["sentences"],
    "properties": {
        "title": {"type": "string"},
        "full_tts_script": {"type": "string"},
        "disclaimer_ko": {"type": "string"},
        "sentences": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["id", "raw_text", "tts_text", "translation", "syntax_diagram", "vocabulary"],
                "properties": {
                    "id": {"type": "string"},
                    "raw_text": {"type": "string"},
                    "tts_text": {"type": "string"},
                    "translation": {"type": "string"},
                    "breath_marks": {"type": "string"},
                    "syntax_diagram": {"type": "string"},
                    "liaison_hint": {"type": "string"},
                    "vocabulary": {
                        "type": "array",
                        "minItems": 0,
                        "items": {
                            "type": "object",
                            "required": ["word", "meaning"],
                            "properties": {
                                "word": {"type": "string"},
                                "meaning": {"type": "string"},
                                "hint": {"type": "string"},
                            },
                        },
                    },
                },
            },
        },
    },
}

SYSTEM_PROMPT = """You are an OCR + French-learning annotator for Korean beginners who cannot read French.
Return ONLY a valid JSON object. No markdown fences.
Preserve spelling and accents. Put spoken number expansions ONLY in tts_text and full_tts_script.
RULE 1: first sentence id must be s00 (page title). Body s01, s02, ...
RULE 2: syntax_diagram ASCII chunks with Korean glosses.
RULE 3: every sentence vocabulary MUST have 3 to 6 items {word, meaning, hint}. Never return an empty vocabulary array.
translation is Korean.
"""

DEFAULT_VISION_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]


def secret(name: str, default: str = "") -> str:
    try:
        val = st.secrets.get(name)
        if val:
            return str(val)
    except Exception:
        pass
    return os.environ.get(name, default)


def _clean_vocab(raw_vocab, fallback_text: str) -> list:
    items = raw_vocab if isinstance(raw_vocab, list) else []
    cleaned = []
    for item in items:
        if isinstance(item, str) and item.strip():
            cleaned.append({"word": item.strip(), "meaning": "", "hint": ""})
        elif isinstance(item, dict):
            word = str(item.get("word") or "").strip()
            if not word:
                continue
            cleaned.append({
                "word": word,
                "meaning": str(item.get("meaning") or "").strip(),
                "hint": str(item.get("hint") or "").strip(),
            })
    if cleaned:
        return cleaned
    token = (fallback_text or "item").split()[0][:40]
    return [{"word": token, "meaning": "core phrase", "hint": ""}]


def vision_model_list() -> list[str]:
    preferred = (secret("GEMINI_VISION_MODEL") or secret("VISION_MODEL") or "").strip()
    models: list[str] = []
    if preferred:
        models.append(preferred)
    for name in DEFAULT_VISION_MODELS:
        if name not in models:
            models.append(name)
    return models


def ffmpeg_ok() -> str | None:
    return shutil.which("ffmpeg")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _as_sentence_list(data: dict) -> list:
    for key in ("sentences", "items", "lines", "paragraphs", "blocks"):
        val = data.get(key)
        if isinstance(val, list) and val:
            return val
    for nest in ("page", "result", "data", "output", "content"):
        inner = data.get(nest)
        if isinstance(inner, dict):
            found = _as_sentence_list(inner)
            if found:
                return found
        if isinstance(inner, list) and inner:
            return inner
        if isinstance(inner, str) and inner.strip():
            return [ln.strip() for ln in re.split(r"[.!?]\s+|\n+", inner) if ln.strip()]
    if data.get("raw_text") or data.get("text") or data.get("title"):
        return [data]
    return []


def normalize_page(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Vision response is not an object")
    sentences = _as_sentence_list(data)
    cleaned = []
    for i, sent in enumerate(sentences):
        if isinstance(sent, str):
            sent = {"raw_text": sent}
        if not isinstance(sent, dict):
            continue
        raw = sent.get("raw_text") or sent.get("text") or sent.get("original") or sent.get("fr") or sent.get("french") or sent.get("source") or ""
        sid = sent.get("id") or f"s{i:02d}"
        tts = sent.get("tts_text") or sent.get("spoken") or raw
        trans = sent.get("translation") or sent.get("ko") or sent.get("meaning") or sent.get("text_claim") or ""
        raw_s = str(raw).strip()
        tts_s = str(tts).strip()
        if not raw_s:
            raw_s = tts_s or str(data.get("title") or "").strip()
        if not tts_s:
            tts_s = raw_s
        if not raw_s:
            continue
        cleaned.append({
            "id": str(sid),
            "raw_text": raw_s,
            "tts_text": tts_s,
            "translation": str(trans).strip(),
            "breath_marks": str(sent.get("breath_marks") or raw_s).strip(),
            "syntax_diagram": str(sent.get("syntax_diagram") or raw_s).strip(),
            "liaison_hint": str(sent.get("liaison_hint") or "").strip(),
            "vocabulary": _clean_vocab(sent.get("vocabulary"), raw_s),
        })
    if not cleaned:
        raise ValueError("empty sentences")
    title = str(data.get("title") or "").strip()
    if not title:
        first = cleaned[0]["raw_text"]
        if first and len(first) in range(80):
            title = first
    has_s00 = any(s.get("id") == "s00" for s in cleaned)
    if not has_s00 and title:
        cleaned.insert(0, {
            "id": "s00",
            "raw_text": title,
            "tts_text": title,
            "translation": f"title: {title}",
            "breath_marks": title,
            "syntax_diagram": f"{title} (title)",
            "liaison_hint": "",
            "vocabulary": _clean_vocab([], title),
        })
    full = data.get("full_tts_script") or " ".join(s["tts_text"] for s in cleaned)
    return {
        "title": title,
        "full_tts_script": full,
        "disclaimer_ko": data.get("disclaimer_ko") or "TTS voice, not a native speaker.",
        "sentences": cleaned,
    }


def extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
    data = json.loads(text)
    data = normalize_page(data)
    Draft202012Validator(VISION_SCHEMA).validate(data)
    return data


def resize_image_bytes(raw: bytes, max_side: int = 2048) -> bytes:
    im = Image.open(BytesIO(raw))
    im = im.convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if not (scale >= 1.0):
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def call_gemini_vision(image_bytes: bytes) -> dict:
    key = secret("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY missing")
    b64 = base64.b64encode(image_bytes).decode("ascii")
    body = json.dumps({
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [
            {"text": "Transcribe this French page photo into the required JSON."},
            {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
        ]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }).encode("utf-8")
    last_error = ""
    for model in vision_model_list():
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        for attempt in range(5):
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "x-goog-api-key": key})
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                parts = payload["candidates"][0]["content"]["parts"]
                return extract_json(parts[0].get("text") or "")
            except urllib.error.HTTPError as exc:
                err_details = exc.read().decode("utf-8", errors="ignore")
                if exc.code in (400, 402, 404):
                    last_error = f"{model} ({exc.code}): {err_details[:200]}"
                    break
                if exc.code in (401, 403):
                    raise RuntimeError(f"Gemini auth {exc.code}: {err_details[:300]}") from exc
                if exc.code in (429, 500, 502, 503, 504):
                    wait = 2 ** attempt
                    last_error = f"{model} ({exc.code}) retry {wait}s"
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"Gemini HTTP {exc.code}: {err_details}") from exc
            except Exception as exc:
                last_error = f"{model}: {exc}"
                break
    raise RuntimeError(f"Gemini vision failed: {last_error}")


def call_openrouter_vision(image_bytes: bytes) -> dict:
    from openai import OpenAI
    key = secret("OPENROUTER_API_KEY").strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY missing")
    model = secret("OPENROUTER_MODEL", "z-ai/glm-5.3-flash").strip()
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = OpenAI(
        api_key=key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={"HTTP-Referer": "https://github.com/fhdps89/AILanguageTutor", "X-Title": "AILanguageTutor"},
    )
    resp = client.chat.completions.create(
        model=model, temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": "Transcribe this French page photo into the required JSON."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]},
        ],
    )
    return extract_json(resp.choices[0].message.content or "")


def call_xai_vision(image_bytes: bytes) -> dict:
    from openai import OpenAI
    key = secret("XAI_API_KEY")
    if not key:
        raise RuntimeError("XAI_API_KEY missing")
    model = secret("XAI_VISION_MODEL", "grok-2-vision-1212")
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = OpenAI(api_key=key, base_url="https://api.x.ai/v1")
    resp = client.chat.completions.create(
        model=model, temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": "Transcribe this French page photo into the required JSON."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]},
        ],
    )
    return extract_json(resp.choices[0].message.content or "")


def analyze_image(image_bytes: bytes) -> dict:
    prefer = secret("VISION_PROVIDER", "").lower().strip()
    has_or = bool(secret("OPENROUTER_API_KEY"))
    has_gemini = bool(secret("GEMINI_API_KEY"))
    has_xai = bool(secret("XAI_API_KEY"))
    order = []
    if prefer == "openrouter" and has_or:
        order = ["openrouter", "gemini", "xai"]
    elif prefer == "gemini" and has_gemini:
        order = ["gemini", "openrouter", "xai"]
    elif prefer == "xai" and has_xai:
        order = ["xai", "openrouter", "gemini"]
    else:
        if has_or:
            order.append("openrouter")
        if has_gemini:
            order.append("gemini")
        if has_xai:
            order.append("xai")
    if not order:
        raise RuntimeError("Need OPENROUTER_API_KEY or GEMINI_API_KEY")
    last_exc: Exception | None = None
    for name in order:
        try:
            if name == "openrouter" and has_or:
                return call_openrouter_vision(image_bytes)
            if name == "gemini" and has_gemini:
                return call_gemini_vision(image_bytes)
            if name == "xai" and has_xai:
                return call_xai_vision(image_bytes)
        except Exception as exc:
            last_exc = exc
            st.warning(f"{name} Vision failed: {exc}".encode("ascii", "replace").decode("ascii"))
    raise last_exc or RuntimeError("Vision failed")
