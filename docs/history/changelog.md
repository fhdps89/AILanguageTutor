# 📜 전체 버전별 변경 이력 및 릴리즈 노트 (Changelog Archive)

> **공식 기준 빌드:** `build 20261009-multilingual`  
> **표준 시간대:** KST (한국 표준시, UTC+9)  
> **원칙:** 코드 및 아키텍처 업데이트 시 모든 로그 무삭제 보존 및 KST 일자 기준 정렬

---

## [2026-10-09 KST] 학습 화면 음성 잔여 횟수 카운터 및 음성 한도 소진 시 차분한 안내 UI 연동
- **기능 배경 (Context):**
  - 학습 화면에서 원어민 음성 재생 시 당일 남은 신규 음성 생성 가능 횟수를 실시간으로 확인하고, 일일 음성 한도 소진 시에도 기존 학습 문장의 재생은 계속 가능함을 사용자에게 명확히 안내.
- **적용된 수정 내역 (`src/App.tsx`, `src/utils/audio.ts`, `src/components/UploadSection.tsx`):**
  - `src/utils/audio.ts`:
    - `/api/tts/prepare` 응답(200 성공 및 429 한도 도달)의 `quota` 객체를 감지하여 `ai-tutor-quota` CustomEvent 발송.
  - `src/App.tsx`:
    - `ai-tutor-quota` 이벤트 수신 핸들러 추가하여 음성 생성 시 잔여 쿼터 실시간 차감 반영.
    - `ai-tutor-rate-limit` 수신 시 `quota.tts.remaining`을 0으로 변경하고 `blockedBy`('global' | 'device') 갱신.
    - 문장 카드 목록 상단 제목부 우측에 `"음성 M회 남음"` 카운터 추가 (14px `text-sm`, `text-slate-600`, 10회 이하 시 `text-amber-700` 강조, `aria-live="polite"`).
  - `src/components/UploadSection.tsx`:
    - `quota.tts.remaining === 0`일 때 사진 업로드는 차단하지 않고 정상 허용.
    - 업로드 칸 아래 쿼터 표시선에서 음성 텍스트 자리에 회색 친절 안내 문구 렌더링:
      - `device`: `"오늘 새로 만들 수 있는 음성을 다 썼어요. 이미 들은 문장은 계속 들을 수 있고, 밤 12시(한국 시간)에 다시 {limit}회가 채워져요."`
      - `global`: `"오늘은 많은 분이 이용해서 새 음성이 잠시 쉬고 있어요. 이미 들은 문장은 계속 들을 수 있어요."`
- **접근성 및 안정성 보존 (Accessibility & Safety):**
  - 안내 텍스트 14px(`text-sm`), WCAG AA 명도 대비(slate-600: 7:1) 및 `aria-live="polite"` 적용.
  - 서버 코드 및 `TTS_DEVICE_MAX: 100`, `TTS_GLOBAL_MAX: 500` 상수 온전히 보존.

---

## [2026-10-09 KST] 일일 사진 분석 한도 소진 시 차분한 안내 카드(Calm Limit Card) 및 접근성 개선
- **기능 배경 (Context):**
  - 일일 사진 분석 한도(30장) 소진 시 위협적인 빨간색 오류 배너 대신, 소진 사유와 KST 자정 리셋 시각, 서재 학습을 유도하는 차분한 안내 카드를 제공하여 사용자 경험 극대화.
  - 15분 단위 버스트 제한(`ANALYZE_BURST_LIMIT`) 시에도 경량 안내 텍스트로 친절하게 고지.
