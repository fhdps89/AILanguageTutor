#!/usr/bin/env python3
"""Temporary boot file. Persist version is in the next commit."""
import json
from pathlib import Path
import streamlit as st

st.set_page_config(page_title="프랑스어 쉐도잉 튜터", page_icon="\U0001F4D8", layout="centered")
st.title("프랑스어 쉐도잉 튜터")
st.info("저장(새로고침 유지) 패치를 GitHub에 올리는 중입니다. 데몤는 아래에서 열 수 있습니다.")

data = json.loads((Path(__file__).parent / "demo_page.json").read_text(encoding="utf-8"))
st.subheader(data.get("title") or "demo")
for sent in data.get("sentences") or []:
    st.divider()
    st.markdown("### " + str(sent.get("id", "")))
    st.write(sent.get("raw_text") or "")
    st.write(sent.get("translation") or "")
    if sent.get("syntax_diagram"):
        st.code(sent["syntax_diagram"], language=None)
