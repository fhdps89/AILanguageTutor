# 사용 기록 (PostHog)

앱이 어떻게 쓰이는지 숫자로 보기 위한 최소한의 기록입니다. 브라우저가 `/api/event`로 보내면 서버가 PostHog로 전달합니다(`POSTHOG_KEY`가 없으면 아무 일도 하지 않음).

## 받는 이벤트 (브라우저 → `/api/event`)

허용 이름: `app_open`, `sentence_play_start`, `sentence_complete`. 그 밖의 이름은 400.

허용 속성(나머지는 버림): `src`(영문 소문자·숫자·`_-` 24자 이하), `internal`(true/false), `rate`(1, 0.75, 0.5), `mode`(card/relay), `voice`(ai/browser), `lang`, `lesson_key`(16자리 16진수), `sentence_id`.

- `app_open`은 30분에 한 번까지.
- 기기 번호(`x-device-id`)가 없는 요청은 기록하지 않음.
- 모집 경로 꼬리표는 주소 끝 `?src=blog`처럼 붙이고(처음 값 우선), 내 기기는 `?internal=1`로 표시합니다(`?internal=0`으로 해제). 처리한 뒤 주소창에서 두 값은 지워집니다.

## 서버가 직접 보내는 이벤트

- `error_report`: 카드의 「이 설명이 틀렸어요」 신고. 속성은 `reason`(raw_text·translation·pronunciation·vocabulary·other), `lesson_key`, `sentence_id`, `lang`. 신고는 `cache/reports.jsonl`에도 남음(2MB를 넘으면 더 쓰지 않음).
- 신고 한도: 기기당 하루 30건, 기기 번호 없는 요청 5건, 서버 전체 500건(KST 자정 초기화, 메모리). 넘으면 429 `REPORT_LIMIT`.

## 서버가 직접 보내는 이벤트: 사용량·원가 (B2)

화면이 아니라 서버가 보내므로 `/api/event` 허용 목록에는 없습니다(브라우저가 이 이름을 보내도 거절됨). 기기 번호가 없는 요청은 `anonymous`로 기록됩니다.

- `gemini_call`: Gemini 호출 1번마다 1건. 속성 `kind`(vision·tts), `model`, `ok`, `prompt_tokens`, `output_tokens`(생각 토큰 포함, 요금이 출력 단가로 매겨지므로), `thought_tokens`, `total_tokens`, `cost_usd_est`(USD 추정). 사진 분석은 대체 모델까지 갔으면 호출마다 따로 기록되고, 실패한 호출은 `ok:false`(토큰 값을 못 받으면 null). 음성은 캐시에서 나가거나 같은 문장을 이미 만드는 중이면 기록하지 않습니다.
- `photo_analyzed`: 속성 `lesson_key`, `lang`, `n_sentences`, `reused`(true면 캐시 재사용이라 모델 호출 없음). "새 페이지 수"는 `reused`가 false인 것.
- `photo_analyze_failed`: 속성 `code`(RECITATION·SAFETY_BLOCKED·GOOGLE_QUOTA·UNSUPPORTED_LANGUAGE·UNKNOWN 등). 오류 문구는 보내지 않습니다.
- `limit_blocked`: 하루 한도에 걸려 거절됨. 속성 `code`(ANALYZE_DEVICE_LIMIT·ANALYZE_GLOBAL_LIMIT·TTS_DEVICE_LIMIT·TTS_GLOBAL_LIMIT). 신고 한도는 기록하지 않습니다.
- 원가 계산: `cost_usd_est = prompt_tokens/1,000,000 × 입력 단가 + output_tokens/1,000,000 × 출력 단가`. 단가는 `server.ts`의 `GEMINI_PRICES_USD_PER_1M` 한 곳(사진 분석 0.75/3.75, 음성 0.50/6.00, 2026-10-09 Google 공식 가격표, 유료 Standard). **2027-01-01부터 모두 2배**이므로 그날 이 표를 고쳐야 합니다. 표에 없는 모델(`VISION_MODEL`로 바꾼 경우)은 `cost_usd_est`가 null입니다. 청구서와 월 1회 대조가 필요합니다(추정치).

## 아직 보내지 않는 것 (예정)

- `sentence_play_start`·`sentence_complete`(B3): 서버는 받을 준비가 되어 있지만 화면은 아직 보내지 않는다. "문장 완료"를 속도와 무관한 자연 종료로 셀지(추천) 0.75x만 셀지 결정이 필요하다.

## 수집하지 않는 것

이름, 이메일, 사진, 문장 내용, 사용자 IP, 로그인 정보.

## 환경 변수

`POSTHOG_KEY`, `POSTHOG_HOST`(없으면 `https://us.i.posthog.com`). 값은 코드와 저장소에 넣지 않고 AI Studio 비밀값에만 둡니다. 가입·화면 사용법·운영 방안은 `docs/features/posthog-guide.md`, 시작 화면의 안내 문구는 `docs/policy/copyright-and-data.md` 참고.
