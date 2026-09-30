# 🛠️ 트러블슈팅 및 장애 분석 사례집 (Incident & Defense Case Study)

본 문서는 프로젝트 개발 및 운영 과정에서 발생한 핵심 기술 이슈와 방어 설계 사례를 정리한 기술 분석서입니다.

---

## 1. Cloud Run 배포 에러: 32KB 메타데이터/환경변수 초과 이슈

### 1.1 현상
Google Cloud Run 및 Cloud Build 배포 파이프라인에서 패키지 배포 시 `Environment variable / metadata payload exceeds 32KB limit` 오류가 발생하며 배포가 중단되는 현상.

### 1.2 원인 분석
- 프로젝트 루트 디렉토리에 대용량 기획서, 상세 아키텍처, 리뷰 문서, 변경 이력 등이 무제한 누적됨.
- 배포 빌드 도구가 루트의 문서 파일 및 로그, 캐시 파일들을 배포 컨텍스트 메타데이터에 포함시키면서 32,768 바이트(32KB) 한도를 초과함.

### 1.3 해결책: 계층화 문서화 및 배포 격리 아키텍처 (Layered Isolation Architecture)
1. **배포 격리 (`.dockerignore` & `.gcloudignore`):**
   - `docs/`, `*.log`, `.git`, `cache/tts/` 등을 배포 번들에서 제외하도록 명시.
2. **루트 문서 경량 인덱스화:**
   - 루트의 `README.md` 및 `PROJECT_CONTEXT.md`를 각각 **5KB 미만**의 린(Lean)한 인덱스 문서로 압축 유지.
3. **심층 아카이브 분리:**
   - 모든 기술 명세, 기획서, 변경 이력, 분석 문서는 `docs/` 디렉토리 하위로 격리하여 배포 컨텍스트에 0바이트 영향만 주도록 설계.

---

## 2. 오디오 0.75x / 0.5x 재생 시 지지직거리는 기계적 노이즈 이슈

### 2.1 현상
브라우저의 `HTML5 Audio.playbackRate`를 `0.75` 또는 `0.5`로 설정 시, 금속성 페이징 노이즈와 특유의 "지지직"거리는 기계적 떨림음이 발생하여 원어민 청취 학습을 방해함.

### 2.2 원인 분석
- 브라우저 오디오 엔진은 음의 높낮이(Pitch)를 유지한 채 속도만 늘리기 위해 **WSOLA (Waveform Similarity Overlap-Add)** 알고리즘을 사용함.
- 음성 파형을 인위적으로 잘라 붙이는 과정에서 위상 왜곡(Phase distortion) 및 시간 왜곡 아티팩트가 발생함.

### 2.3 해결책: Gemini Native Speech 파라미터 제어
- 브라우저의 시간 왜곡 알고리즘을 사용하지 않고 정상 속도(`playbackRate = 1.0`)로 재생.
- 백엔드(`/api/tts`)에서 Google Gemini TTS의 `speechMetadata.style` 프롬프트로 느린 속도의 발화를 직접 지시.
  - `0.75x`: 여유로운 학습자 템포로 호흡과 억양을 살려 부드럽고 또렷하게 발화.
  - `0.5x`: 각 음소와 모음, 자음을 하나하나 정성스럽고 또렷하게 조음(articulate)하여 발화.
- 잡음 왜곡 0%의 무손실 원어민 육성 음질 구현.

---

## 3. 교재 OCR 인식 시 광학 노이즈 및 환각(Hallucination) 방어

### 3.1 종이 뒷면 활자 비침 (Ghosting)
- **현상:** 얇은 인쇄 용지 뒷면의 글자가 희미하게 비쳐 앞면 본문과 뒤섞여 OCR 되는 현상.
- **방어 기법:** Gemini Vision 프롬프트에 `ignore faint bleed-through or ghosting text from the reverse side of paper` 규칙을 명시하고, 신뢰도가 높은 전면 글꼴 레이어만 추출하도록 강제.

### 3.2 인쇄용 각주 별표(`*`) 혼입
- **현상:** `FOMO*`와 같은 본문 내 각주 표시 기호가 음성 TTS 텍스트 및 발음 기호에 포함되어 오작동을 유발함.
- **방어 기법:** 전처리 및 Gemini 구조화 추출 파이프라인에서 각주 별표 기호를 안전하게 정제.

### 3.3 페이지 하단 잘린 문장 환각 방어
- **현상:** 페이지 하단 여백에서 절단된 문장(`...비용인`)에 대해 LLM이 문장을 자의적으로 상상하여 완결짓는 환각 현상 발생.
- **방어 기법:** 프롬프트에 엄격한 원칙 적용 (`Do NOT invent the remainder of truncated sentences at page boundaries; close safely with an ellipsis`).
