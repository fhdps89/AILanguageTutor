#!/usr/bin/env python3
"""TTS, practice tracks, disk library."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path

import streamlit as st

from vision_lib import ffmpeg_ok, secret

APP_DIR = Path(__file__).resolve().parent
DEMO_JSON = APP_DIR / "demo_page.json"
CACHE_DIR = Path(os.environ.get("FRENCH_TUTOR_CACHE", str(APP_DIR / "cache")))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
LIBRARY_PATH = CACHE_DIR / "library.json"

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
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return float(out.strip())


def build_practice(raw_mp3: Path, practice_mp3: Path) -> None:
    ffmpeg = ffmpeg_ok()
    if not ffmpeg:
        raise RuntimeError("ffmpeg missing from PATH")
    slow = raw_mp3.with_name(raw_mp3.stem + "_slow.mp3")
    subprocess.check_call(
        [ffmpeg, "-y", "-i", str(raw_mp3), "-filter:a", "atempo=0.75", "-q:a", "4", str(slow)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    dur = probe_duration(slow)
    pause = max(2.0, dur * 1.2)
    silence = raw_mp3.with_name(raw_mp3.stem + "_sil.mp3")
    subprocess.check_call(
        [ffmpeg, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", f"{pause:.2f}", "-q:a", "4", str(silence)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    subprocess.check_call(
        [ffmpeg, "-y", "-i", str(slow), "-i", str(silence), "-i", str(slow),
         "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]", "-map", "[a]", "-q:a", "4", str(practice_mp3)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def mp3_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def play_buttons(sample_b64: str | None, practice_b64: str | None, key: str) -> None:
    cols = st.columns(2)
    if sample_b64:
        cols[0].caption("native 1.0x")
        cols[0].audio(base64.b64decode(sample_b64), format="audio/mp3")
    if practice_b64:
        cols[1].caption("shadow 0.75x")
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
    bar = st.progress(0, text="tts")
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
        bar.progress((i + 1) / total, text=f"tts {i + 1}/{total}")
    bar.empty()
    return paths


def load_demo() -> dict:
    return json.loads(DEMO_JSON.read_text(encoding="utf-8"))


def lesson_dir(cache_key: str) -> Path:
    return CACHE_DIR / cache_key


def page_json_path(cache_key: str) -> Path:
    return lesson_dir(cache_key) / "page.json"


def photo_path(cache_key: str) -> Path:
    return lesson_dir(cache_key) / "page.jpg"


def load_library() -> list[dict]:
    if not LIBRARY_PATH.exists():
        return []
    try:
        data = json.loads(LIBRARY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_library(items: list[dict]) -> None:
    LIBRARY_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_title(text: str) -> str:
    text = re.sub(r"[\\/:*?\"<>|]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:80] or "untitled"


def _content_fp(data: dict) -> str:
    parts = []
    for sent in data.get("sentences") or []:
        parts.append((sent.get("raw_text") or sent.get("tts_text") or "").strip().lower())
    blob = "|".join(p for p in parts if p)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def _vision_title(data: dict) -> str:
    title = (data.get("title") or "").strip()
    if title and len(title) <= 80:
        return title
    for sent in data.get("sentences") or []:
        if sent.get("id") == "s00":
            raw = (sent.get("raw_text") or "").strip()
            if raw and len(raw) <= 80:
                return raw
    return ""


def _stamp() -> str:
    return time.strftime("%y%m%d%H%M%S")


def assign_library_meta(cache_key: str, data: dict, items: list[dict]) -> dict:
    fp = _content_fp(data)
    for old in items:
        if old.get("content_fp") == fp:
            return {
                "book_title": old.get("book_title") or old.get("title") or cache_key,
                "page_no": int(old.get("page_no") or 1),
                "created_at": old.get("created_at") or _stamp(),
                "content_fp": fp,
                "reused": True,
            }
    vis = _vision_title(data)
    last_book = ""
    max_page = {}
    for old in items:
        book = (old.get("book_title") or old.get("title") or "").strip()
        if not book:
            continue
        if not last_book:
            last_book = book
        pno = int(old.get("page_no") or 1)
        max_page[book] = max(max_page.get(book, 0), pno)
    if vis:
        book = vis
        page_no = 1 if book not in max_page else max_page[book] + 1
        if book not in max_page:
            page_no = 1
    elif last_book:
        book = last_book
        page_no = max_page.get(book, 0) + 1
    else:
        book = cache_key
        page_no = 1
    return {
        "book_title": book,
        "page_no": page_no,
        "created_at": _stamp(),
        "content_fp": fp,
        "reused": False,
    }


def make_list_name(meta: dict) -> str:
    title = _safe_title(str(meta.get("book_title") or "untitled"))
    page = int(meta.get("page_no") or 1)
    ts = meta.get("created_at") or _stamp()
    return f"{title}_p{page:02d}_{ts}"


def upsert_library(cache_key: str, data: dict, source: str) -> None:
    items = load_library()
    others = [x for x in items if x.get("key") != cache_key]
    meta = assign_library_meta(cache_key, data, others)
    label = make_list_name(meta)
    data["library_title"] = meta["book_title"]
    data["library_page"] = meta["page_no"]
    data["library_name"] = label
    row = {
        "key": cache_key,
        "title": label,
        "book_title": meta["book_title"],
        "page_no": meta["page_no"],
        "created_at": meta["created_at"],
        "content_fp": meta["content_fp"],
        "source": source,
        "n_sentences": len(data.get("sentences") or []),
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    others.insert(0, row)
    save_library(others[:50])


def persist_lesson(cache_key: str, data: dict, photo_bytes: bytes | None, source: str) -> None:
    out = lesson_dir(cache_key)
    out.mkdir(parents=True, exist_ok=True)
    upsert_library(cache_key, data, source)
    page_json_path(cache_key).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    if photo_bytes:
        photo_path(cache_key).write_bytes(photo_bytes)


def load_persisted_lesson(cache_key: str):
    jp = page_json_path(cache_key)
    if not jp.exists():
        return None, {}, None
    data = json.loads(jp.read_text(encoding="utf-8"))
    out = lesson_dir(cache_key)
    paths: dict[str, Path] = {}
    lecture = out / "lecture_complete.mp3"
    if lecture.exists():
        paths["lecture"] = lecture
    for sent in data.get("sentences") or []:
        sid = sent.get("id") or ""
        raw = out / f"{sid}.mp3"
        prac = out / f"{sid}_practice.mp3"
        if raw.exists():
            paths[f"{sid}_raw"] = raw
        if prac.exists():
            paths[f"{sid}_practice"] = prac
    photo = photo_path(cache_key).read_bytes() if photo_path(cache_key).exists() else None
    return data, paths, photo


def audio_ready(data: dict, paths: dict[str, Path]) -> bool:
    if "lecture" not in paths or not paths["lecture"].exists():
        return False
    for sent in data.get("sentences") or []:
        sid = sent.get("id") or ""
        prac = paths.get(f"{sid}_practice")
        if not prac or not prac.exists():
            return False
    return True


def render_page(data: dict, paths: dict[str, Path], photo_bytes: bytes | None) -> None:
    st.caption(data.get("disclaimer_ko") or "TTS voice, not a native speaker.")
    if photo_bytes:
        st.image(photo_bytes, caption="uploaded page", use_container_width=True)
    shown_title = data.get("library_name") or data.get("title") or ""
    if shown_title:
        st.subheader(shown_title)
    if "lecture" in paths and paths["lecture"].exists():
        st.markdown("**full page 1.0x**")
        play_buttons(mp3_b64(paths["lecture"]), None, "lecture")
    for sent in data["sentences"]:
        sid = sent.get("id", "")
        st.divider()
        st.markdown(f"### {sid}")
        shown = sent.get("raw_text") or sent.get("tts_text") or ""
        st.markdown("**FR:**")
        st.write(shown if shown else "(empty)")
        raw_p = paths.get(f"{sid}_raw")
        prac_p = paths.get(f"{sid}_practice")
        play_buttons(
            mp3_b64(raw_p) if raw_p and raw_p.exists() else None,
            mp3_b64(prac_p) if prac_p and prac_p.exists() else None,
            sid,
        )
        st.markdown(f"**KO:** {sent.get('translation', '')}")
        if sent.get("syntax_diagram"):
            st.markdown("**syntax:**")
            st.code(sent["syntax_diagram"], language=None)
        vocabs = sent.get("vocabulary") or []
        if vocabs:
            st.markdown("**vocab:**")
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
