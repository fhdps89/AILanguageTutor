# [기획 명세서] 역방향 한국어 어학 튜터 (K-Language Learning Spec)

> **문서 버전:** v1.0.0  
> **작성일자:** 2026-09-28  
> **상태:** 기획 및 교차검증 (Planning & Cross-Validation)  
> **연계 문서:** [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)

---

## 1. 프로젝트 개요 & 기획 배경 (Executive Summary)

### 1.1 배경 및 문제 정의
- **현행 서비스 구조:** 한국인이 외국어(영어, 프랑스어, 일본어 등) 교재 사진을 찍으면 `OCR 추출 ➔ 외국어 Native TTS 음성 ➔ 한국어 번역 및 구문/단어 해설`을 제공하는 구조.
- **제안된 확장 (Reverse Learning):** 한국어 텍스트 사진(간판, 메뉴판, 동화책, 웹툰, TOPIK 시험지, K-POP 가사 등)을 촬영하면 `한국어 본문 추출 ➔ 한국어 Native TTS 음성 ➔ 외국어(초기 버전: 영어) 단어/어법/구조 해설`을 제공하는 서비스.

### 1.2 핵심 가치 (Value Proposition)
1. **Real-Life Material:** 인위적인 교재가 아닌, 한국 여행/생활/콘텐츠 속 실제 한국어를 즉시 맞춤형 학습 콘텐츠로 변환.
2. **Native Korean Audio & Accurate Cadence:** 기계적 합성음이 아닌 Google Gemini Native Speech 기반의 자연스러운 표준 한국어 음성 및 감속(0.75x 쉐도잉, 0.5x 조음 훈련) 제공.
3. **SOV & Particle-aware Explanations:** 영어권 학습자가 가장 어려워하는 한국어 조사(은/는/이/가, 을/를 등), 어미 활용(Conjugation), 높임말(Honorifics)을 영어로 체계적 해설.

---

## 2. 기존 모드 vs 리버스 모드 아키텍처 비교 (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Mode A: 기존 외국어 학습 모드 (Foreign Language Mode)]                                │
│  사진 촬영 (외국어) ➔ Gemini OCR ➔ 외국어 Gemini TTS ➔ 한국어(KR) 번역/문법/어휘 해설  │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Mode B: 신규 한국어 학습 모드 (Learn Korean Mode)]                                    │
│  사진 촬영 (한국어) ➔ Gemini OCR ➔ 한국어 Gemini TTS ➔ 영어(EN) 번역/문법/어휘 해설   │
│                                                     ├─ 로마자 발음 (Romanization)      │
│                                                     ├─ 높임말 격식도 (Formality Level) │
│                                                     └─ 조사/어미 역할 (Grammar Roles)  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| 파이프라인 단계 | 기존 외국어 학습 모드 | 신규 한국어 학습 모드 (MVP: 영문 해설) |
| :--- | :--- | :--- |
| **입력 (Image Input)** | 프랑스어/영어/일본어 등 외국어 교재 사진 | 한국어 간판, 메뉴판, 동화책, 시험지, 인쇄물 사진 |
| **OCR 본문 (Original Text)** | 외국어 (French, English, Japanese 등) | **한국어 (Korean / Hangul)** |
| **TTS 음성 (Audio Engine)** | 외국어 음성 프로필 (`Kore` / `Puck` 등) | **한국어 표준 발음 프로필 (Gemini Native TTS)** |
| **해설 언어 (Target Lang)** | 한국어 (Korean) | **영어 (English)** |
| **발음 보조 (Pronunciation)** | - | **로마자 표기법 (Revised Romanization / IPA)** |
| **구문 분석 (Chunking)** | 의미 단위 끊어 읽기 (`/`) | **조사/어미 기준 끊어 읽기 + 영문 문법 태그** |
| **어휘 학습 (Vocabulary)** | 외국어 단어 ➔ 한국어 뜻/품사 | **한국어 활용형 ➔ 사전 기본형(Base Form) + 영문 뜻** |

---

## 3. 한국어 학습 특화 핵심 기능 명세 (Functional Specifications)

### 3.1 로마자 발음 표기 & 연음 법칙 지원 (Romanization Guide)
* **목적:** 한글을 아직 읽기 버거운 초급 외국인 학습자 지원.
* **동작:** 
  - 각 문장 상/하단에 로마자 발음 표기(On/Off 토글 스위치 제공).
  - 표기 문자 그대로가 아닌, 한국어 **연음(Liaison), 비음화, 구개음화**가 반영된 실제 소리 기준 로마자 제공.
  - *예시:* `독립문` ➔ 표기: *Dongnipmun*, 실제 발음: *[dong-nim-mun]*

