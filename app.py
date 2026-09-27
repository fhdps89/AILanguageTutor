#!/usr/bin/env python3
"""Load persisted-lesson app from split base64 parts."""
import base64
from pathlib import Path

_root = Path(__file__).resolve().parent
_parts = sorted(_root.glob("_app_impl_*.b64"))
if not _parts:
    raise SystemExit("missing _app_impl_*.b64 source parts")
_blob = "".join(p.read_text(encoding="ascii") for p in _parts)
exec(compile(base64.b64decode(_blob), "app.py", "exec"), globals())
