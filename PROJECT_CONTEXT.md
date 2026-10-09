# AI 어학 튜터 (AI Language Tutor) — 프로젝트 컨텍스트

> **공식 빌드 버전:** `build 20261009-multilingual`  
> **최신 업데이트 일자:** 2026-10-09 (KST)  
> **공식 서비스 URL:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)  
> **문서 원칙:** 루트 문서 5KB 미만, 기록 일자는 KST

---

## 🎯 1. 프로젝트 비전 (Project Vision)

**"어떤 언어의 책이든, 사진 한 장으로 시작하는 가장 자연스러운 1:1 원어민 쉐도잉 훈련소"**

전 세계 언어 학습자가 실전 인쇄물(원서, 잡지, 교재)을 즉시 학습 자료로 전환하고, 네이티브 원어민의 음성과 호흡을 100% 흡수하는 지능형 튜터링 플랫폼입니다.
지원 언어는 중국어·프랑스어·영어·일본어(일본어 품질은 미확인)이며, 그 밖의 언어 사진은 안내 문구로 돌려보냅니다. 한국어 원서 모드 코드는 유지하되 사진 분석은 목록에 없습니다.

---

## 🧑‍🏫 2. 튜터 페르소나 (Tutor Persona)

- **정의:** 따뜻하고 지적이며 학습자의 눈높이에 맞추는 어학 코치. 음성은 AI 합성 음성이다.
- **속도:** 초급자는 또박또박 `0.5x`, 중급자는 숨 고르기와 연음을 살린 `0.75x`·`1.0x`.
- **교수법:** 소리 ➔ 청크(의미 덩어리) ➔ 뉘앙스.

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
                                    • SHA-256 캐시 & 쿼터 방어 (사진 기기 30·전체 100장 / 음성 100회)
```

---

## 🚀 4. 차기 최우선 확정 과제 (Next Sprint Roadmap)

1. **Google SSO 계정 연동 및 클라우드 영구 동기화 (최우선):** 익명 `x-device-id` 서재를 구글 계정으로 병합하고, 계정별 단어장(★, SRS 복습)과 학습 위치 동기화를 둔다.
2. **학습자 음성 녹음 & A/B 청취 비교:** 마이크 녹음과 원어민 음성 교차 청취.
3. **교재 딥링크 공유:** 특정 교재·문장 위치 URL 공유.
*(상세 기획서: `docs/features/roadmap-sso.md` 참조)*

---

## 🧭 최근 결정 (2026-10-09)

- 지원 언어 중국어 포함, 분석 실패 전용 안내(`RECITATION`, `UNSUPPORTED_LANGUAGE`).
- 화면 개편(시작 화면·영상·내 수업만 서재·한 줄 카드), 신고 버튼, 저작권 안내, PostHog 사용 기록 창구 완료. 상세는 changelog.
- 남은 일: 문장 재생·완료 기록(B3, "완료" 정의 결정 필요), Gemini 원가 기록(B2, 단가 필요), 문서 과장 정리(C6).

---

## 📑 5. 심층 아카이브 허브 색인 (Docs Index)

상세 설계, 변경 이력(KST), 트러블슈팅은 배포 격리된 `docs/` 디렉토리에 영구 보존됩니다.

- 🗂️ **[문서 종합 색인 (docs/README.md)](./docs/README.md)**
- 🚀 **[Google SSO 기획 (docs/features/roadmap-sso.md)](./docs/features/roadmap-sso.md)**
- 🔊 **[오디오 엔진 (docs/architecture/audio-system.md)](./docs/architecture/audio-system.md)**
- 🧠 **[튜터 파이프라인 (docs/architecture/tutor-pipeline.md)](./docs/architecture/tutor-pipeline.md)**
- 📜 **[변경 이력 (docs/history/changelog.md)](./docs/history/changelog.md)**
- 🇰🇷 **[한국어 원서 모드 (docs/features/korean-learning-spec.md)](./docs/features/korean-learning-spec.md)**
- 🖥️ **[현재 화면과 동작 (docs/features/screens.md)](./docs/features/screens.md)**
- 📊 **[사용 기록 (docs/features/analytics.md)](./docs/features/analytics.md)** · **[PostHog 가이드](./docs/features/posthog-guide.md)**
- ⚖️ **[사진·저작권 안내 근거 (docs/policy/copyright-and-data.md)](./docs/policy/copyright-and-data.md)**
- 🛠️ **[트러블슈팅 (docs/troubleshooting/incident-analysis.md)](./docs/troubleshooting/incident-analysis.md)**
