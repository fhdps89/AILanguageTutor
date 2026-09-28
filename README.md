# AI 다국어 쉐도잉 튜터 (AI Multilingual Language Tutor)

외국어 원서나 교재 사진 한 장으로 언어를 자동 판독하고, **Google Gemini 3.8 Flash Native Speech** 기반의 고음질 원어민 음성으로 문장마다 듣고 따라 읽는 지능형 다국어 쉐도잉 학습 웹 애플리케이션입니다.

영어, 프랑스어, 일본어, 스페인어, 독일어, 중국어 등 전 세계 주요 언어를 완벽하게 지원합니다.

---

## 🌟 핵심 특징 및 혁신

### 1. 차세대 음성 합성: Google Gemini Native Speech
- **모델:** `gemini-3.8-flash-lite-tts` (공식 `@google/genai` SDK)
- **보이스 프로필:** `Kore` (원어민의 자연스러운 호흡, 억양, 질감 완벽 재현)
- **잡음 없는 네이티브 감속 발화 (0.75x / 0.5x):**
  - **기존 문제점 해결:** 브라우저에서 1.0x 음성을 강제로 늘릴 때 발생하는 금속성 울림과 특유의 '지지직'거리는 기계적 노이즈를 원천 차단했습니다.
  - **LLM 직접 발화:** Gemini TTS의 `speechMetadata.style`을 활용하여 모델이 발화 단계부터 학습자를 위한 0.75x(여유로운 쉐도잉 템포) 및 0.5x(음소별 정밀 조음)로 직접 천천히 말하도록 설계되었습니다.
  - 브라우저는 정상 속도(`playbackRate = 1.0`)로 깨끗한 원어민 육성을 그대로 재생합니다.

### 2. 스마트 오디오 디스크 캐싱 시스템
- `./cache/tts/[hash].wav` 경로에 `SHA-256(text + "_" + lang + "_" + voice + "_" + speed)` 해시로 영구 보관.
- **최초 호출:** Gemini TTS API를 호출하여 무손실 고음질 `.wav` 파일로 저장 (~1초)
- **재호출:** 디스크에서 즉시 스트리밍 반환 (응답 시간 ~0.003초 / 3ms)
- 자주 사용되는 단어 및 문장은 공용 캐시로 자동 공유되어 API 비용을 원천 절감합니다.

### 3. 멀티모달 비전 OCR & 언어 자동 감지
- **엔진:** Google Gemini 3.8 Flash Vision (`gemini-3.8-flash`)
- 교재나 표지판 사진을 업로드하면 원본 언어를 스스로 판독하여 원어 텍스트, 한국어 자연 번역, 슬래시(`/`) 끊어 읽기 청크, ASCII 구문 분석도(Syntax Tree), 발음/연음 힌트, 어휘 사전을 자동 생성합니다.
- (OpenRouter `z-ai/glm-5.3-flash`, xAI Grok Vision 멀티 프로바이더 옵션 지원)

### 4. "내일은 여기서부터 시작" 북마크 & 이어하기
- 문장 카드 우상단 `[여기서부터 시작]` 버튼으로 학습을 멈춘 지점을 원클릭 북마크.
- 지정된 문장은 골드 하이라이트 및 `📍 내일은 여기서부터 시작` 배지로 강조.
- 앱 접속 시 상단에 **[바로 이어하기]** 배너가 노출되며, 클릭 시 해당 페이지로 자동 이동 후 해당 문장으로 부드럽게 스크롤 및 포커스 펄스 효과 발동.

### 5. 다채로운 인터랙티브 학습 모드
- **끊어 읽기 모드 (Chunk Mode):** 의미 덩어리별 슬래시(`/`) 시각화 및 청크 터치 시 해당 구간 즉각 발음.
- **어휘 강조 모드 (Vocab Mode):** 문장 내 핵심 단어 하이라이트, 탭 시 단어 뜻/품사 툴팁 및 원어민 단어 발화.
- **문장 카드 모드:** 한국어 번역 대조, 원어민 1.0x 청취, 0.75x/0.5x 쉐도잉 연습 루프 (재생 → 따라 말하기 일시정지 → 재확인 재생).
- **전체 본문 플레이어 (FullPagePlayer):** 하단 플로팅 플레이어로 페이지 전체를 중단 없이 연속 청취.

---

## 🛠️ 기술 스택

