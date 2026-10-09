# AI 어학 튜터 (AI Language Tutor) — 프로젝트 컨텍스트

> **공식 빌드 버전:** `build 20261009-multilingual`  
> **최신 업데이트 일자:** 2026-10-09 (KST)  
> **공식 서비스 URL:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)  
> **아키텍처 표준:** 계층화 문서화 및 배포 격리 아키텍처 (루트 문서 5KB 미만 유지, 모든 기록 일자 KST 기준)

---

## 🎯 1. 프로젝트 비전 (Project Vision)

**"어떤 언어의 책이든, 사진 한 장으로 시작하는 가장 자연스러운 1:1 원어민 쉐도잉 훈련소"**

전 세계 언어 학습자가 실전 인쇄물(원서, 잡지, 교재)을 즉시 학습 자료로 전환하고, 네이티브 원어민의 음성과 호흡을 100% 흡수하는 지능형 튜터링 플랫폼입니다.
한국인의 외국어(중국어·프랑스어·영어·일본어 등) 학습과 외국인의 한국어 원서 학습(K-Language Engine)을 단일 파이프라인에서 지원합니다.

---

## 🧑‍🏫 2. 튜터 페르소나 (Tutor Persona)

- **페르소나 정의:** 따뜻하고 지적이며 학습자의 눈높이에 맞추는 **원어민 전문 어학 코치**.
- **발화 톤 & 매너:**
  - 초급자에게는 모음과 자음을 정성스럽게 또박또박 짚어주는 인내심 있는 멘토 (`0.5x`).
  - 중급자에게는 자연스러운 숨 고르기와 연음 리듬을 살려주는 동반자 (`0.75x`, `1.0x`).
  - 불필요한 선택 강요 없이, 학습자가 올린 글을 존중하며 즉시 최적의 카드와 소리로 응답.
- **교수법 철학:** 소리 ➔ 청크(의미 덩어리) ➔ 뉘앙스로 이어지는 직관적 체득 방식.

---

## 🏗️ 3. 핵심 시스템 아키텍처 (Core Architecture)

```
[교재 사진] ──► [Gemini 3.8 Flash Vision] ──► [자동 언어 판독 & 카드 분해]
                                                     │
                               ┌─────────────────────┴─────────────────────┐
                               ▼                                           ▼
                    [외국어 모드 (한국인)]                       [한국어 모드 (외국인)]
                    • 끊어 읽기 청크 & 구문도                     • 단일 소리 로마자
                    • 핵심 어휘 및 한국어 번역                   • 조사/어미 분해 & 격식도
                               │                                           │
                               └─────────────────────┬─────────────────────┘
                                                     ▼
                                    [Gemini Native TTS Engine]
                                    • gemini-3.8-flash-lite-tts (Kore)
                                    • 0.75x / 0.5x 네이티브 스타일 발화
                                    • SHA-256 캐시 & 쿼터 방어 (사진 30장/음성 100회, quota 응답 탑재)
```

---

## 🚀 4. 차기 최우선 확정 과제 (Next Sprint Roadmap)

1. **Google SSO 계정 연동 및 클라우드 영구 동기화 (최우선 확정 과제):**
   - 기존 `x-device-id` 익명 서재 데이터를 구글 로그인 시 `google_user_id` 계정으로 자동 병합(Merge).
   - **계정별 영구 단어장 (★):** 단어 저장, 문맥 문장 보존, SRS 간격 반복 복습.
   - **학습 위치 동기화:** '내일은 여기서부터 시작' 북마크의 멀티 디바이스 실시간 연동.
2. **학습자 음성 녹음 & 원어민 A/B 청취 비교 (Shadowing Evaluator):**
   - Web Audio API 마이크 녹음 및 원어민 음성과 1:1 교차 청취 모드.
3. **교재 딥링크 공유:** 특정 교재 및 문장 위치 URL 공유.
*(상세 기획서: `docs/features/roadmap-sso.md` 참조)*

---

## 📑 5. 심층 아카이브 허브 색인 (Docs Index)

상세 설계, 변경 이력(KST), 트러블슈팅은 배포 격리된 `docs/` 디렉토리에 영구 보존됩니다.

- 🗂️ **[문서 종합 색인 (docs/README.md)](./docs/README.md)**
- 🚀 **[Google SSO & 클라우드 동기화 상세 기획 (docs/features/roadmap-sso.md)](./docs/features/roadmap-sso.md)**
- 🔊 **[음성 및 오디오 엔진 설계서 (docs/architecture/audio-system.md)](./docs/architecture/audio-system.md)**
- 🧠 **[튜터 프롬프트 파이프라인 (docs/architecture/tutor-pipeline.md)](./docs/architecture/tutor-pipeline.md)**
- 📜 **[KST 기준 버전별 무삭제 변경 이력 (docs/history/changelog.md)](./docs/history/changelog.md)**
- 🇰🇷 **[한국어 원서 모드 상세 기획 (docs/features/korean-learning-spec.md)](./docs/features/korean-learning-spec.md)**
- 🛠️ **[장애 분석 및 트러블슈팅 (docs/troubleshooting/incident-analysis.md)](./docs/troubleshooting/incident-analysis.md)**
