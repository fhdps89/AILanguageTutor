# AI 다국어 쉐도잉 튜터 (AI Multilingual Language Tutor)

> **공식 빌드 버전:** `build 20261009-multilingual`  
> **최신 업데이트 일자:** 2026-10-09 (KST)  
> **라이브 서비스:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)

외국어 원서나 교재 사진 한 장으로 언어를 자동 판독하고, **Google Gemini Native Speech** 기반의 고음질 원어민 음성으로 문장마다 듣고 따라 읽는 지능형 다국어 쉐도잉 학습 웹 애플리케이션입니다.

---

## 🌟 핵심 기능 요약

1. **양방향 스마트 언어 학습 엔진 (언어 자동 판독)**
   - **외국어 모드 (한국인 대상):** 지원 언어는 중국어(한어병음, 성조 팁, CJK 노래방), 프랑스어, 영어, 일본어. 그 밖의 언어 사진은 저장 없이 안내 문구로 돌려보낸다. 슬래시(`/`) 끊어 읽기, 어휘 사전, ASCII 구문 분석도.
   - **한국어 원서 모드 (외국인 대상):** 코드는 유지하되 사진 분석은 현재 지원 목록에 없음. 영어 번역, 소리 로마자, 조사/어미 청크, 격식도 배지.
2. **차세대 음성 합성 및 쿼터 보호 (Gemini Native Speech & Quota Defense)**
   - `gemini-3.8-flash-lite-tts` (Voice: `Kore`) 기반 원어민 고음질 육성.
   - 브라우저 WSOLA 노이즈 없는 **0.75x / 0.5x 네이티브 감속 발화** (`speechMetadata.style`).
   - SHA-256 디스크 캐싱 (`./cache/tts/`)을 통한 3ms 초고속 스트리밍.
   - **일일 쿼터 방어:** 캐시 히트는 한도를 쓰지 않고, 하루 상한(사진 기기당 30장·전체 100장, 음성 기기당 100회·전체 500회)과 잔여 조회 API(`GET /api/quota`), 429 안내를 둔다. 상세는 `docs/architecture/audio-system.md`.
3. **학습자 몰입형 인터랙션**
   - **문장 카드 (한 줄 접기/펼치기):** 문장마다 한 줄만 보이고, 누른 줄만 펼쳐지며 바로 재생된다. 펼친 줄에는 진행 막대(처음 듣는 음성은 같은 자리에 로딩 상자), 「듣기 속도」 세 칸(1.0x 보통 / 0.75x 쉐도잉 / 0.5x 조음 훈련, 고른 속도는 다음 문장에도 이어지고 바꾸면 같은 문장을 처음부터 재생), 「끊어 읽기」 칩(재생 위치 따라 파랗게, 누르면 그 부분만 듣기), 맨 아래 접이식 「구문 분석도」·「핵심 어휘」(연음/성조 팁은 어휘 아래)가 있다.
   - **60fps 노래방 칼싱크 (Karaoke Sync):** 원문 서체/줄바꿈 유지 실시간 단어 하이라이트.
   - **문장 릴레이 플레이어:** 문장 간 350ms 자연스러운 호흡을 둔 전체 본문 연속 낭독.
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
AI Studio 클라우드 환경에서는 자동으로 연동됩니다. 로컬 독립 실행 시:
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

본 프로젝트는 Cloud Run 배포 격리 아키텍처를 준수하여 상세 문서를 `docs/` 디렉토리로 분리 관리합니다. 모든 변경 일자는 **KST (한국 표준시)** 기준으로 기록됩니다.

- 📖 **[문서 허브 색인 (docs/README.md)](./docs/README.md)**
- 🔊 **[오디오 & 음성 엔진 설계서 (docs/architecture/audio-system.md)](./docs/architecture/audio-system.md)**
- 🧠 **[튜터 프롬프트 파이프라인 설계서 (docs/architecture/tutor-pipeline.md)](./docs/architecture/tutor-pipeline.md)**
- 🇰🇷 **[한국어 원서 학습 모드 기획서 (docs/features/korean-learning-spec.md)](./docs/features/korean-learning-spec.md)**
- 🚀 **[Google SSO & 클라우드 영구 동기화 로드맵 (docs/features/roadmap-sso.md)](./docs/features/roadmap-sso.md)**
- 🖥️ **[현재 화면과 동작 (docs/features/screens.md)](./docs/features/screens.md)**
- 📊 **[사용 기록 (docs/features/analytics.md)](./docs/features/analytics.md)** · **[PostHog 가이드](./docs/features/posthog-guide.md)**
- ⚖️ **[사진·저작권 안내 근거 (docs/policy/copyright-and-data.md)](./docs/policy/copyright-and-data.md)**
- 📜 **[KST 기준 버전별 변경 이력 (docs/history/changelog.md)](./docs/history/changelog.md)**
- 🛠️ **[장애 분석 및 트러블슈팅 사례 (docs/troubleshooting/incident-analysis.md)](./docs/troubleshooting/incident-analysis.md)**
