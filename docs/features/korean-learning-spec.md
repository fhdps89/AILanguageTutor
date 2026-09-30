# [기획 명세서] 역방향 한국어 어학 튜터 (K-Language Learning Spec)

> **문서 버전:** v1.1.0 (리뷰어 피드백 전면 반영판)  
> **최종 수정일:** 2026-09-29  
> **상태:** 구현 및 파일럿 검증 (Implementation & Pilot Verification)  
> **기준 리뷰 문서:** [korean-mode-review.md](./korean-mode-review.md)  
> **아키텍처 문서:** [audio-system.md](../architecture/audio-system.md), [tutor-pipeline.md](../architecture/tutor-pipeline.md)

---

## 1. 핵심 철학 및 원칙 (Design Principles)

1. **Zero Mode Toggle (무설정 자동 감지):**
   - 사용자가 '외국어 공부' vs '한국어 공부' 모드를 수동으로 전환하지 않습니다.
   - 책/인쇄물 사진을 찍어 올리면, 판독 결과 언어가 한국어(`language.code === "ko"`)일 때 자동으로 한국어 학습용 카드 레이아웃으로 렌더링됩니다.
2. **확인 막대(Confirmation Bar) 엄격 제한:**
   - 한국어와 영어가 병기된 2개 국어 교재 지문이 아닌 이상, 본문 내 `FOMO`나 `인베스팅` 같은 외래어 1~2개로 인해 "영어로 볼까요 한국어로 볼까요?" 묻는 불필요한 막대를 절대 띄우지 않습니다.
3. **학습자 중심의 실전 소리 표기 (One Phonetic Romanization):**
   - 문자 철자 대응 표기(RR)와 발음 기호를 중복 나열하지 않고, 실제 원어민 소리를 듣고 따라할 수 있는 **음운 동화/연음이 반영된 소리 로마자 1개만** 간결하게 표기합니다.
4. **유의미한 형태소 및 조사 분해 (Grammatical Chunks):**
   - 단순 띄어쓰기 청크가 아닌, 학습자에게 핵심이 되는 **체언+조사(Topic, Subject, Possessive)** 및 **용언 활용(어간 + 보조용언 + 어미)** 단위로 분해하여 설명합니다.
   - 예: `이루어지지 않기` ➔ `이루어지다 + 지 않 + 기`, `때문이다` ➔ `때문 + 이다`
5. **정확한 격식도 배지 (Strict Formality Tagging):**
   - 문장 끝에 확실한 종결 어미(하십시오체, 해요체, 해체)가 있을 때만 배지를 붙입니다.
   - 책, 신문, 학술서의 서술체/설명체(`~다`, `~이다`)는 존댓말도 반말도 아닌 중립적 글말이므로 **배지를 노출하지 않습니다 (`null`)**.
6. **광학 노이즈 및 환각 원천 차단 (Robust Optical Defense):**
   - 뒷면 비침(Ghosting) 무시.
   - 각주 별표(`*`)는 본문 문장에서 제거.
   - 페이지 하단에서 잘린 문장은 절대 뒤를 지어내지 않고 인쇄된 곳까지만 닫기.

---

## 2. 데이터 스키마 (`src/types.ts`)

```typescript
export interface KoreanChunkItem {
  text: string;          // "기업의", "이루어지지 않기"
  grammarRole?: string;  // "possessive 의", "이루어지다 + 지 않 + 기"
}

export interface SentenceItem {
  id: string;                         // "s01", "s02" ...
  raw_text: string;                   // 한국어 원문
  tts_text?: string;                  // 발음용 텍스트
  translation: string;                // 자연스러운 영어 번역
  sound_romanization?: string;        // 실제 소리 기준 로마자 1개
  korean_chunks?: KoreanChunkItem[];  // 형태소 및 조사 청크
  formality_badge?: string | null;    // 명확한 종결어미가 있을 때만 (서술체는 null)
  vocabulary: Array<{
    word: string;                     // 본문 단어
    meaning: string;                  // 영어 뜻
    baseForm?: string;                // 사전 기본형 (동사/형용사)
    pos?: string;                     // 품사 (Noun, Verb 등)
    hint?: string;
  }>;
}
```

---

## 3. 첫 번째 실험 사진 검증 기준 (`1790663010818.jpg`)

* **출처:** 실제 투자 도서 본문 1페이지
* **입력 사진 특성:**
  - 활자 사이 종이 뒷면 비침 존재
  - 6번 문장에 `FOMO*` 각주 표기 포함
  - 9번 문장이 페이지 하단 여백에서 `...비용인`으로 절단
* **합격 기준 문장 목록 (총 9개):**
  1. `그렇다면 인베스팅 전략이 요구하는 어려움은 무엇일까?`
  2. `가장 먼저 떠올려야 할 것은, 오랜 기다림이다.`
  3. `기업의 성장은 하루아침에 이루어지지 않기 때문이다.`
  4. `사업이 성장하고 시장이 그 가치를 인식하기까지는 생각보다 긴 시간이 필요하다.`
  5. `하지만 대부분의 투자자는 오래 기다리는 것을 원하지 않기에, 기다림은 인베스팅이 요구하는 가장 큰 대가가 된다.`
  6. `이 기다림 속에서 투자자가 마주하는 가장 큰 감정적 어려움은 FOMO 그리고 기회비용에 대한 불안이다.` *(FOMO 뒤 별표 제거)*
  7. `내가 투자한 기업이 서서히 성장하는 동안 주변에서 이미 성장을 마친 수많은 다른 종목들이 급등하는 모습을 보게 되기 때문이다.`
  8. `이는 소외감을 불러일으키고, 내가 잘못된 길을 가고 있는 것은 아닌지 끊임없이 의심하게 한다.`
  9. `이러한 감정적 불편함은 투자자라면 누구나 반드시 지불해야 하는 비용인 …` *(뒤를 환각으로 지어내지 않고 닫음)*

* **문장 3 기준 기대 결과치:**
  - **원문:** `기업의 성장은 하루아침에 이루어지지 않기 때문이다.`
  - **소리 로마자:** `gieop-ui seongjang-eun haruachim-e irueojiji anki ttaemun-ida.`
  - **영어 번역:** `This is because a company's growth does not happen overnight.`
  - **청크:**
    - `기업의` [possessive 의]
    - `성장은` [topic 은]
    - `하루아침에`
    - `이루어지지 않기` [이루어지다 + 지 않 + 기]
    - `때문이다` [때문 + 이다]
  - **격식 배지:** 없음 (`null`)

---

## 4. 오디오 & 음성 시스템 재사용

- **TTS 모델:** `gemini-3.8-flash-lite-tts`
- **보이스 프로필:** `Kore`
- **스타일 지시 유지:**
  - 1.0x 표준 한국어 원어민 발화
  - 0.75x 여유로운 학습 템포 (`speechMetadata.style`)
  - 0.5x 초보자용 또박또박 정밀 조음 (`speechMetadata.style`)
- **디스크 캐시 키:** `SHA-256(text + "_" + lang + "_" + voice + "_" + speed)`
