# 🔊 오디오 및 음성 시스템 아키텍처 설계서

## 1. 개요 및 설계 원칙
본 시스템은 어학 학습자가 원어민의 음성을 가장 선명하고 자연스럽게 듣고 쉐도잉(Shadowing)할 수 있도록 고안된 하이브리드 음성 파이프라인입니다.

---

## 2. Gemini Native Speech TTS 엔진

### 2.1 모델 및 보이스
- **모델:** `gemini-3.8-flash-lite-tts`
- **SDK:** `@google/genai` (공식 TypeScript SDK)
- **보이스 프로필:** `Kore` (표준 원어민 발화 억양 및 톤 보존)

### 2.2 무잡음 감속 발화 (0.75x / 0.5x) 아키텍처
- **기존 브라우저 배속 방식의 한계:**
  - `HTML5 Audio`의 `playbackRate = 0.75` 또는 `0.5`를 적용하면 브라우저 내장 WSOLA(Waveform Similarity Overlap-Add) 알고리즘으로 인해 페이징 노이즈, 쇳소리 울림, 지지직거리는 잡음이 발생하여 어학 학습용으로 부적합함.
- **Gemini Native Speech 스타일 지시 해결책:**
  - 서버단(`/api/tts`)에서 `speechMetadata.style` 파라미터를 통해 LLM에게 발화 속도와 조음 방식을 직접 지시함.
  - **1.0x (표준 속도):** 자연스러운 네이티브 억양 및 리듬으로 발화.
  - **0.75x (학습자 템포):** 학습자를 위해 여유로운 템포로 호흡과 억양을 살려 부드럽고 또렷하게 발화.
  - **0.5x (정밀 조음):** 초급자를 위해 각 음소와 모음, 자음을 하나하나 정성스럽고 또렷하게 조음(articulate)하여 발화.
  - 클라이언트는 언제나 정상 속도(`playbackRate = 1.0`)로 수신된 고음질 WAV를 재생하므로 잡음이 0%입니다.

---

## 3. 고속 디스크 캐싱 시스템

### 3.1 캐시 키 생성 및 저장
- **저장 디렉토리:** `./cache/tts/[hash].wav`
- **해시 키 알고리즘:**
  ```typescript
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${text}_${lang}_${voice}_${speed}`)
    .digest('hex');
  ```
- **성능 수치:**
  - **최초 생성 (Cache Miss):** Gemini TTS API 호출 및 WAV 디스크 쓰기 (~1.0s)
  - **이후 호출 (Cache Hit):** 디스크 즉시 읽기 및 스트리밍 응답 (~0.003s / 3ms)
- **공용 캐시 재사용:** 동일 어휘 및 문장은 모든 사용자 간에 공유되어 API 비용이 0원으로 수렴합니다.

---

## 4. 프론트엔드 오디오 재생 최적화

### 4.1 iOS Safari 백그라운드 & 단일 오디오 객체 재사용
- 모바일 Safari의 엄격한 오디오 생성 제한 정책(사용자 제스처 없이 새 오디오 생성 차단)을 극복하기 위해 `Single Audio Element Reuse` 패턴을 적용합니다.
- 단일 `HTMLAudioElement` 인스턴스의 `src`를 교체하며 재생하여 문장 릴레이 중 끊김 현상을 방지합니다.

### 4.2 60fps 가중치 노래방 싱크 엔진 (`karaokeSync.ts`)
- 원문의 폰트(Serif), 줄바꿈, 띄어쓰기를 100% 보존하면서 현재 발음 단어를 실시간 하이라이트.
- `requestAnimationFrame` 기반 60fps 틱 루프.
- 음소/모음/쉼표 호흡 가중치 모델링을 적용하여 누적 시차 0% 유지.

### 4.3 문장 릴레이 전체 낭독 플로우
- 문장 카드 쉐도잉 리스트 하단에 전체 지문 플레이어(`FullPagePlayer`) 배치.
- 문장 간 350ms 자연스러운 숨 고르기(Breath Cadence)를 두어 자연스러운 낭독 경험 제공.

---

## 5. 일일 호출 한도 및 쿼터 관리 시스템 (Daily Quota Architecture)

### 5.1 일일 한도 설정 (상수 분리)
Gemini Tier 2 기준 음성 모델(Gemini 3.8 Flash Lite TTS)의 일일 요청 한도(10,000회) 안에서 안정적인 쿼터 관리를 위해 서버 상단에 안전 상한을 정의합니다.
- **서버 전체 일일 음성 생성:** 500회 (`TTS_GLOBAL_MAX`)
- **기기당 일일 음성 생성:** 100회 (`TTS_DEVICE_MAX`)
- **식별자 미제공 기기 (`anonymous`):** 10회 (`TTS_ANONYMOUS_MAX`)
- **일일 리셋 기준 시각:** KST 자정(00:00) 기준 (`DAILY_RESET_TZ_OFFSET_HOURS = 9`)

### 5.2 검사 및 카운트 시점 (Zero-Quota Cache Bypass)
- **위치:** `generateGeminiSpeech` 함수 내부에서 디스크 캐시 확인 및 진행 중 요청 합치기(`inFlightTts`)를 모두 통과한 뒤, 실제 `ai.models.generateContent` 호출 직전에만 검사 및 카운트합니다.
- **캐시 음성 보호:** 이미 생성된 오디오(캐시 히트)는 쿼터를 1회도 소비하지 않으며, 일일 한도에 도달한 후에도 기존 수업의 음성은 영구적으로 재생 가능합니다.

### 5.3 429 수신 및 프론트엔드 폴백 방어
- 한도 도달 시 `HTTP 429`와 에러 코드(`TTS_DEVICE_LIMIT` 또는 `TTS_GLOBAL_LIMIT`) 및 친절한 한국어 안내 문구를 반환합니다.
- 클라이언트는 429 수신 시 브라우저 내장 합성기(Web Speech API)로 몰래 전환하지 않고, `ai-tutor-rate-limit` 커스텀 이벤트를 발생시켜 상단 고정 안내 배너를 통해 사용자에게 상황을 명확히 고지합니다.

