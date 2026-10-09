# PostHog 가입·사용·운영 가이드

작성 2026-10-09 (KST). 가격·한도·주소는 PostHog 공식 문서를 같은 날 읽은 값입니다. 화면의 버튼 이름은 직접 다 열어 보지 못해 달라질 수 있고, 확인하지 못한 것은 맨 아래에 모아 두었습니다. 어떤 기록이 쌓이는지는 `docs/features/analytics.md`를 봅니다.

## 1. 왜 쓰나

몇 명이 오는지, 일주일 뒤에 다시 오는지, 문장을 끝까지 듣는지, 한 페이지 만드는 데 Gemini 비용이 얼마인지, 틀렸다는 신고가 어디에 몰리는지 답할 숫자가 없었습니다. 앱이 기록을 서버로 보내면 서버가 PostHog로 전달하고, PostHog가 쌓아서 그래프로 보여 줍니다. 이름·이메일·사진·문장 내용·IP는 보내지 않고, 브라우저가 만든 무작위 기기 번호(`dev_…`)만 씁니다.

## 2. 가입 순서 (2026-10-09 완료, 새로 할 때 참고)

1. posthog.com에서 무료로 시작해 이메일로 가입합니다. 무료 플랜은 월 이벤트 100만 건, 신용카드 불필요, 프로젝트 1개, 데이터 1년 보관입니다.
2. 데이터 지역을 고릅니다. US는 `https://us.i.posthog.com`, EU는 `https://eu.i.posthog.com`이 `POSTHOG_HOST` 값입니다.
3. 설치 안내가 나오면 건너뜁니다. 서버가 전달하므로 설치할 것이 없습니다.
4. `https://app.posthog.com/project/settings`에서 Project API key(`phc_`로 시작)를 찾습니다. 이 값이 `POSTHOG_KEY`입니다.
5. Settings > Project > General의 「IP data capture configuration」에서 IP를 저장하지 않는 쪽으로 바꾸는 것을 권합니다(우리 코드는 IP를 보내지 않지만 이중 안전장치). 이 설정을 실제로 바꿨는지는 기록에 없습니다.
6. AI Studio 환경 변수(비밀값)에 `POSTHOG_KEY`, `POSTHOG_HOST`를 넣고 다시 배포합니다. 값은 코드·GitHub·채팅에 적지 않습니다.
7. PostHog의 Activity 화면에서 1~2분 안에 `app_open` 줄이 나타나는지 봅니다.

## 3. 화면 사용법

세 곳만 씁니다.

- **Activity**: 기록이 들어왔는지 확인. 줄 왼쪽 화살표로 Properties를 펼치면 `internal`, `src`, `GeoIP disabled`가 보이고 IP·위치 속성은 없어야 합니다. 시간 범위를 Last 24 hours 등으로 바꾸고 Select an event로 이벤트를 고르면 그 이벤트만 보입니다.
- **Insights**: Product analytics > New insight. 기본이 Trends. 이벤트를 고르고 집계를 Total count에서 Unique users로 바꾸면 "몇 명"이 됩니다. 속성 조건(예: `src`)은 이벤트 이름 옆 필터 아이콘, 저장은 Save.
- **Dashboards**: New Dashboard > Blank Dashboard에 Insight를 모읍니다. 날짜 범위를 바꾸면 모든 Insight에 함께 적용됩니다.

## 4. 매주 월요일 숫자 5개

낯선 사용자만 봅니다(`src`가 `blog`·`community`·`ref` 중 하나이고 `internal`이 true가 아닌 것).