| 영역 | 기술 스택 |
| :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide React |
| **Backend** | Node.js, Express, Multer, TypeScript (tsx) |
| **AI / Vision** | Google Gemini 3.8 Flash (`@google/genai`) |
| **TTS / Speech** | Google Gemini Native TTS (`gemini-3.8-flash-lite-tts`, Voice: Kore) |
| **Storage & Cache** | LocalStorage (개인 서재 분리), File System Cache (고속 오디오 `.wav` 및 메타데이터) |

---

## 📁 주요 디렉토리 및 파일 구조

```
├── cache/
│   ├── demo-arc/         # 개선문(L'ARC DE TRIOMPHE) 데모 본문 및 메타데이터
│   ├── tts/              # 속도별 Gemini Native Speech 캐시 (*.wav)
│   └── library.json      # 서버 백업 서재 목록
├── src/
│   ├── components/
│   │   ├── SentenceCard.tsx      # 문장별 카드, 쉐도잉 컨트롤러, 북마크 버튼
│   │   ├── FullPagePlayer.tsx    # 전체 본문 연속 재생 플레이어
│   │   ├── LibrarySidebar.tsx    # 서재 목록 및 검색 사이드바
│   │   └── UploadModal.tsx       # 사진 촬영 및 교재 이미지 업로드 모달
│   ├── utils/
│   │   └── audio.ts              # Gemini Native TTS 스트리밍 및 쉐도잉 루프 제어
│   ├── App.tsx                   # 메인 애플리케이션 및 라우팅
│   └── main.tsx                  # React 엔트리포인트
├── server.ts                     # Express 백엔드: Vision OCR, Gemini TTS 엔드포인트(/api/tts), 캐시 관리
├── demo_page.json                # 기본 제공 개선문 데모 교재 데이터
├── metadata.json                 # AI Studio 앱 설정 및 메타데이터
└── PROJECT_CONTEXT.md            # 아키텍처 및 상세 개발 인수인계 문서
```

---

## 🌐 라이브 서비스 및 배포 환경

### 1. 공식 운영 서비스 (Production)
- **라이브 서비스 URL:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)
- **인프라:** Google AI Studio Applet (Google Cloud Run 기반 컨테이너 런타임)
- **배포 방식:** AI Studio UI에서 **[Publish(게시)]** 버튼을 클릭하면 자동으로 프로덕션 빌드(`npm run build`)가 수행된 후, 글로벌 HTTPS 및 Google 고성능 CDN을 통해 전 세계 사용자에게 무중단 배포됩니다.
- **인증 및 자격 증명:** 별도의 `.env` 설정 없이도 Google AI Studio 내부 인증 시스템을 통해 Gemini 3.8 Flash Vision 및 Native Speech TTS API가 안전하게 자동 주입됩니다.

### 2. AI Studio 개발 환경 (Development Runtime)
- AI Studio 작업 영역의 클라우드 컨테이너에서 `npm run dev` (`tsx server.ts`)가 백그라운드로 실행됩니다.
- Node.js Express 백엔드 위에 Vite 프론트엔드 미들웨어가 통합 마운트되어 내부 3000번 포트에서 구동되며, 개발자 전용 프리뷰 URL(`https://ais-dev-...`)을 통해 실시간으로 변경 사항이 반영됩니다.

### 3. 로컬 독립 개발 환경 (선택 사항)
코드를 로컬 컴퓨터로 내려받아 독립 실행할 경우:
```bash
# 의존성 설치
npm install

# 로컬 개발 서버 실행 (포트 3000)
npm run dev

# 프로덕션 빌드 검증
npm run build
```

---

## 🔑 환경 변수 설정 안내

- **AI Studio 클라우드 서비스 환경:**
  - AI Studio 플랫폼에서 Google Gemini API 및 런타임 환경이 자동으로 연결되므로 **사용자가 환경 변수를 수동으로 입력할 필요가 없습니다.**
- **외부/로컬 환경 실행 시 (`.env`):**
  - 로컬 컴퓨터나 별도 호스팅 환경에서 실행할 경우 아래와 같이 `.env` 파일에 API 키를 설정합니다.

```env
# Google Gemini API (Vision OCR 및 Native TTS 필수)
GEMINI_API_KEY=AIzaSy...
VISION_MODEL=gemini-3.8-flash

# 선택 사항: 기타 Vision 프로바이더 지원
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=z-ai/glm-5.3-flash
XAI_API_KEY=xai-...
XAI_VISION_MODEL=grok-2-vision-1212
```

---

## 📖 라이선스 및 크레딧
- 음성 합성 엔진: Google Gemini Native Speech
- 본 애플리케이션의 모든 번역 및 음성은 학습 보조용으로 제공됩니다.