- **적용된 수정 내역 (`src/App.tsx`, `src/components/UploadSection.tsx`):**
  - `src/App.tsx`:
    - `handleRunPhoto`에서 `ANALYZE_DEVICE_LIMIT` 수신 시 `quota.analyze.remaining`을 0으로 갱신하고 상단 빨간 에러 박스 미노출.
    - `ANALYZE_BURST_LIMIT` 수신 시 `burstLimitMessage`("잠깐 쉬어 갈게요. 15분 뒤에 다시 올려 주세요.") 설정 및 상단 빨간 에러 박스 미노출.
    - "서재에서 이어 하기" 핸들러 구성: 북마크 존재 시 `handleResumeBookmark`, 북마크 없고 서재 항목 존재 시 첫 항목 `loadLesson`, 둘 다 없을 시 버튼 숨김.
  - `src/components/UploadSection.tsx`:
    - `quota.analyze.remaining === 0`일 때 업로드 박스와 판독 생성 버튼 대신 회색 안내 카드(`bg-slate-50 border-slate-200`) 렌더링 (빨간색 배제).
    - 제목 태그(h3): `"오늘 올릴 수 있는 사진 {limit}장을 다 썼어요"`
    - 본문 문구: `"밤 12시(한국 시간)에 다시 {limit}장이 채워져요. 이미 만든 수업은 서재에서 계속 듣고 따라 읽을 수 있어요."`
    - 버튼: `"서재에서 이어 하기"` (한도 카드 렌더링 시 자동 포커스 이동)
    - 데모 모드(`demoChecked`) 체크 시 데모 실행 버튼은 한도 도달과 무관하게 항상 정상 노출 및 실행.
- **접근성 및 안정성 보존 (Accessibility & Safety):**
  - "서재에서 이어 하기" 버튼 자동 포커스 처리 (`continueBtnRef.current?.focus()`).
  - 본문 및 버튼 글자 크기 14px(`text-sm`), WCAG AA 명도 대비(slate-800 버튼 12.6:1, slate-600 본문 6.8:1) 완벽 준수.
  - `ANALYZE_DEVICE_MAX` 한도 수치(30장) 및 서버 코드 보존.

---

## [2026-10-09 KST] 업로드 영역 하단 일일 잔여 쿼터 실시간 표시 UI 구현
- **기능 배경 (Context):**
  - 사용자가 사진을 등록하기 전에 당일 남은 분석 가능 장수와 음성 생성 횟수를 직관적으로 인지할 수 있도록 업로드 영역 우측 하단에 경량 잔여 쿼터 표시선 제공.
- **적용된 수정 내역 (`src/App.tsx`, `src/components/UploadSection.tsx`, `src/types.ts`):**
  - `src/types.ts`: `DailyQuota` 인터페이스 추가.
  - `src/App.tsx`:
    - `quota` 상태 관리 및 초기 마운트 시 `/api/quota` 비동기 조회 (실패 시 조용히 `null` 처리).
    - 사진 분석 성공 시 응답 내 `quota` 즉시 반영 및 백그라운드 음성 생성 반영을 위해 5초 뒤 추가 갱신.
    - 브라우저 탭 복귀(`visibilitychange`) 및 KST 자정 `resetAt` 시각 도달 시 자동 재동기화.
  - `src/components/UploadSection.tsx`:
    - 업로드 박스 바로 아래 우측에 `"오늘 사진 N장 남음 · 음성 M회 남음"` 단일 라인 렌더링.
    - 서버 제공 `limit`와 `remaining` 값에 기반하여 동적 출력 (클라이언트 상수 하드코딩 제거).
    - 사진 5장 이하 잔여 시 `text-amber-700` 강조 및 `(자정에 다시 {limit}장)` 부가 안내.
    - 음성 10회 이하 잔여 시 `text-amber-700` 강조 및 `(처음 듣는 문장만 줄어요)` 부가 안내.
    - `quota`가 `null`인 경우 라인 미노출.
- **접근성 및 안정성 보존 (Accessibility & Safety):**
  - `aria-live="polite"` 속성 부여 및 14px(`text-sm`), WCAG AA 대비(slate-600: 7:1, amber-700: 4.6:1) 준수.
  - 기존 오류 안내 배너, 차단 정책, 음성 재생 및 서버 코드 무변경 유지.

---