| # | 숫자 | 만드는 방법 | 필요한 기록 | 지금 가능? |
| --- | --- | --- | --- | --- |
| 1 | 주간 활성 사용자 | Trends, Unique users, 주 단위 | `sentence_play_start` | 아니요(B3 뒤). 임시로 `app_open` |
| 2 | 신규 vs 재방문 | Retention(시작·돌아온 이벤트 모두 `app_open`, 주 단위) | `app_open` | 네 |
| 3 | 사용자당 올린 페이지 수 | Trends, `reused`가 false인 `photo_analyzed` | `photo_analyzed` | 아니요(B2 뒤) |
| 4 | 주간 완료 문장 중앙값 | HogQL 또는 사용자당 평균 | `sentence_complete` | 아니요(B3 뒤, 정의 재결정 필요) |
| 5 | 페이지당 Gemini 원가 | Trends 합계 ÷ 새 페이지 수 | `gemini_call`, `photo_analyzed` | 아니요(B2 뒤, 단가 필요) |

`photo_analyzed`·`photo_analyze_failed`·`limit_blocked`·`gemini_call`은 B2에서 추가할 이름이며 지금은 코드에 없습니다. 위 `sentence_*`도 B3에서 보내기 시작합니다.

## 5. 내 기기·친구·낯선 사용자

주소 끝 꼬리표로만 구분합니다. 처음 열면 그 기기에 저장되어 이후 모든 기록에 붙고, 저장한 뒤 주소창에서는 지워집니다.

| 누가 | 주소 끝 | 집계에서 |
| --- | --- | --- |
| 나(운영자)의 폰·PC | `?internal=1` (해제 `?internal=0`) | 항상 제외 |
| 친구·가족 | `?src=friend` | 낯선 사용자에서 제외 |
| 낯선 사람 모집 | `?src=blog`, `?src=community`, `?src=ref` | 이 세 값이 낯선 사용자 |

`src`는 처음 값이 유지되고, 형식은 영문 소문자·숫자·`_`·`-` 24자 이하입니다. 한계: `friend` 링크를 그대로 전달하면 받은 사람도 `friend`로 잡히므로 전달용 링크는 `ref`로 따로 줍니다.

## 6. 신고 보기

카드의 「이 설명이 틀렸어요」는 PostHog에 `error_report`로 들어오고 서버 파일 `cache/reports.jsonl`에도 쌓입니다(파일은 재배포 때 사라질 수 있어 PostHog 기준). 속성은 `reason`(raw_text·translation·pronunciation·vocabulary·other), `lesson_key`(데모는 `demo-arc`·`demo-chinese`), `sentence_id`(`s00`부터), `lang`입니다. Activity에서 `error_report`만 고르면 보이고, `reason`별 개수는 Trends의 breakdown으로 봅니다. 같은 `lesson_key`·`sentence_id`가 여러 번 나오면 그 문장이 진짜 틀린 후보라서 교재를 열어 직접 읽어 봅니다. 많이 몰린 항목의 AI 지시문(번역·발음·OCR)을 고치는 데 씁니다. 오류율(문장 100개당 신고)은 B3 뒤에 계산할 수 있습니다.

## 7. 운영 방안 (제안)

| 주기 | 할 일 | 결정 |
| --- | --- | --- |
| 오늘~이번 주 | 내 폰·PC를 `?internal=1`로 열기, 실제 폰의 `dev_…` 사용자 확인 | 내 기록이 집계에 섞이지 않는지 |
| 이번 주 | B2·B3 작업, Retention 인사이트로 대시보드 시작 | "문장 완료" 정의 |
| 매주 월요일 | 숫자 5개와 `error_report` 훑어보기 | 모집을 계속할지, 어느 화면을 고칠지 |
| 매월 첫째 주 | 무료 한도 사용량, Gemini 청구서와 `gemini_call` 원가 비교, 단가 재확인 | 한도·등급 조정 |

- 무료 한도: 알림 메일이 80%와 100%에서 조직 소유자에게 옵니다(공식 문서). 결제 한도(billing limit)를 건 경우 한도 초과분은 수집되지 않고 사라진다고 문서에 적혀 있습니다. 설계상 사용자 1명이 하루 수십 건이라 수십 명 규모는 넉넉하다고 추정하지만, 실제 사용량은 첫 주에 확인합니다.
- 개인정보: 보내는 것은 기기 번호, 모집 꼬리표, 내 기기 표시, 재생·한도·원가·신고 사실뿐입니다. 이벤트와 속성은 서버의 허용 목록(`/api/event`)을 통과해야 늘어납니다.
- 숫자를 믿기 전에: 수십 명 미만일 때는 인터뷰가 더 많은 정보를 줍니다. 기기 번호는 브라우저 데이터에 있어 데이터를 지우거나 시크릿 창을 쓰면 같은 사람이 새 사용자로 잡히므로 재방문 숫자는 실제보다 낮게 나올 수 있습니다.

