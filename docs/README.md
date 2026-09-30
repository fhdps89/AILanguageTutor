# 📚 AI 다국어 쉐도잉 튜터 — 심층 문서 아카이브 허브 (Docs Hub)

> **공식 기준 빌드:** `build 20260930-gemini-single`  
> **표준 시간대:** KST (한국 표준시, UTC+9)

본 디렉토리(`docs/`)는 **AI 다국어 쉐도잉 튜터** 프로젝트의 모든 아키텍처 상세 설계, 기능 명세서, 버전별 변경 이력, 장애 분석 및 트러블슈팅 사례를 보존하는 통합 아카이브 공간입니다.

> **💡 배포 격리 정책 (Deployment Isolation Policy):**  
> 본 디렉토리의 모든 파일은 `.dockerignore` 및 `.gcloudignore`를 통해 Cloud Run 배포 빌드 패키지에서 100% 제외됩니다. 이를 통해 Google Cloud Run 배포 메타데이터/환경변수 32KB 한도 초과 오류를 영구적으로 원천 차단합니다.

---

## 🗂️ 문서 체계 및 색인 (Documentation Index)

### 1. [아키텍처 설계 (Architecture)](./architecture/)
- **[음성 및 오디오 엔진 설계서 (audio-system.md)](./architecture/audio-system.md)**  
  - Google Gemini Native Speech (`gemini-3.8-flash-lite-tts`, Voice: `Kore`)
  - 무잡음 네이티브 배속 발화 지시 (`speechMetadata.style`: 0.75x, 0.5x)
  - SHA-256 디스크 캐싱 (`./cache/tts/[hash].wav`) & 3ms 초고속 스트리밍
  - iOS Safari 단일 오디오 객체 재사용 및 60fps 가중치 노래방 싱크 엔진
- **[튜터 파이프라인 및 멀티모달 분석 (tutor-pipeline.md)](./architecture/tutor-pipeline.md)**  
  - Gemini 3.8 Flash Vision OCR 본문 판독 파이프라인
  - 언어 자동 감지 및 양방향 라우팅 (한국어 ↔ 외국어)
  - 프롬프트 구조화 및 JSON Schema 무결성 보장

### 2. [기능 및 커리큘럼 명세 (Features & Curriculum)](./features/)
- **[한국어 원서 학습 모드 명세서 (korean-learning-spec.md)](./features/korean-learning-spec.md)**  
  - 외국인/글로벌 학습자를 위한 K-Language 역방향 학습 엔진
  - One Phonetic Romanization (소리 로마자 단일 표기)
  - 문법 조사/어미 분해 청크 및 격식도 배지 (Formality Tagging)
- **[한국어 모드 전문가 리뷰 & 검증 기준 (korean-mode-review.md)](./features/korean-mode-review.md)**  
  - 기준 빌드 코드 리뷰, 뒷면 비침/각주 방어 및 파일럿 테스트 기준
- **[다국어 쉐도잉 학습 시나리오 (multilingual-shadowing.md)](./features/multilingual-shadowing.md)**  
  - 외국어 끊어 읽기(Chunking), ASCII 구문 분석도, 어휘 강조, 전체 지문 릴레이 낭독 플로우

### 3. [변경 이력 (History & Changelog)](./history/)
- **[KST 기준 버전별 전체 변경 이력 (changelog.md)](./history/changelog.md)**  
  - 프로젝트 생성부터 현재 버전(`build 20260930-gemini-single`)까지의 무삭제 변경 이력
  - KST 기준 일자 정렬 및 UX 개선/보안 조치 이력 상세 수록
  - 차기 스프린트(Google SSO 연동, SRS 단어장, Shadowing Evaluator) 로드맵

### 4. [트러블슈팅 및 장애 분석 (Troubleshooting)](./troubleshooting/)
- **[장애 분석 및 방어 사례집 (incident-analysis.md)](./troubleshooting/incident-analysis.md)**  
  - Cloud Run 32KB 배포 환경변수/패키지 초과 원인 및 계층화 해결책
  - 브라우저 WSOLA 알고리즘의 0.75x/0.5x 지지직 노이즈 발생 원인 및 LLM 네이티브 발화 해결
  - 교재 사진 OCR 시 뒷면 활자 비침(Ghosting) 및 잘린 문장 환각(Hallucination) 방어 기법

---

## 📐 문서 거버넌스 가이드라인 (Governance Rules)
1. **루트 문서 최소화:** 루트의 `README.md` 및 `PROJECT_CONTEXT.md`는 반드시 각각 **5KB 미만**을 엄격히 유지합니다.
2. **KST 날짜 표기 준수:** 모든 변경 이력 및 릴리즈 노트는 한국 표준시(KST, UTC+9) 기준으로 작성합니다.
3. **상세 문서 docs/ 이관:** 300단어 이상의 기술 사양서, 프롬프트 명세, 트러블슈팅 로그는 `docs/` 하위 적정 디렉토리에 작성합니다.
4. **배포 안전성:** 신규 문서 작성 시 `.dockerignore`와 `.gcloudignore`의 격리 규칙이 정상 작동하는지 확인합니다.
