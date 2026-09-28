# AI Language Tutor — 프랑스어 쉐도잉 튜터

책·안내판 사진 한 장으로 문장마다 듣고 따라 읽는 프랑스어 쉐도잉 학습 웹 애플리케이션입니다.

## 기능

- **Vision OCR 분석**: 교재나 표지판 사진을 업로드하면 Gemini 또는 OpenRouter Vision을 통해 문장 분해, 한국어 번역, 구문 분석(syntax tree), 발음/연음 힌트, 어휘 목록을 자동 추출합니다.
- **문장별 쉐도잉 훈련**:
  - `native 1.0x`: 원문 속도 청취
  - `shadow 0.75x`: 0.75배속 청취 → 따라 말하기 멈춤 구간 → 0.75배속 반복 청취의 쉐도잉 루프 제공
- **개선문 데모**: API 키 없이도 파리 개선문 실제 프랑스어 지문과 녹음된 원어민/TTS 트랙을 즉시 체험할 수 있습니다.
- **저장된 페이지 라이브러리**: 이전에 분석한 페이지를 캐시하여 언제든지 다시 불러와 복습할 수 있습니다.

## 개발 및 실행

```bash
npm install
npm run dev
```

서버 및 클라이언트가 포트 3000(http://0.0.0.0:3000)에서 실행됩니다.

## 환경 변수 (.env)

- `GEMINI_API_KEY`: Google Gemini API 키 (Vision OCR용)
- `VISION_MODEL`: gemini-3.8-flash 또는 gemini-2.5-flash
- `OPENROUTER_API_KEY`: OpenRouter API 키 (선택사항)