## 8. 문제가 생기면

| 증상 | 점검 |
| --- | --- |
| Activity에 아무것도 안 들어옴 | 비밀값 이름이 정확히 `POSTHOG_KEY`·`POSTHOG_HOST`인지 → 값을 넣은 뒤 다시 배포했는지 → 지역과 주소가 맞는지 → 시간 범위가 Last hour가 아닌지 → 서버 로그의 `[Analytics] capture failed` 경고(로그 보는 위치는 AI Studio 화면에 따라 다름, 미확인) |
| 폰 기록만 없음 | 광고 차단기는 영향 없음(서버가 전달). 30분 안의 재접속은 `app_open`을 다시 보내지 않음 |
| 내 기록이 낯선 사용자에 섞임 | 그 기기를 `?internal=1`로 한 번 열었는지, Insight에 `internal`이 true가 아니라는 조건이 있는지 |
| 같은 사람이 여러 명 | 브라우저 데이터 삭제·시크릿 창·다른 기기. 현재 한계 |
| 이벤트에 IP·위치가 보임 | 프로젝트 설정의 IP data capture 확인 후 보고. 우리 코드는 사용자 IP를 보내지 않음 |
| 신고했는데 `error_report`가 없음 | 「오늘은 신고를 더 받을 수 없어요」가 보였다면 하루 한도(기기당 30건). 아니면 첫 줄의 연결 점검 |
| 무료 한도 알림 메일 | 사용량 화면에서 같은 이벤트가 비정상적으로 반복되는지 확인 |

## 9. 확인하지 못한 것과 결정이 필요한 것

확인하지 못한 것:

- 실제 폰에서 연 `dev_…` 사용자의 `app_open`(지금까지 확인한 것은 시험 기기 `eng-lead-test-0001`의 `app_open` 하나, 꼬리표 `englead_test`, `internal` true).
- 실제 사용자가 누른 신고가 PostHog에 `error_report`로 보이는지.
- 무료 한도를 넘었을 때 일어나는 일과 알림 메일을 받는 사람.
- `$geoip_disable` 속성이 공식 문서에 있는지(시험 이벤트에는 붙어 있고 IP·위치 속성은 보이지 않았음).
- Insight 필터 버튼·breakdown 위치와 「Filter out internal and test users」 설정의 라벨, HogQL 실행 여부, 특정 사용자(Person) 삭제 방법.

결정이 필요한 것:

1. **"문장 완료"의 정의.** 기존 설계는 0.75x로 끝까지 듣는 것만 세지만 새 카드는 1.0x로 시작합니다. 추천: 속도와 상관없이 자연 종료하면 완료로 세고 `rate` 속성으로 나눠 봅니다(0.75x만 세면 정상 사용 대부분이 빠져 숫자가 작아짐). 반대 입장: 쉐도잉(0.75x)이 핵심이면 그 행동만 세는 편이 정확합니다.
2. **같은 사람이 여러 명으로 잡히는 문제.** 기기 번호를 쿠키로 한 번 더 잡는 보강(B4). 첫 주 숫자를 본 뒤 필요하면 합니다.
3. **Gemini 단가 4개**(사진 분석 입력·출력, 음성 입력·출력, 100만 토큰당 USD). 모르면 비워 두고 토큰 수만 먼저 기록할 수 있습니다.

## 10. 출처

- 가격·무료 범위: https://posthog.com/pricing
- 이벤트 전송 주소와 필드, 프로젝트 키: https://posthog.com/docs/api/capture
- IP 저장 설정: https://posthog.com/docs/privacy/data-collection