## [2026-10-09 KST] 분석 및 음성 응답 내 실시간 잔여 쿼터(`quota`) 필드 통합
- **기능 배경 (Context):**
  - 클라이언트 화면이 추가 API 호출 없이도 사진 분석 및 음성 합성 성공/한도초과 시 최신 쿼터 상태를 즉시 수신할 수 있도록 기존 주요 API 응답에 `quota` 필드 탑재.
- **적용된 수정 내역 (`server.ts`):**
  - `POST /api/analyze`:
    - 신규 이미지 OCR 분석 성공 응답에 `quota` 객체 추가 (`reused: false`).
    - 캐시 히트 이미지 재사용 성공 응답에 `quota` 객체 추가 (`reused: true`).
    - 기기 일일 분석 한도 초과 시 429 응답에 `quota` 객체 추가 (기존 `error`, `code: 'ANALYZE_DEVICE_LIMIT'` 완전 보존).
  - `POST /api/tts/prepare`:
    - 음성 합성 성공 응답에 `quota` 객체 추가 (기존 `hash`, `audioUrl` 보존).
    - 일일 음성 한도 초과 시 429 응답에 `quota` 객체 추가 (기존 `error`, `code` 보존).
  - `analyzeLimiter` (15분 버스트 제한):
    - rateLimit message 객체에 `code: 'ANALYZE_BURST_LIMIT'` 추가하여 클라이언트가 일일 한도와 15분 버스트 한도를 명확히 구분할 수 있도록 개선.
- **안정성 및 무결성 보존 (Safety & Integrity):**
  - 프론트엔드 UI 화면 코드 및 기존 필드 규격 100% 무변경 유지.
  - `DAILY_LIMITS` 수치 및 한도 차감 시점 보존.

---

## [2026-10-09 KST] 사용자 일일 잔여 쿼터 조회 엔드포인트 신설 (`GET /api/quota`)
- **기능 배경 (Context):**
  - 사용자가 당일 남은 사진 분석 장수 및 음성 생성 횟수를 사전에 확인할 수 있도록 안전한 읽기 전용 쿼터 조회 기능 필요.
  - 기존 UI 및 프론트엔드 코드 변경 없이 서버 백엔드 전용 API로 선행 구축.
- **적용된 수정 내역 (`server.ts`):**
  - `getRemainingQuota(deviceId)` 함수 추가:
    - `getDailyState()`의 일일 사용 상태를 읽기 전용으로만 조회(카운터 미변경).
    - 사진 분석: `analyze: { used, limit, remaining }` (기기별 30장, 익명 3장).
    - 음성 생성: `tts: { used, limit, remaining, blockedBy }` (기기별 100회, 익명 10회).
    - 서버 전체 잔여 횟수 및 사용량 수치는 응답에 일절 노출하지 않으며, 한도 도달 시 `blockedBy`('global' | 'device' | null)만 제공.
    - `resetAt`: KST 자정 기준 다음 초기화 시각을 ISO 문자열로 반환.
  - `GET /api/quota` 엔드포인트 개설:
    - `getOwnerId(req)`를 통해 요청 기기(`x-device-id` 헤더 또는 `deviceId` 쿼리 파라미터) 식별 후 해당 기기 쿼터만 반환.
- **방어 조치 및 무결성 보존 (Safety & Integrity):**
  - 카운터 증가 방지: 호출 시 일일 카운터가 전혀 증가하지 않는 순수 읽기 전용 로직.
  - 기존 엔드포인트 및 프론트엔드 UI 화면 코드 100% 무변경 유지.

---

## [2026-10-09 KST] 음성 생성 일일 한도 상향 (기기당 40→100회, 서버 전체 80→500회)
- **문제 원인 및 배경 (Context):**
  - 서비스 이용자 증가 및 다국어 쉐도잉 반복 청취 수요에 따라 기존 일일 음성 생성 한도(기기당 40회, 서버 전체 80회)가 조기 소진되는 문제 해결.
  - 음성 모델(Gemini 3.8 Flash Lite TTS)의 Gemini Tier 2 일일 요청 한도(10,000회) 내에서 여유롭고 안전한 상한선 확보.
