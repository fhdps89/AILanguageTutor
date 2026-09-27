#!/usr/bin/env python3
"""French book-page shadowing tutor — Streamlit MVP (PRD v1.1, Gemini-first)."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components
from jsonschema import Draft202012Validator
from PIL import Image

APP_DIR = Path(__file__).resolve().parent
DEMO_JSON = APP_DIR / "demo_page.json"
CACHE_DIR = Path(os.environ.get("FRENCH_TUTOR_CACHE", str(APP_DIR / "cache")))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# 1. 스키마 레벨에서 syntax_diagram과 vocabulary를 필수로 강제
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
                "required": [
                    "id",
                    "raw_text",
                    "tts_text",
                    "translation",
                    "syntax_diagram",
                    "vocabulary",
                ],
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
                        "minItems": 1,
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

# 2. 역할 분리 프롬프트: 제목(s00), 문장 구조(호흡 청크), 어휘 학습(단어 드릴)
SYSTEM_PROMPT = """You are an OCR + French-learning annotator for Korean beginners who cannot read French.
Return ONLY a valid JSON object. No markdown fences, no commentary before or after.
Preserve spelling, accents, quotes, and case from the photo. Repair hyphen line-breaks (inaug- / uré → inauguré).
Put spoken expansions of numbers/ordinals ONLY in tts_text and full_tts_script.

[RULE 1 - TITLE IS MANDATORY (s00)]:
- The book or page title MUST be the very first sentence with id "s00" in the "sentences" array.
- Example: {"id": "s00", "raw_text": "L'ARC DE TRIOMPHE", "tts_text": "L'Arc de triomphe", "translation": "에투알 개선문", "syntax_diagram": "L'Arc de triomphe (에투알 개선문)", "vocabulary": [{"word": "l'arc", "meaning": "아치, 활", "hint": "[~ 아흐크]"}, {"word": "le triomphe", "meaning": "승리, 대성공", "hint": "[~ 트리옹프]"}]}
- Body sentences must follow as "s01", "s02", ...

[RULE 2 - SYNTAX DIAGRAM (BREATH & MEANING CHUNKS)]:
- Provide a clean ASCII chunk tree showing where to pause and breathe.
- Root: Subject | Verb (short Korean meaning in parentheses)
- Branches (+--): Prepositional/adverbial modifier chunks with short Korean meaning.
Example:
Il | trône (우뚝 서 있다)
  +-- sur la place de l'Étoile (에투알 광장 위에)
  +-- au centre de douze avenues (12개 대로의 중심에)

[RULE 3 - VOCABULARY DRILL (MANDATORY & INDEPENDENT)]:
- DO NOT OMIT VOCABULARY. Even if chunks are explained in the syntax diagram, every sentence MUST contain 3 to 6 individual vocabulary items in the "vocabulary" array.
- Structure: {"word": "French word/idiom", "meaning": "Korean meaning + role in context", "hint": "[~ 한글발음/문맥힌트]"}
Example:
[
  {"word": "trôner", "meaning": "우뚝 자리하다, 지배하다", "hint": "[~ 트로네: 왕좌처럼 자리하다]"},
  {"word": "sertir", "meaning": "보석을 박다, 감싸 에워싸다", "hint": "[~ 세흐티흐: 다이아몬드를 물리듯 감싸다]"}
]

