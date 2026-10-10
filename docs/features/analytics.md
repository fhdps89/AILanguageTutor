# 사용 기록 (PostHog)

앱이 어떻게 쓰이는지 숫자로 보기 위한 최소한의 기록입니다. 브라우저가 `/api/event`로 보내면 서버가 PostHog로 전달합니다(`POSTHOG_KEY`가 없으면 아무 일도 하지 않음).

## 받는 이벤트 (브라우저 → `/api/event`)

허용 이름: `app_open`, `sentence_play_start`, `sentence_complete`. 그 밖의 이름은 400.

허용 속성(나머지는 버림): `src`(영문 소문자·숫자·`_-` 24자 이하), `internal`(true/false), `rate`(1, 0.75, 0.5), `mode`(card/relay), `voice`(ai/browser), `lang`, `lesson_key`(16자리 16진수), `sentence_id`, `is_demo`(true/false).

- `app_open`은 30분에 한 번까지.
- `sentence_play_start`: 문장 카드(`mode=card`)나 「연속 듣기」(`mode=relay`)에서 소리가 실제로 나기 시작할 때. `sentence_complete`: 그 소리가 끝까지 자연스럽게 끝났을 때만(정지, 줄 접기, 다른 줄로 이동, 오류, 한도(429)로 끝나면 보내지 않음). 속도(`rate`)와 상관없이 센다. 브라우저 기본 음성으로 끝나면 `voice=browser`. 「끊어 읽기」 칩과 어휘 듣기는 기록하지 않는다.
- 예시 수업(`demo-arc`, `demo-chinese`)은 `is_demo=true`로 보내고 `lesson_key`는 보내지 않는다. 내 수업은 `lesson_key`가 붙는다.
- `lang`은 소문자(`fr-fr`)로 보낸다.
- 기기 번호(`x-device-id`)가 없는 요청은 기록하지 않음.
- 모집 경로 꼬리표는 주소 끝 `?src=blog`처럼 붙이고(처음 값 우선), 내 기기는 `?internal=1`로 표시합니다(`?internal=0`으로 해제). 처리한 뒤 주소창에서 두 값은 지워집니다.

## 서버가 직접 보내는 이벤트

- `error_report`: 카드의 「이 설명이 틀렸어요」 신고. 속성은 `reason`(raw_text·translation·pronunciation·vocabulary·other), `lesson_key`, `sentence_id`, `lang`. 신고는 `cache/reports.jsonl`에도 남음(2MB를 넘으면 더 쓰지 않음).
- 신고 한도: 기기당 하루 30건, 기기 번호 없는 요청 5건, 서버 전체 500건(KST 자정 초기화, 메모리). 넘으면 429 `REPORT_LIMIT`.

## 아직 보내지 않는 것 (예정)

- "문장 완료"의 속도 조건은 속도와 무관한 자연 종료로 구현했다(계측 설계 v2, 추천안). 사용자 확정을 기다리는 중이며 바뀌면 `onComplete` 호출 조건과 이 문서를 고친다.
- `photo_analyzed`·`photo_analyze_failed`·`limit_blocked`·`gemini_call`(B2): Gemini 단가 4개가 필요하다. 코드에는 아직 없다.

## 수집하지 않는 것

이름, 이메일, 사진, 문장 내용, 사용자 IP, 로그인 정보.

## 환경 변수

`POSTHOG_KEY`, `POSTHOG_HOST`(없으면 `https://us.i.posthog.com`). 값은 코드와 저장소에 넣지 않고 AI Studio 비밀값에만 둡니다. 가입·화면 사용법·운영 방안은 `docs/features/posthog-guide.md`, 시작 화면의 안내 문구는 `docs/policy/copyright-and-data.md` 참고.
