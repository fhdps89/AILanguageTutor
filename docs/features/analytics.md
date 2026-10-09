# 사용 기록 (PostHog)

앱이 어떻게 쓰이는지 숫자로 보기 위한 최소한의 기록입니다. 브라우저가 `/api/event`로 보내면 서버가 PostHog로 전달합니다(`POSTHOG_KEY`가 없으면 아무 일도 하지 않음).

## 받는 이벤트 (브라우저 → `/api/event`)

허용 이름: `app_open`, `sentence_play_start`, `sentence_complete`. 그 밖의 이름은 400.

허용 속성(나머지는 버림): `src`(영문 소문자·숫자·`_-` 24자 이하), `internal`(true/false), `rate`(1, 0.75, 0.5), `mode`(card/relay), `voice`(ai/browser), `lang`, `lesson_key`(16자리 16진수), `sentence_id`.

- `app_open`은 30분에 한 번까지.
- 기기 번호(`x-device-id`)가 없는 요청은 기록하지 않음.
- 모집 경로 꼬리표는 주소 끝 `?src=blog`처럼 붙이고(처음 값 우선), 내 기기는 `?internal=1`로 표시합니다(`?internal=0`으로 해제). 처리한 뒤 주소창에서 두 값은 지워집니다.

## 서버가 직접 보내는 이벤트

- `error_report`: 카드의 「이 설명이 틀렸어요」 신고(교재 키, 문장 번호, 항목, 언어). 신고는 `cache/reports.jsonl`에도 남음.

## 수집하지 않는 것

이름, 이메일, 사진, 문장 내용, 사용자 IP, 로그인 정보.

## 환경 변수

`POSTHOG_KEY`, `POSTHOG_HOST`(없으면 `https://us.i.posthog.com`). 값은 코드와 저장소에 넣지 않고 AI Studio 비밀값에만 둡니다. 가입 순서는 `/mnt/project-files/ai-studio/계측/PostHog-가입-가이드.md` 참고.
