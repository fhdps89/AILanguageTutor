# 🚀 [차기 과제 기획] Google SSO 계정 연동 및 클라우드 영구 동기화

> **상태:** 차기 스프린트(1~2주 내) 최우선 착수 확정 과제  
> **기준 빌드:** `build 20260930-gemini-single`  
> **표준 시간대:** KST (한국 표준시)  
> **연관 문서:** [PROJECT_CONTEXT.md](../../PROJECT_CONTEXT.md), [audio-system.md](../architecture/audio-system.md)

---

## 1. 개요 및 배경

현재 시스템은 `x-device-id` 기반의 익명 디바이스 격리 브릿지를 통해 사용자별 서재 데이터를 분리하고 있습니다.
차기 스프린트에서는 이를 **Google SSO(Single Sign-On) 계정 시스템**으로 승격하여, 모바일/태블릿/데스크톱 등 기기를 넘나들며 학습 데이터를 안전하게 영구 동기화합니다.

---

## 2. 핵심 구현 항목

### ① Google SSO 로그인 및 서재 자동 병합 (Migration & Merge)
- Google OAuth 2.0 / Firebase Auth를 통한 원클릭 구글 계정 로그인.
- **익명 서재 마이그레이션 브릿지:**
  - 비로그인 상태에서 업로드했던 로컬 교재/사진(`ownerId: deviceId`)을 로그인 시 해당 구글 계정(`ownerId: google_user_id`)으로 자동 병합(Merge).
  - 기존 학습 이력 유실 0%.

### ② 계정별 영구 단어장 (Vocabulary Star ★) & SRS 복습
- 문장 카드 내 핵심 단어의 별표(★) 터치 시 클라우드 영구 단어장에 즉시 저장.
- 문맥 문장(Context Sentence), 원어민 발음, 품사, 뜻 함께 보존.
- **간격 반복(Spaced Repetition System):** 에빙하우스 망각 곡선 기반 '오늘 복습할 단어' 맞춤 추천.

### ③ "내일은 여기서부터 시작" 북마크 크로스 디바이스 동기화
- 현재 기기 로컬에 저장되던 마지막 학습 위치를 구글 계정에 동기화하여, 집 PC에서 학습을 멈추고 출근길 모바일에서 바로 이어하기 지원.

### ④ 학습자 음성 녹음 & 원어민 A/B 청취 비교 (Shadowing Evaluator)
- 브라우저 Web Audio API로 마이크 턴 구간에서 학습자 음성을 녹음.
- 원어민 음성과 1:1로 번갈아 들어보는 AB 청취 모드 및 발음 피드백.

### ⑤ 교재/문장 딥링크 공유 (URL Hash / Query)
- 스터디원이나 다른 기기로 특정 교재 및 문장 위치를 바로 전송할 수 있는 공유 링크 생성.