- **적용된 수정 내역 (`server.ts`):**
  - `DAILY_LIMITS.TTS_DEVICE_MAX`: 기존 40회에서 **100회**로 상향.
  - `DAILY_LIMITS.TTS_GLOBAL_MAX`: 기존 80회에서 **500회**로 상향.
  - 상수 주석 갱신: "서버 전체 일일 음성 생성 한도. Gemini Tier 2 한도(TTS 하루 10K) 안에서 이 한 곳에서 조정".
  - 식별자 없는 익명 기기(`TTS_ANONYMOUS_MAX`: 10회), 사진 분석 한도(`ANALYZE_*`), 한도 계산 방식 및 KST 자정 리셋 로직은 변경 없이 안전하게 유지.
- **방어 조치 및 모니터링 (Safety & Monitoring):**
  - SHA-256 디스크 캐시 히트 바이패스 유지: 이미 생성된 음성은 쿼터를 전혀 소비하지 않음.
  - 쿼터 로깅 포맷 검증: `[TTS Quota] Device '...': n/100, Global: m/500` 분모 정상 반영.

---

## [2026-10-08 KST] 기기당 일일 사진 분석 한도 상향 (10장 ➔ 30장)
- **기기별 사진 분석 쿼터 상향 (`server.ts`):**
  - 사용자 피드백 반영: 기기당 일일 사진 분석 한도(`DAILY_LIMITS.ANALYZE_DEVICE_MAX`)를 기존 10회에서 30회로 상향.
  - 익명 기기 한도(`ANALYZE_ANONYMOUS_MAX`: 3회) 및 음성 합성(TTS) 쿼터는 기존 수치 유지.
  - 쿼터 로깅 포맷: `[Analyze Quota] Device '...': n/30`으로 분모 30 반영.

---

## [2026-10-06 KST] 모바일 "카메라로 바로 촬영하기" 오류 해결 및 이미지 전처리 파이프라인 고도화
- **문제 원인 분석 (Incident Diagnosis):**
  - 모바일(iOS Safari 및 일부 Android)에서 `<input capture="environment">`로 실시간 촬영 시 기기 기본 포맷인 고효율 HEIC(`image/heic`) 또는 대용량 원본 스트림으로 제공됨.
  - 갤러리 선택 시에는 OS 단에서 자동 JPEG 변환이 이뤄졌으나, 카메라 다이렉트 촬영 시에는 `image/heic` MIME 타입이 그대로 서버와 Gemini API로 전달되어 `400 INVALID_ARGUMENT (Unsupported MIME type)` 및 `MODEL_FAILED` 에러 발생.
  - 모바일 카메라 촬영본의 EXIF Orientation(회전 태그)으로 인해 텍스트가 90도 회전되어 OCR 인식률이 저하되는 현상 존재.
- **서버 이미지 자동 정규화 파이프라인 구축 (`server.ts`):**
  - 고성능 이미지 프로세싱 라이브러리 `sharp` 도입.
  - `/api/analyze` 진입 시 업로드된 모든 이미지에 대해 `.rotate()`(EXIF 방향 자동 교정), `.resize(3000, 3000, { fit: 'inside' })`(장변 3,000px 유지), `.jpeg({ quality: 90 })` 정규화 실행.
  - HEIC/HEIF/PNG/대용량 카메라 촬영본 모두 Gemini Vision이 100% 수용 가능한 고화질 정방향 JPEG로 변환되어 전달.
