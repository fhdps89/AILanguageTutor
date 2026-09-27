#!/usr/bin/env python3
"""French book-page shadowing tutor — Streamlit entry."""
from __future__ import annotations

import streamlit as st

from vision_lib import analyze_image, ffmpeg_ok, resize_image_bytes, secret, sha256_bytes
from audio_lib import (
    audio_ready,
    load_demo,
    load_library,
    load_persisted_lesson,
    page_json_path,
    persist_lesson,
    render_page,
    synthesize_page,
)

BUILD = "20260927-vocab2"


def main() -> None:
    st.set_page_config(page_title="프랑스어 쉐도잉 튜터", page_icon="\U0001F4D8", layout="centered")
    st.title("프랑스어 쉐도잉 튜터")
    st.caption("build " + BUILD)
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
    st.sidebar.caption("build " + BUILD)
    demo = st.sidebar.checkbox("데모: 개선문 페이지 (API 키 없이)", value=False)
    uploaded = st.file_uploader("프랑스어 페이지 사진 (jpg/png)", type=["jpg", "jpeg", "png"])

    if "page" not in st.session_state:
        st.session_state.page = None
        st.session_state.paths = None
        st.session_state.photo = None
        st.session_state.cache_key = None

    if st.session_state.page is None:
        lib = load_library()
        last_key = lib[0]["key"] if lib else None
        if last_key:
            data, paths, photo = load_persisted_lesson(last_key)
            if data:
                if not audio_ready(data, paths):
                    paths = synthesize_page(data, last_key)
                    persist_lesson(last_key, data, photo, lib[0].get("source", "photo"))
                st.session_state.page = data
                st.session_state.paths = paths
                st.session_state.photo = photo
                st.session_state.cache_key = last_key

    lib = load_library()
    if lib:
        st.sidebar.markdown("**저장된 페이지**")
        labels = [f"{x.get('title','(제목 없음)')} · {x['key'][:8]}" for x in lib]
        pick = st.sidebar.selectbox(
            "이전 분석 불러오기",
            options=range(len(lib)),
            format_func=lambda i: labels[i],
            index=0,
        )
        if st.sidebar.button("선택한 페이지 열기"):
            key = lib[pick]["key"]
            data, paths, photo = load_persisted_lesson(key)
            if not data:
                st.sidebar.error("이 항목의 page.json이 없습니다.")
            else:
                if not audio_ready(data, paths):
                    with st.spinner("음성만 다시 만듭니다..."):
                        paths = synthesize_page(data, key)
                persist_lesson(key, data, photo, lib[pick].get("source", "photo"))
                st.session_state.page = data
                st.session_state.paths = paths
                st.session_state.photo = photo
                st.session_state.cache_key = key
                st.session_state.last_hash = None

    col1, col2 = st.columns(2)
    run_demo = col1.button("데모 페이지 만들기", disabled=not demo and uploaded is None)
    run_photo = col2.button("사진 분석", disabled=uploaded is None)

    if run_demo or (demo and run_photo and uploaded is None):
        data = load_demo()
        with st.spinner("데모 음성 생성..."):
            paths = synthesize_page(data, "demo-arc")
        persist_lesson("demo-arc", data, None, "demo")
        st.session_state.page = data
        st.session_state.paths = paths
        st.session_state.photo = None
        st.session_state.cache_key = "demo-arc"

    if run_photo and uploaded is not None:
        raw = uploaded.getvalue()
        digest = sha256_bytes(raw)
        cache_key = digest[:16]
        if st.session_state.get("last_hash") == digest and st.session_state.page:
            st.info("같은 사진입니다. 캐시를 재사용합니다.")
        else:
            try:
                existing, existing_paths, existing_photo = load_persisted_lesson(cache_key)
                if existing:
                    st.success("이미 분석한 사진입니다. Vision을 다시 호출하지 않습니다.")
                    data = existing
                    photo = existing_photo or raw
                    if not audio_ready(data, existing_paths):
                        with st.spinner("음성만 다시 만듭니다..."):
                            paths = synthesize_page(data, cache_key)
                    else:
                        paths = existing_paths
                else:
                    small = resize_image_bytes(raw)
                    with st.spinner(f"Vision OCR ({active_engine})..."):
                        data = analyze_image(small)
                    with st.spinner("TTS..."):
                        paths = synthesize_page(data, cache_key)
                    photo = raw
                persist_lesson(cache_key, data, photo, "photo")
                st.session_state.page = data
                st.session_state.paths = paths
                st.session_state.photo = photo
                st.session_state.last_hash = digest
                st.session_state.cache_key = cache_key
            except Exception as exc:
                st.exception(exc)
                st.stop()

    if st.session_state.page and st.session_state.paths:
        key = st.session_state.get("cache_key")
        if key and page_json_path(key).exists():
            st.download_button(
                "이 페이지 JSON 저장 (백업)",
                data=page_json_path(key).read_bytes(),
                file_name=f"{key}.json",
                mime="application/json",
            )
        render_page(st.session_state.page, st.session_state.paths, st.session_state.photo)
    else:
        st.info("데모를 켜고 데모 페이지 만들기, 또는 사진 분석을 누르세요.")


if __name__ == "__main__":
    main()