translation is Korean. Separate the text's claim from historical assertion.
Do not call Hangul pronunciation "exact".
"""

DEFAULT_VISION_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
]


def secret(name: str, default: str = "") -> str:
    try:
        val = st.secrets.get(name)
        if val:
            return str(val)
    except Exception:
        pass
    return os.environ.get(name, default)


def vision_model_list() -> list[str]:
    preferred = (
        secret("GEMINI_VISION_MODEL")
        or secret("VISION_MODEL")
        or ""
    ).strip()
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
            return [ln.strip() for ln in re.split(r"(?<=[.!?])\s+|\n+", inner) if ln.strip()]
    if data.get("raw_text") or data.get("text") or data.get("title"):
        return [data]
    return []


def normalize_page(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Vision 응답이 객체가 아닙니다.")
    sentences = _as_sentence_list(data)
    cleaned = []
    for i, sent in enumerate(sentences):
        if isinstance(sent, str):
            sent = {"raw_text": sent}
        if not isinstance(sent, dict):
            continue
        raw = (
            sent.get("raw_text")
            or sent.get("text")
            or sent.get("original")
            or sent.get("fr")
            or sent.get("french")
            or sent.get("source")
            or ""
        )
        sid = sent.get("id") or f"s{i:02d}"
        tts = sent.get("tts_text") or sent.get("spoken") or raw
        trans = (
            sent.get("translation")
            or sent.get("ko")
            or sent.get("meaning")
            or sent.get("text_claim")
            or ""
        )
        raw_s = str(raw).strip()
        tts_s = str(tts).strip()
        if not raw_s:
            raw_s = tts_s or str(data.get("title") or "").strip()
        if not tts_s:
            tts_s = raw_s
        if not raw_s:
            continue
        cleaned.append(
            {
                "id": str(sid),
                "raw_text": raw_s,
                "tts_text": tts_s,
                "translation": str(trans).strip(),
                "breath_marks": str(sent.get("breath_marks") or raw_s).strip(),
                "syntax_diagram": str(sent.get("syntax_diagram") or f"{raw_s}").strip(),
                "liaison_hint": str(sent.get("liaison_hint") or "").strip(),
                "vocabulary": sent.get("vocabulary")
                if isinstance(sent.get("vocabulary"), list)
                else [],
            }
        )
    if not cleaned:
        raise ValueError("문장 배열이 비었습니다.")

    title = str(data.get("title") or "").strip()
    if not title:
        first = cleaned[0]["raw_text"]
        if first and len(first) < 80:
            title = first

    # s00(제목) 안전망: sentences에 s00이 누락된 경우 자동 주입
    has_s00 = any(s.get("id") == "s00" for s in cleaned)
    if not has_s00 and title:
        cleaned.insert(
            0,
            {
                "id": "s00",
                "raw_text": title,
                "tts_text": title,
                "translation": f"제목: {title}",
                "breath_marks": title,
                "syntax_diagram": f"{title} (제목)",
                "liaison_hint": "",
                "vocabulary": [{"word": title, "meaning": "페이지 제목", "hint": ""}],
            },
        )

    full = data.get("full_tts_script") or " ".join(s["tts_text"] for s in cleaned)
    return {
        "title": title,
        "full_tts_script": full,
        "disclaimer_ko": data.get("disclaimer_ko")
        or "음성은 합성 TTS이며 원어민이 아닙니다.",
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
            text = text[start : end + 1]
    data = json.loads(text)
    data = normalize_page(data)
    Draft202012Validator(VISION_SCHEMA).validate(data)
    return data


def resize_image_bytes(raw: bytes, max_side: int = 2048) -> bytes:
    from io import BytesIO

    im = Image.open(BytesIO(raw))
    im = im.convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def call_gemini_vision(image_bytes: bytes) -> dict:
    key = secret("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY가 없습니다. .streamlit/secrets.toml을 확인하세요.")

    b64 = base64.b64encode(image_bytes).decode("ascii")
    body = json.dumps(
        {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "Transcribe this French page photo into the required JSON."},
                        {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        }
    ).encode("utf-8")

    last_error = ""
    for model in vision_model_list():
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        for attempt in range(5):
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": key,
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                parts = payload["candidates"][0]["content"]["parts"]
                text = parts[0].get("text") or ""
                return extract_json(text)
            except urllib.error.HTTPError as exc:
                err_details = exc.read().decode("utf-8", errors="ignore")
                if exc.code in (400, 402, 404):
                    last_error = f"{model} ({exc.code}): {err_details[:200]}"
                    break
                if exc.code in (401, 403):
                    raise RuntimeError(
                        f"Gemini 인증 실패 ({exc.code}). AI Studio API 키인지 확인하세요. {err_details[:300]}"
                    ) from exc
                if exc.code in (429, 500, 502, 503, 504):
                    wait = 2 ** attempt
                    last_error = f"{model} ({exc.code} 일시 오류, {wait}초 후 재시도)"
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"Google Gemini API 오류 ({exc.code}): {err_details}") from exc
            except Exception as exc:
                last_error = f"{model}: {exc}"
                break

    raise RuntimeError(f"Gemini Vision 호출 실패. 마지막 원인: {last_error}")


def call_openrouter_vision(image_bytes: bytes) -> dict:
    from openai import OpenAI

    key = secret("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY가 없습니다.")
    model = secret("OPENROUTER_MODEL", "z-ai/glm-5.3-flash")
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = OpenAI(api_key=key, base_url="https://openrouter.ai/api/v1")
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcribe this French page photo into the required JSON."},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                ],
            },
        ],
    )
    return extract_json(resp.choices[0].message.content or "")


def call_xai_vision(image_bytes: bytes) -> dict:
    from openai import OpenAI

    key = secret("XAI_API_KEY")
    if not key:
        raise RuntimeError("XAI_API_KEY가 없습니다.")
    model = secret("XAI_VISION_MODEL", "grok-2-vision-1212")
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = OpenAI(api_key=key, base_url="https://api.x.ai/v1")
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcribe this French page photo into the required JSON."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            },
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
        raise RuntimeError(
            "사진 분석에는 OPENROUTER_API_KEY 또는 GEMINI_API_KEY가 필요합니다."
        )

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
            st.warning(f"{name} Vision 실패, 다음 엔진 시도: {exc}")
    raise last_exc or RuntimeError("Vision 호출 실패")


async def _edge_save(text: str, dest: Path, voice: str) -> None:
    import edge_tts

    comm = edge_tts.Communicate(text, voice)
    await comm.save(str(dest))


def tts_to_mp3(text: str, dest: Path, voice: str) -> None:
    import asyncio

    dest.parent.mkdir(parents=True, exist_ok=True)
    asyncio.run(_edge_save(text, dest, voice))


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def build_practice(raw_mp3: Path, practice_mp3: Path) -> None:
    ffmpeg = ffmpeg_ok()
    if not ffmpeg:
        raise RuntimeError("ffmpeg가 PATH에 없습니다.")
    slow = raw_mp3.with_name(raw_mp3.stem + "_slow.mp3")
    subprocess.check_call(
        [ffmpeg, "-y", "-i", str(raw_mp3), "-filter:a", "atempo=0.75", "-q:a", "4", str(slow)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    dur = probe_duration(slow)
    pause = max(2.0, dur * 1.2)
    silence = raw_mp3.with_name(raw_mp3.stem + "_sil.mp3")
    subprocess.check_call(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=24000:cl=mono",
            "-t",
            f"{pause:.2f}",
            "-q:a",
            "4",
            str(silence),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.check_call(
        [
            ffmpeg,
            "-y",
            "-i",
            str(slow),
            "-i",
            str(silence),
            "-i",
            str(slow),
            "-filter_complex",
            "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
            "-map",
            "[a]",
            "-q:a",
            "4",
            str(practice_mp3),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def mp3_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def play_buttons(sample_b64: str | None, practice_b64: str | None, key: str) -> None:
    def btn(label: str, color: str, payload: str | None) -> str:
        if not payload:
            return ""
        return f"""
        <button style="background:{color};color:white;border:0;border-radius:8px;
          padding:8px 12px;margin-right:8px;cursor:pointer;font-size:14px"
          onclick="(function(){{if(window._ftAudio){{window._ftAudio.pause();}}
            window._ftAudio=new Audio('data:audio/mpeg;base64,{payload}');
            window._ftAudio.play();}})()">{label}</button>
        """

    html = "<div style='margin:6px 0'>"
    html += btn("원어민 샘플 1.0x", "#2563eb", sample_b64)
    html += btn("섀도잉 0.75x", "#16a34a", practice_b64)
    html += "</div>"
    components.html(html, height=48)
    with st.expander("기본 플레이어 (모바일 폴백)", expanded=False):
        cols = st.columns(2)
        if sample_b64:
            cols[0].audio(base64.b64decode(sample_b64), format="audio/mp3")
        if practice_b64:
            cols[1].audio(base64.b64decode(practice_b64), format="audio/mp3")


def synthesize_page(data: dict, cache_key: str) -> dict[str, Path]:
    voice = secret("TTS_VOICE", "fr-FR-DeniseNeural")
    out_dir = CACHE_DIR / cache_key
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    lecture = out_dir / "lecture_complete.mp3"
    script = data.get("full_tts_script") or " ".join(
        s.get("tts_text") or s["raw_text"] for s in data["sentences"]
    )
    if not lecture.exists():
        tts_to_mp3(script, lecture, voice)
    paths["lecture"] = lecture

    total = len(data["sentences"])
    bar = st.progress(0, text="음성 생성 중")
    for i, sent in enumerate(data["sentences"]):
        sid = sent.get("id") or f"s{i:02d}"
        raw = out_dir / f"{sid}.mp3"
        prac = out_dir / f"{sid}_practice.mp3"
        if not raw.exists():
            tts_to_mp3(sent.get("tts_text") or sent["raw_text"], raw, voice)
        if not prac.exists():
            build_practice(raw, prac)
        paths[f"{sid}_raw"] = raw
        paths[f"{sid}_practice"] = prac
        bar.progress((i + 1) / total, text=f"음성 생성 중 {i + 1}/{total}")
    bar.empty()
    return paths


def load_demo() -> dict:
    return json.loads(DEMO_JSON.read_text(encoding="utf-8"))


def render_page(data: dict, paths: dict[str, Path], photo_bytes: bytes | None) -> None:
    st.caption(data.get("disclaimer_ko") or "음성은 합성 TTS이며 원어민이 아닙니다.")
    if photo_bytes:
        st.image(photo_bytes, caption="업로드한 페이지", use_container_width=True)
    if data.get("title"):
        st.subheader(data["title"])

    if "lecture" in paths and paths["lecture"].exists():
        st.markdown("**페이지 전체 통독 1.0x**")
        play_buttons(mp3_b64(paths["lecture"]), None, "lecture")

    for sent in data["sentences"]:
        sid = sent.get("id", "")
        st.divider()
        st.markdown(f"### {sid}")
        shown = sent.get("raw_text") or sent.get("tts_text") or ""
        st.markdown("**원문:**")
        st.write(shown if shown else "(원문 없음)")
        if sent.get("breath_marks") and sent["breath_marks"] != sent["raw_text"]:
            st.caption("호흡: " + sent["breath_marks"])
        raw_p = paths.get(f"{sid}_raw")
        prac_p = paths.get(f"{sid}_practice")
        play_buttons(
            mp3_b64(raw_p) if raw_p and raw_p.exists() else None,
            mp3_b64(prac_p) if prac_p and prac_p.exists() else None,
            sid,
        )
        st.markdown(f"**해석:** {sent.get('translation', '')}")

        # 1. 문장 구조 및 끊어 읽기 청크 도식
        if sent.get("syntax_diagram"):
            st.markdown("**문장 구조 (끊어 읽기 청크):**")
            st.caption("💡 '|'는 주어·동사 분리, '+--'는 한 호흡으로 읽는 의미 덩어리입니다.")
            st.code(sent["syntax_diagram"], language=None)

        if sent.get("liaison_hint"):
            st.caption("연음 힌트: " + sent["liaison_hint"])

        # 2. 주요 단어 학습 (어휘 드릴)
        vocabs = sent.get("vocabulary") or []
        if vocabs:
            st.markdown("**주요 어휘 학습:**")
            for item in vocabs:
                if isinstance(item, dict):
                    word = item.get("word", "")
                    meaning = item.get("meaning", "")
                    hint = item.get("hint", "")
                    line = f"- **{word}**: {meaning}"
                    if hint:
                        line += f"  `{hint}`"
                    st.markdown(line)
                elif isinstance(item, str):
                    st.markdown(f"- {item}")


def main() -> None:
    st.set_page_config(page_title="프랑스어 섀도잉 튜터", page_icon="📘", layout="centered")
    st.title("프랑스어 섀도잉 튜터")
    st.write("책·안내판 사진 한 장 → 문장마다 듣고 따라 읽기. 문법 강의기가 아닙니다.")

    if not ffmpeg_ok():
        st.error("ffmpeg가 설치되어 있지 않습니다. 설치 후 다시 실행하세요.")
        st.stop()

    if secret("OPENROUTER_API_KEY") and secret("VISION_PROVIDER", "openrouter") != "gemini":
        active_engine = "OpenRouter " + secret("OPENROUTER_MODEL", "z-ai/glm-5.3-flash")
    elif secret("GEMINI_API_KEY"):
        active_engine = "Google Gemini Vision"
    elif secret("XAI_API_KEY"):
        active_engine = "xAI Grok"
    else:
        active_engine = "미설정"
    st.sidebar.caption(f"현재 Vision 엔진: {active_engine}")
    demo = st.sidebar.checkbox(
        "데모: 개선문 페이지 (API 키 없이)",
        value=not bool(secret("XAI_API_KEY") or secret("GEMINI_API_KEY")),
    )
    uploaded = st.file_uploader("프랑스어 페이지 사진 (jpg/png)", type=["jpg", "jpeg", "png"])

    if "page" not in st.session_state:
        st.session_state.page = None
        st.session_state.paths = None
        st.session_state.photo = None

    col1, col2 = st.columns(2)
    run_demo = col1.button("데모 페이지 만들기", disabled=not demo and uploaded is None)
    run_photo = col2.button("사진 분석", disabled=uploaded is None)

    if run_demo or (demo and run_photo and uploaded is None):
        data = load_demo()
        with st.spinner("데모 음성 생성… 첫 실행은 1–2분 걸립니다."):
            paths = synthesize_page(data, "demo-arc")
        st.session_state.page = data
        st.session_state.paths = paths
        st.session_state.photo = None

    if run_photo and uploaded is not None:
        raw = uploaded.getvalue()
        digest = sha256_bytes(raw)
        if st.session_state.get("last_hash") == digest and st.session_state.page:
            st.info("같은 사진입니다. 캐시를 재사용합니다.")
        else:
            try:
                small = resize_image_bytes(raw)
                with st.spinner(f"Vision OCR 분석 중 ({active_engine})…"):
                    data = analyze_image(small)
                with st.spinner("TTS + 섀도잉 트랙 생성 중…"):
                    paths = synthesize_page(data, digest[:16])
                st.session_state.page = data
                st.session_state.paths = paths
                st.session_state.photo = raw
                st.session_state.last_hash = digest
            except Exception as exc:
                st.exception(exc)
                st.stop()

    if st.session_state.page and st.session_state.paths:
        render_page(st.session_state.page, st.session_state.paths, st.session_state.photo)
    else:
        st.info("왼쪽에서 데모를 켜고 「데모 페이지 만들기」를 누르거나, 사진을 올린 뒤 「사진 분석」을 누르세요.")


if __name__ == "__main__":
    main()