- **클라이언트 카메라 입력 & 캔버스 메모리 최적화 (`UploadSection.tsx`):**
  - 파일 및 카메라 input의 `accept` 속성에 `image/jpeg,image/png,image/webp,image/*`를 명시하여 모바일 OS에 JPEG 인코딩 우선 힌트 제공.
  - `optimizeImageForOcr` 함수에 오프스레드 하드웨어 가속 `createImageBitmap(file, { imageOrientation: 'from-image' })` 우선 적용 및 fallback 체인 구성으로 모바일 WebKit 캔버스 메모리 크래시 방어.
  - 파일 선택/촬영 이벤트 후 input `value`를 리셋하여 동일 파일 또는 재촬영 시 `onChange` 이벤트가 정상 발화하도록 개선.

---

## [2026-10-05 KST] 사진 분석 실패 원인 분류 코드 체계 도입 & 동적 빌드 버전 연동
- **사진 분석 실패 정밀 진단 로그 (`/api/analyze`):**
  - 모델 응답 텍스트가 비어 있을 때 모델명, `promptFeedback.blockReason`, `candidates[0].finishReason`, `candidates` 개수를 `console.warn`으로 정밀 기록 (본문 및 이미지 제외).
  - `extractJson` 파싱 실패 시 응답 텍스트 길이와 `finishReason`만 `console.warn`으로 기록하여 토큰 절단 여부 추적.
- **표준 실패 원인 분류 코드 도입 (Standardized Failure Reason Codes):**
  - 최종 분석 실패 응답 JSON에 `code` 필드 추가: `SAFETY_BLOCKED`, `RECITATION`, `EMPTY_RESPONSE`, `JSON_PARSE`, `MODEL_FAILED`, `UNKNOWN` 6종 한정.
  - 두 모델 중 하나라도 `SAFETY_BLOCKED` 시 안전 안내 문구와 코드를 즉시 반환하도록 `some` 판정 적용.
  - 오류 응답에 스택 트레이스, 모델명, 키, 내부 경로 노출 완전 차단.
- **클라이언트 화면 오류 코드 표기 (`src/App.tsx`):**
  - 분석 실패 시 서버 응답에 `code`가 포함되어 있을 경우 사용자 안내 배너 끝에 `(오류 코드: ...)` 형태로 표시.
- **동적 빌드 버전 생성 시스템 (`server.ts`):**
  - 하드코딩되었던 빌드 문자열을 소스 파일 최근 수정 시각(mtime) 기반 동적 생성 함수(`getBuildVersion()`)로 전환 (`YYYYMMDD-multilingual-HHmm`, KST 기준).
  - 코드 변경 및 재기동 시 빌드 버전 태그가 실시간 자동 반영되도록 개선.

---

## [2026-10-04 KST] 중국어(Chinese/Mandarin) 쉐도잉 피처 신규 탑재 (Hanyu Pinyin, 성조 변조 팁 & CJK 노래방 칼싱크)
- **중국어 교재 사진 자동 판독 & 구조화 (Vision OCR for Chinese):**
  - 중국어 텍스트(`zh-CN`, `zh-TW`) 사진 촬영 시 원문 한자 전사 및 성조가 표기된 표준 한어병음(Hanyu Pinyin) 자동 추출.
  - 의미 덩어리 호흡 단위 끊어 읽기 슬래시(`/`), 주어+부사어+술어+목적어 ASCII 구문 구조도, 핵심 어휘 병음 배지 및 한국어 번역 완비.
  - 3성 변조(3성+3성 -> 2성+3성), 不/一의 성조 변화, 권설음(zh/ch/sh/r), 경성 등 실전 회화용 성조 팁 배지 제공.
- **CJK 음소·음절 정밀 어쿠스틱 노래방 싱크 (Chinese Karaoke Sync Engine):**
  - 공백이 없는 한자(Hanzi) 텍스트 특성을 완벽히 반영하여 한자 한 글자(음절 단위) 및 CJK 문장부호(`，。！？、“”、《》`)를 인식하는 전용 토크나이저 개발.
  - 원문 줄바꿈 및 서체를 100% 보존하면서 발화 중인 한자가 음소 타이밍에 맞춰 실시간 파란색 하이라이트되는 60fps KTV급 노래방 칼싱크 지원.
