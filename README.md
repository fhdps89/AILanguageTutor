# AI 다국어 쉐도잉 튜터 (AI Multilingual Language Tutor)

> **공식 빌드 버전:** `build 20261009-multilingual`  
> **최신 업데이트 일자:** 2026-10-09 (KST)  
> **라이브 서비스:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)

외국어 원서나 교재 사진 한 장으로 언어를 자동 판독하고, **Google Gemini TTS** 기반의 AI 합성 음성으로 문장마다 듣고 따라 읽는 지능형 다국어 쉐도잉 학습 웹 애플리케이션입니다.

---

## 🌟 핵심 기능 요약

1. **양방향 스마트 언어 학습 엔진 (언어 자동 판독)**
   - **외국어 모드 (한국인 대상):** 지원 언어: 중국어(한어병음, 성조 팁, CJK 노래방), 프랑스어, 영어, 일본어. 그 밖의 언어 사진은 저장 없이 안내 문구로 돌려보낸다. 슬래시(`/`) 끊어 읽기, 어휘 사전, ASCII 구문 분석도.
   - **한국어 원서 모드 (외국인 대상):** 코드는 있으나 사진 분석 지원 목록에는 없음(보류).
2. **음성 합성 및 쿼터 보호 (Gemini TTS & Quota Defense)**
   - `gemini-3.8-flash-lite-tts` (Voice: `Kore`) 기반 AI 합성 음성.
   - 브라우저 배속 노이즈를 피하려고 **0.75x / 0.5x를 서버에서 느린 발화로 합성** (`speechMetadata.style`).
   - SHA-256 디스크 캐싱 (`./cache/tts/`)을 통해 만든 음성은 다시 만들지 않고 바로 재생.
   - **일일 쿼터 방어:** 캐시 히트는 한도를 쓰지 않고, 하루 상한(사진 기기당 30장·전체 100장, 음성 기기당 100회·전체 500회)과 잔여 조회 API(`GET /api/quota`), 429 안내를 둔다. 상세는 `docs/architecture/audio-system.md`.
3. **학습자 몰입형 인터랙션**
   - **문장 카드 (한 줄 접기/펼치기):** 누른 줄만 펼쳐져 바로 재생된다. 듣기 속도 3단(1.0x / 0.75x / 0.5x), 「끊어 읽기」 칩, 접이식 「구문 분석도」·「핵심 어휘」. 상세는 `docs/features/screens.md`.
   - **노래방 칼싱크 (Karaoke Sync):** 원문 서체/줄바꿈을 유지한 채 단어를 따라가며 강조.
   - **문장 릴레이 플레이어:** 문장 사이 350ms를 쉬며 전체 본문을 이어서 재생.
   - **"내일은 여기서부터 시작" 북마크:** 원클릭 학습 위치 저장 및 상단 바로 이어하기.
4. **시작 화면·서재·안내 (2026-10-09 개편)**
   - 시작 화면(예시 영상, 「내 책 올려 보기」, 카메라, 「사진과 저작권 안내」), 내 수업만 담긴 서재, 카드마다 「이 설명이 틀렸어요」 신고, 사용 기록 안내 한 줄. 상세는 `docs/features/screens.md`.

---

## 🛠️ 기술 스택 & AI 모델

| 영역 | 기술 스택 / 모델 |
| :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide React |
| **Backend** | Node.js, Express, Multer, TypeScript (`tsx server.ts`) |
| **Vision AI** | Google Gemini 3.8 Flash (`@google/genai`) |
| **TTS Engine** | Google Gemini Native TTS (`gemini-3.8-flash-lite-tts`, Voice: `Kore`) |
| **Storage** | LocalStorage (개인 서재) + Server Cache (`cache/tts/`, `cache/library.json`) |

---

## 🚀 앱 실행법 (Quick Start)

### 로컬 및 개발 환경 실행
```bash
# 의존성 패키지 설치
npm install

# 개발 서버 실행 (포트 3000, Vite + Express)
npm run dev

# 프로덕션 빌드 검증
npm run build
```

### 환경 변수 안내 (`.env`)
AI Studio 클라우드에서는 자동 연동됩니다. 로컬 실행 시:
```env
GEMINI_API_KEY=your_api_key_here
VISION_MODEL=gemini-3.8-flash
TTS_VOICE=Kore
PORT=3000
ALLOWED_ORIGINS=
POSTHOG_KEY=
POSTHOG_HOST=
```
`POSTHOG_*`는 선택이며 값이 없으면 사용 기록을 보내지 않는다.

---

## 📚 심층 문서 아카이브 (Docs Hub)

상세 문서는 배포 격리를 위해 `docs/`에 둡니다. 날짜는 모두 **KST** 기준입니다.

- 📖 **[문서 허브 색인 (docs/README.md)](./docs/README.md)**
- 🔊 **[오디오 엔진 (docs/architecture/audio-system.md)](./docs/architecture/audio-system.md)**
- 🧠 **[튜터 파이프라인 (docs/architecture/tutor-pipeline.md)](./docs/architecture/tutor-pipeline.md)**
- 🇰🇷 **[한국어 원서 모드(보류) (docs/features/korean-learning-spec.md)](./docs/features/korean-learning-spec.md)**
- 🚀 **[Google SSO 기획 (docs/features/roadmap-sso.md)](./docs/features/roadmap-sso.md)**
- 🖥️ **[현재 화면과 동작 (docs/features/screens.md)](./docs/features/screens.md)**
- 📊 **[사용 기록 (docs/features/analytics.md)](./docs/features/analytics.md)** · **[PostHog 가이드](./docs/features/posthog-guide.md)**
- ⚖️ **[사진·저작권 안내 근거 (docs/policy/copyright-and-data.md)](./docs/policy/copyright-and-data.md)**
- 📜 **[변경 이력 (docs/history/changelog.md)](./docs/history/changelog.md)**
- 🛠️ **[트러블슈팅 (docs/troubleshooting/incident-analysis.md)](./docs/troubleshooting/incident-analysis.md)**