### 3.2 한국어 어순(SOV) & 조사/어미 시각화 (Particle Breakdown)
* **목적:** 영어(SVO)와 다른 한국어 어순(SOV)과 조사(Markers)의 역할을 명확히 인지시킴.
* **청크 분해 규칙:**
  - `주어+조사 / 목적어+조사 / 부사구 / 서술어(용언+어미)` 단위로 분할.
  - 각 청크 터치 시 영문 역할 툴팁 노출.
  - *예시:* `민우가 / 식당에서 / 비빔밥을 / 맛있게 먹었습니다.`
    - `민우가` ➔ *Minwoo [Subject Marker -가]*
    - `식당에서` ➔ *at the restaurant [Location Marker -에서]*
    - `비빔밥을` ➔ *Bibimbap [Object Marker -을]*
    - `맛있게` ➔ *deliciously [Adverbial -게]*
    - `먹었습니다` ➔ *ate [Past tense, Formal high -았습니다]*

### 3.3 높임말 & 격식도 분류 배지 (Formality Level Badge)
* 본문 전체 및 각 문장에 대해 한국어 경어체 수준을 3단계로 태깅하여 안내:
  1. 🟢 **Formal High (하십시오체):** 안내 방송, 뉴스, 역사서, 격식 연설.
  2. 🔵 **Polite (해요체):** 일상 회화, 상점/식당 대화, 블로그, 브이로그.
  3. 🟠 **Casual (반말/해체):** 친구 간 대화, 웹툰, 메신저, 혼잣말.

### 3.4 용언 활용형 원형 복원 (Base Form Extraction)
* 한국어는 동사/형용사의 불규칙 활용이 많아 외국인이 사전을 찾기 어려움.
* 텍스트 내 활용형 단어 클릭 시 **기본형(Dictionary Form)**과 **품사(POS)**를 영어로 제공.
  - *예시:* 본문 `걸었어요` 터치 ➔ 기본형: `걷다 (geot-da: to walk)`, 불규칙: `ㄷ 불규칙 동사`

### 3.5 한국어 음소 기반 노래방 음향 싱크 (Hangul Forced-Alignment)
* **기존 알고리즘(`karaokeSync.ts`) 확장:**
  - 한국어 1음절 = `초성 + 중성 + 종성(받침)` 구조 모델링.
  - 받침이 있는 음절(예: `달`, `밟`)은 받침이 없는 음절(예: `가`, `나`) 대비 1.25x~1.4x 가중치 부여.
  - 문장 부호(`,`, `.`, `?`, `!`)의 호흡 정지 시간(Pause, 200~350ms)을 계산하여 낭독 음성과 텍스트 하이라이팅의 오차를 0ms 수준으로 동기화.

---

## 4. 데이터 모델 & Gemini 프롬프트 설계 (Data Schema)

### 4.1 확장된 교재 데이터 스키마 (`LessonPageData`)

```typescript
export interface KoreanLessonSentence {
  id: string;                         // e.g. "s01"
  original: string;                   // 한국어 원문 (e.g. "경복궁은 조선의 법궁입니다.")
  romanization?: string;              // 로마자 표기 (e.g. "Gyeongbokgungeun Joseonui beopgung-imnida.")
  translation: string;                // 영어 번역 (e.g. "Gyeongbokgung is the main palace of Joseon.")
  formalityLevel?: 'Formal' | 'Polite' | 'Casual'; // 격식도
  grammarNote?: string;               // 문법 해설 (English)
  chunks: Array<{
    kr: string;                       // "경복궁은"
    en: string;                       // "Gyeongbokgung (Topic)"
    romanization?: string;            // "Gyeongbokgungeun"
    roleTag?: string;                 // "Topic Marker (-은)"
  }>;
  vocabulary: Array<{
    word: string;                     // 본문 표기 ("법궁")
    baseForm: string;                 // 기본형 ("법궁")
    romanization: string;             // "beopgung"
    meaning: string;                  // "main legal royal palace"
    pos: string;                      // "Noun"
  }>;
  audioUrl?: string;                  // Gemini TTS 캐시 경로
}

export interface LessonPageData {
  id: string;
  title: string;
  sourceLanguage: 'ko' | 'fr' | 'en' | 'ja' | 'es' | 'de'; // 원문 언어
  targetLanguage: 'en' | 'ko';                           // 학습자 해설 언어
  formalityOverview?: string;
  sentences: KoreanLessonSentence[];
  totalSentences: number;
}
```

---