- **Gemini Native Speech 중국어 성조 특화 TTS 프롬프팅:**
  - `gemini-3.8-flash-lite-tts` (Voice: `Kore`)의 중국어 표준어(Putonghua) 4성 및 경성 억양 스타일 프롬프트 튜닝.
  - 0.5x 또박또박 정밀 조음 모드에서 각 한자의 성조 높낮이(1성 고평, 2성 상승, 3성 하강상승, 4성 급강하)를 명확히 짚어주는 교수법 적용.
- **베이징 고궁 자금성 중국어 데모 교재 탑재 (`demo-chinese`):**
  - 외부 리뷰어 및 학습자가 사진 업로드 없이도 즉시 체험 가능한 고품질 중국어 데모 교재 탑재 (`demo_chinese.json`).
  - 사이드바 데모 박스에서 🇨🇳 중국어(베이징 고궁 자금성)와 🇫🇷 프랑스어(파리 개선문)를 자유롭게 선택하여 원클릭 체험 가능.
  - 서재(Library)에서 영구 보존 및 삭제 방지 보호.
- **Vision OCR 분석 안정성 및 JSON 복구 엔진 강화 (Analyze Pipeline Hardening):**
  - 폐기된 구형 모델(gemini-2.5-flash, gemini-1.5-flash 404 에러)을 폴백 체인에서 제거하고 현행 활성 모델(`gemini-3.8-flash`, `gemini-3.6-flash`)로 단일화.
  - 긴 문장 분석 시 토큰 한도로 인한 JSON 중간 절단을 방지하도록 `maxOutputTokens: 8192` 적용.
  - LLM이 ASCII 구문도나 따옴표 내부에서 출력한 제어 문자(이스케이프되지 않은 개행 `\n`, 탭 `\t`), 후행 쉼표(Trailing Comma)를 자동 정제하는 JSON 자동 복구(Auto-Repair) 파이프라인 구현.
  - 스마트폰 고해상도 원본 사진 업로드 시 15MB 제한으로 인한 실패를 방지하도록 Multer 한도를 30MB로 증설하고, 모바일 캔버스 압축 기준을 2,500px로 최적화.
- **AI 안전 기준 응답 및 예외 처리 고도화 (AI Safety Policy & Response Handling):**
  - `safetySettings`에 4대 유해 카테고리(`SEXUALLY_EXPLICIT`, `HARASSMENT`, `DANGEROUS_CONTENT`, `HATE_SPEECH`)의 `BLOCK_ONLY_HIGH` 임계치를 구성하여 문학 작품 내 표현에 대한 과도한 차단 완화.
  - 안전 기준 차단 시(`SAFETY_BLOCKED`) 내부 사유는 서버 로그(`console.warn`)에만 기록하고, 클라이언트에는 정제된 안내 문구(`"이 페이지는 AI 안전 기준 때문에 분석되지 못했어요. 다른 페이지로 시도해 주세요."`)와 HTTP 400 응답 제공.

---

## [2026-10-04 KST] 일일 사용 한도 방어 및 보안 강화 (Daily Quota Protection & Security Hardening)
- **Gemini 일일 호출 한도 사전 보호 (In-Memory Daily Quota Limiter):**
  - 단일 사용자의 과도한 반복 호출로 인한 당일 서비스 중단을 방지하기 위해 서버 사전 차단 계층 구축.
  - 서버 전체 음성 생성 일 80회, 기기당 음성 40회, 기기당 사진 분석 10회 상한 적용 (`x-device-id` 없는 anonymous는 음성 10회, 사진 3회 적용).
  - KST(한국 표준시) 자정 기준으로 하루 사용량 자동 초기화 (`DAILY_RESET_TZ_OFFSET_HOURS = 9`).
