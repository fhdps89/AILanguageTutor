# AI Language Tutor — 프랑스어 쉐도잉

책·안내판 사진 → 문장별 듣고 따라 읽기. Streamlit MVP.

## 실행

```bash
python -m pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
# 키만 로컬 secrets.toml에 기입
python -m streamlit run app.py
```

시스템 의존성: `ffmpeg`가 PATH에 있어야 연습 트랙이 만들어집니다.

## 시크릿

`.streamlit/secrets.toml`은 커밋하지 마세요.

권장 Vision: OpenRouter `z-ai/glm-5.3-flash`. Gemini 무료 티어는 폴백.

## 캐시

`cache/`에 MP3가 있으면 같은 사진(SHA256)은 TTS를 다시 돌리지 않습니다.
데모는 사이드바 「데모: 개선문 페이지」.
