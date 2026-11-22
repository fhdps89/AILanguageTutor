# AI 어학 튜터 (AI Language Tutor) — 프로젝트 컨텍스트

> **공식 빌드 버전:** `build 20261122-multilingual`  
> **최신 업데이트 일자:** 2026-11-22 (KST)  
> **공식 서비스 URL:** [https://langtutor.ai.studio/](https://langtutor.ai.studio/)  
> **문서 원칙:** 루트 문서 20KB 미만, 기록 일자는 KST  
> **작업 모델 기록 (2026-11-22):** 설계 `Claude CLI Opus 5.5 high` / 구현 `agy gemini-4-hydrogen-high`

---

## 🎯 1. 프로젝트 비전 (Project Vision)

**"책 사진 한 장으로 시작하는 가장 자연스러운 1:1 쉐도잉 훈련소"**

외국어 학습자가 실전 인쇄물(원서, 잡지, 교재)을 학습 자료로 바꾸고, AI 합성 음성의 호흡을 따라 읽는 튜터링 앱입니다.
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
                                    • 1.0x 생성 후 클라이언트 playbackRate(0.75x / 0.5x) 배속 재생
                                    • SHA-256 캐시 & 쿼터 방어 (사진 기기 30·전체 100장 / 음성 100회)
```

---

## 🚀 4. 다음 과제 (Next)

1. **낯선 사용자 시험:** 지인의 지인 3명 → 낯선 사용자 10명과 인터뷰 10건. 목표는 7일 뒤 돌아오는 1명, 주간 활성 3주 연속 증가(PostHog로 판정).
2. **모집 전 점검:** 재배포 뒤 서재가 남는지, 사파리 8일 뒤 기기 번호가 이어지는지.
3. **조건부 과제 (조건이 될 때만):** Google SSO·서재 병합(인터뷰에서 "돌아왔는데 서재가 비었다"가 2건 이상일 때), 단어장 SRS, 녹음 비교, 딥링크.
*(조건부 과제 기획: `docs/features/roadmap-sso.md`)*

---

## 🧭 최근 결정 (2026-11-22)

- **PR B (2026-11-22 KST, P2 쉐도잉 기능 5-1..5-4):**
  - **AudioCoordinator (`src/utils/audioCoordinator.ts`):** `tts` · `relay` · `recording` · `self_playback` 채널 간 상호 선점(preempt) 규약, `playSentenceAudio` 채널 점유(`tts`/`relay`), `pauseActiveAudio`/`resumeActiveAudio` 추가.
  - **쉐도잉 침묵 스케줄러 (`src/utils/shadowingScheduler.ts` + `FullPagePlayer.tsx`):** 순수 리듀서(`idle`/`playing_tts`/`short_gap`/`shadowing_pause`/`paused`), `calculateShadowingPauseMs`(최소 2000ms, `0.5` 하한 없음), `1회`/`3회`/`∞` 반복, `document.hidden` 자동 일시정지, `[바로 넘기기]`, 인플로우 2단 컨트롤 바 적용. PostHog `mode: 'relay'` 이벤트 유지.
  - **로컬 쉐도잉 녹음기 (`src/components/ShadowingRecorder.tsx` + `src/utils/shadowingRecorderMachine.ts`):** 카드 속도 바 하단 1줄 도크, 브라우저 로컬 Blob 전용(서버 업로드 없음, 30초 자동 정지, 레벨 바, `[원어 듣기]` 캐시 재사용, `[내 발음 듣기]`, `[A→B 연속 비교]`).
  - **블라인드 모드 & 구문 컬러 칩 (`App.tsx`, `SentenceCard.tsx`, `src/utils/syntaxTokens.ts`):** `[원문 숨기기]`·`[발음 힌트 숨기기]`·`[해석 숨기기]` 토글(레이아웃 유지, 탭 시 임시 보기) 및 역할별 색상 칩(주어=파랑, 술어=초록, 목적어=보라, 수식어=주황, 연결/기타=회색, 말줄임 없이 줄바꿈, 데모 JSON `s01` 말줄임 보완).
  - **0.5x 배속 정책 유지:** PR A에서 전환된 클라이언트 `playbackRate` 방식(1.0x 오디오 캐시 공유)을 그대로 사용한다.
- **PR A (2026-11-22 KST, UX 리뷰 P0/P1 수정):**
  - **P0 레이아웃 오버플로:** 카드·본문·사이드바·메인 플렉스(`min-w-0`) 및 줄바꿈(`overflow-wrap: anywhere`) 보강, `FullPagePlayer` 일시정지 버튼 `whitespace-nowrap` 및 최소 너비 적용.
  - **P0 TTS 캐시/쿼터 (Option A):** 클라이언트 TTS 캐시 키에서 속도를 제외하고 항상 `1.0x` 오디오만 요청·캐시·인플라이트 중복 제거. `0.75x`/`0.5x`는 브라우저 `audio.playbackRate` + `preservesPitch = true`로 재생(기존 서버 측 저속 합성 대비 `0.5x` 음질 차이 가능성 있음).
  - **P1 프롬프트 누수 제거·스키마·안내·포스터·책별 북마크:** 번역 메타 문구(`~다고 이 글은 말한다`, `글은 전한다`, 괄호 지침) 정제 및 `pronunciationGuide`·`chunks`(2개 이상) 정규화(기존 서재 페이지는 재생성하지 않고 읽기 시 정규화 fallback 적용). 사이드바 카피("원어민 수준의 AI 음성 (합성 TTS)"), 영상 포스터 기본 레이어, 책별 북마크(`ai_tutor_bookmarks_by_book_v3`) 격리 완료.
- **이전 결정 (2026-10-11):** 문장 재생·완료 기록(B3), 서버·원가 기록(B2), 기기 번호 쿠키 보강(B4) 완료. 다음 과제는 사용자 숫자(낯선 사용자 시험), SSO는 조건부.

---

## 📑 5. 심층 아카이브 허브 색인 (Docs Index)

상세 설계, 변경 이력(KST), 트러블슈팅은 배포 격리된 `docs/` 디렉토리에 영구 보존됩니다.

- 🗂️ **[문서 종합 색인 (docs/README.md)](./docs/README.md)**
- 🚀 **[조건부 과제: Google SSO 기획 (docs/features/roadmap-sso.md)](./docs/features/roadmap-sso.md)**
- 🔊 **[오디오 엔진 (docs/architecture/audio-system.md)](./docs/architecture/audio-system.md)**
- 🧠 **[튜터 파이프라인 (docs/architecture/tutor-pipeline.md)](./docs/architecture/tutor-pipeline.md)**
- 📜 **[변경 이력 (docs/history/changelog.md)](./docs/history/changelog.md)**
- 🇰🇷 **[한국어 원서 모드 (docs/features/korean-learning-spec.md)](./docs/features/korean-learning-spec.md)**
- 🖥️ **[현재 화면과 동작 (docs/features/screens.md)](./docs/features/screens.md)**
- 📊 **[사용 기록 (docs/features/analytics.md)](./docs/features/analytics.md)** · **[PostHog 가이드](./docs/features/posthog-guide.md)**
- ⚖️ **[사진·저작권 안내 근거 (docs/policy/copyright-and-data.md)](./docs/policy/copyright-and-data.md)**
- 🛠️ **[트러블슈팅 (docs/troubleshooting/incident-analysis.md)](./docs/troubleshooting/incident-analysis.md)**