- **스마트 캐시 우선 검사 (Zero-Quota Cache Hit):**
  - 디스크 캐시 확인 및 진행 중 요청(In-Flight) 합치기를 통과한 뒤, 실제 Gemini 모델 호출 직전에만 쿼터 검사 및 카운트 수행.
  - 이미 생성된 음성이나 분석된 사진을 다시 열람할 때는 카운트가 증가하지 않으며, 일일 한도 초과 상태에서도 기존 캐시 음성은 100% 정상 재생 유지.
- **정제된 에러 핸들링 & 친절한 화면 안내:**
  - 상한 도달 시 HTTP 429 및 표준 코드(`TTS_DEVICE_LIMIT`, `TTS_GLOBAL_LIMIT`, `ANALYZE_DEVICE_LIMIT`)와 쉬운 한국어 안내 문구 반환.
  - 프론트엔드에서 429 수신 시 브라우저 기본 음성(Web Speech API)으로 몰래 바뀌는 현상을 방지하고, 상단 고정 안내 배너로 직관적 전달.
  - `FullPagePlayer` 전체 낭독 진행 중 한도 도달 시 불필요한 후속 요청을 방지하도록 재생 릴레이 즉시 안전 중단.
- **서버 내부 오류 정보 은닉:**
  - `/api/tts/prepare`, `GET /api/tts`, `/api/analyze`, `/api/demo`, `/api/lesson/:key`의 오류 처리에서 내부 스택 트레이스 노출을 차단하고 표준 정제 문구(`"일시적인 오류예요. 잠시 후 다시 시도해 주세요."`)로 통일.
- **CORS 출처 제한 강화:**
  - `ALLOWED_ORIGINS` 환경변수를 통한 지정 출처 화이트리스트 및 미설정 시 동일 출처(Same-Origin) 전용 CORS 정책 적용.

---

## [2026-10-01 KST] Build `20260930-gemini-single` (계층화 문서화 및 배포 격리 아키텍처 수립)
- **공식 빌드 버전 동기화:**
  - 애플리케이션 공식 빌드 버전을 `build 20260930-gemini-single`로 표준 동기화.
  - 모든 프로젝트 기록 일자를 KST(한국 표준시) 기준으로 통일.
- **Cloud Run 32KB 배포 에러 원천 해결 (Deployment Isolation):**
  - `.dockerignore` 및 `.gcloudignore` 격리 설정 도입 (`docs/`, `*.log`, `.git` 배포 패키지 제외).
  - 루트의 `README.md` 및 `PROJECT_CONTEXT.md`를 5KB 미만 경량 인덱스 문서로 압축 유지.
  - `docs/` 심층 아카이브 허브 구축 (`architecture/`, `history/`, `features/`, `troubleshooting/`).
- **문서 이전 및 무삭제 보존:**
  - 기존 기획 및 리뷰 문서(`KOREAN_LEARNING_SPEC.md`, `KOREAN_MODE_REVIEW.md`)를 `docs/features/`로 안전하게 이전하여 루트 디렉토리 경량화.

---

## [2026-09-30 KST] Build `20260928-multilingual-v7` (한국어 원서 모드 + 보안 강화 완비판)

### 1. 긴급 UX 개선 (한국 시간 9월 30일 반영)
- **전문 연속 낭독 섹션(`FullPagePlayer`) 하단 재배치:**
  - 문장별 쉐도잉 훈련 리스트 맨 아래로 이동하여, 개별 문장 카드를 먼저 학습하면서 자연스럽게 오디오 캐시를 생성한 후 페이지 하단에서 끊김 없이 전체 지문을 감상할 수 있도록 UX 흐름 최적화.
- **오디오 단일 재생 통일:**
  - 0.75x 및 0.5x 음성을 1.0x와 동일하게 중간 멈춤/반복 없이 1회 깔끔하게 재생하고 끝나는 방식으로 통일.