## 5. UI/UX 와이어프레임 & 인터랙션 계획 (User Interface)

### 5.1 상단 네비게이션 & 언어 모드 셀렉터
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🌐 AI Language Tutor     [ 🇰🇷 ➔ 🇺🇸 Learn Korean ] ▼      [+ Upload Photo]   │
└─────────────────────────────────────────────────────────────────────────────┘
```
- 사용자가 언제든지 `외국어 학습 모드(KR 유저용)`와 `한국어 학습 모드(Global 유저용)`를 전환 가능.
- 사진 업로드 시 **자동 언어 감지(Auto-detect)**를 통해 한국어 지문이면 모드 자동 전환 제안.

### 5.2 문장 카드 (Sentence Card) 인터랙션 레이아웃
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ #01  [🟢 Formal / 하십시오체]             [📍 내일은 여기서부터 시작] [0.75x] [0.5x] │
│                                                                             │
│ [Korean Text]  경복궁은 조선의 으뜸 궁궐입니다.                               │
│ [Romanization] Gyeongbokgungeun Joseonui eutteum gung-gworimnida.           │
│ [Translation]  Gyeongbokgung is the prime royal palace of Joseon.           │
│                                                                             │
│ [Chunks]   [ 경복궁은 / Gyeongbokgung (Topic) ]                             │
│            [ 조선의 / of Joseon (Possessive) ]                              │
│            [ 으뜸 궁궐입니다. / is the prime royal palace. ]                │
│                                                                             │
│ [Key Vocab]                                                                 │
│ • 궁궐 (gung-gwol) [Noun] : Royal palace                                    │
│ • 으뜸 (eut-teum) [Noun] : The prime / First rank                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 교차 검증 및 실현 가능성 분석 (Cross-Validation & Feasibility)

| 검증 항목 | 질문 및 쟁점 | 검증 결과 & 해결 방안 |
| :--- | :--- | :--- |
| **Gemini OCR 능력** | 손글씨, 간판, 메뉴판 등 다양한 한국어 폰트 인식 가능한가? | **검증 완료.** Gemini Vision은 한글 고문헌, 캘리그라피, 저조도 간판 인식률이 최상위권임. |
| **Gemini Native TTS 한국어 품질** | 한국어 발음이 어색하거나 기계음이 나지 않는가? | **검증 완료.** `gemini-3.8-flash-lite-tts`는 한국어 음성 억양, 끊어 읽기, 높낮이(Pitch)가 자연스러운 아나운서 톤을 구사함. |
| **로마자 표기 정확도** | 연음 법칙(비음화, 유음화 등) 반영이 가능한가? | Gemini 프롬프트에 `Revised Romanization with phonetic assimilation (실제 발음 반영)`을 명시하여 해결 가능. |
| **기존 코드 재사용성** | 기존 오디오 캐싱, 노래방 싱크, 릴레이 플레이어와 호환되는가? | **100% 호환.** `server.ts`의 `/api/tts`와 프론트엔드 플레이어 코드를 그대로 재사용 가능. |
| **단어 기본형 추출** | 활용형(예: '추웠어요')에서 원형('춥다')을 정확히 찾아내는가? | Gemini 멀티모달 분석 시 JSON 스키마에 `baseForm` 필드를 강제하여 형태소 분석 수준의 원형 도출 가능. |

---

## 7. 단계별 실험 및 릴리즈 로드맵 (Roadmap)

### Phase 1: 기획 검토 및 교차검증 (현재 단계)
- [x] 역방향 한국어 학습 파이프라인 수립
- [x] 영문 번역, 로마자 발음, 조사/어미 분해 스키마 정의
- [x] 상세 기획 명세서 문서화 (`KOREAN_LEARNING_SPEC.md`)

### Phase 2: 단일 한국어 데모 페이지 실험 (Demo Pilot)
- 기존 프랑스 개선문 데모와 같이, 대표적인 한국어 텍스트(예: *경복궁 안내문*, *한국 전통 음식 레시피*, *K-POP 가사*) 1종을 선정하여 데이터 검증.
- 한국어 TTS 발음, 0.75x/0.5x 조음 훈련, 노래방 하이라이팅 싱크 품질 테스트.

### Phase 3: 업로드 및 프롬프트 파이프라인 통합 (Production Release)
- 사진 업로드 시 한국어 자동 감지 및 영어 해설 추출 로직 연동.
- 글로벌 사용자(영어권)를 위한 UI 다국어화(i18n) 적용.

---
*본 문서는 AI Studio 어학 튜터 프로젝트의 공식 기획 명세서로 관리됩니다.*