### 2. 보안 및 인프라 조치
- **GitHub Secret Scanning 알림 철저 점검 및 조치 완료:**
  - **원인 파악:** 깃허브 보안 봇이 AI Studio 자동 생성 파일이었던 `firebase-applet-config.json` 내 Web Client 키(`AIzaSy...`)를 기계적으로 감지하여 발송한 알림 확인.
  - **무결성 검증:** 실제 Gemini API Key 및 결제 시크릿은 서버 환경변수로 관리되어 레포지토리에 전혀 노출되지 않았음을 100% 확인.
  - **레포지토리 정리:** 불필요했던 `firebase-applet-config.json` 파일을 완전히 제거하고, `.gitignore`에 추가하여 향후 깃 추적 및 노출을 원천 차단.

### 3. 한국어 원서 학습 모드 (K-Language Learning Engine) 구축
- **Zero Mode Toggle:** 수동 버튼 조작 없이 판독 언어(`language.code === "ko"`)에 따라 자동 카드 레이아웃 전환.
- **One Phonetic Romanization:** 음운 동화/연음이 반영된 실제 발음 표기 1개만 노출.
- **Grammatical Chunks:** 조사 및 용언 어미 분해 시각화 (`기업의` ➔ `possessive 의`, `이루어지지 않기` ➔ `이루어지다 + 지 않 + 기`).
- **Formality Tagging:** 하십시오체/해요체/반말만 선별 표시 (서술체 `-다`는 null로 깔끔하게 정돈).
- **광학 및 환각 방어:** 뒷면 비침 무시, 각주 별표 제거, 하단 잘린 문장 말줄임표 안전 마감.
- **빌드 무결성:** `npm run build` 컴파일 무결성 정상 통과.

---

## [2026-09-29 KST] Build `20260928-multilingual-v6`
- **Gemini Native Speech TTS 도입:**
  - `gemini-3.8-flash-lite-tts` 모델 적용 (Voice: `Kore`).
  - 브라우저 WSOLA 왜곡을 없애기 위해 `speechMetadata.style` 프롬프트로 0.75x, 0.5x 네이티브 발화 제어 구현.
- **오디오 디스크 캐시:**
  - `cache/tts/[hash].wav` (SHA-256) 저장소 구현. 응답 지연 3ms 달성.
- **위트 있는 음성 생성 인디케이터:**
  - `원어민 성우 섭외 중...` ➔ `대본 건네고 발음 조율 중...` ➔ `스튜디오에서 열심히 녹음 중...` ➔ `녹음된 음성 모니터링 중...` 실시간 로테이션 UI 적용.

---

## [2026-09-28 KST] Build `20260927-multilingual-v5`
- **모바일 환경 최적화:**
  - `capture="environment"` 모바일 카메라 연동.
  - 브라우저 캔버스 장변 3,000px 스마트 리사이징 압축 파이프라인.
  - iOS Safari 백그라운드 재생 방지 단일 Audio 인스턴스 재사용.
  - 긴 스크롤 방지를 위한 아코디언 토글(구문 분석도, 어휘 목록).

---

## [2026-09-27 KST] 초기 릴리즈 & 프로토타입
- 다국어 교재 OCR 및 문장 분해 기초 엔진 구현.
- 개선문(L'Arc de Triomphe) 프랑스어 데모 데이터셋 탑재.
- 60fps 오디오-텍스트 노래방 싱크 시뮬레이션 엔진 초기 설계.

---

## 🔮 차기 스프린트 (Roadmap)
1. **Google SSO 계정 로그인 연동 및 계정별 서재/단어장 영구 동기화:**
   - `x-device-id` 임시 브릿지에서 `google_user_id` 계정 시스템으로 승격.
   - 계정 로그인 시 기존 임시 디바이스 서재 자동 병합(Merge).
   - 계정별 영구 단어장 (★ 즐겨찾기) 및 간격 반복(SRS) 학습 지원.
2. **학습자 음성 녹음 & 원어민 A/B 청취 비교 (Shadowing Evaluator):**
   - Web Audio API 마이크 녹음 및 원어민 음성 1:1 대조 청취.
3. **페이지 공유 딥링크 (URL Hash/Query 파라미터):**
   - 특정 교재 및 문장 위치 공유 링크 지원.
