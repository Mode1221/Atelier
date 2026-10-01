# 운영 통계 (본부 "운영 지표"로 보내는 숫자)

출시하면 대표가 매일 보는 숫자: **몇 명이 왔나 · 무엇을 썼나 · 어디서 왔나.** 서비스 종류마다 재는 법이 다르지만 본부에 보내는 형식은 하나다.
분석 이벤트 설계(spec S6)와 별개로, 이것은 **집계 숫자만** 내보내는 최소 통로다. 개인 정보·내용은 담지 않는다.

## 공통 형식 (stats contract)
```json
{ "at": "2026-10-01T05:00:00Z",
  "series": { "visitors": "방문자", "views": "페이지 열람", "<기능 키>": "<화면에 보일 이름>" },
  "days": [ { "date": "2026-10-01", "visitors": 12, "views": 30, "<기능 키>": 4 } ],
  "sources": { "threads": 5, "direct": 7 },
  "totals": { "<이름>": 123 } }
```
- `days` 는 날짜순(한국 시간), 빠진 날은 0. 값은 0 이상 정수.
- `visitors` 가 있으면 본부가 방문자를 주 지표로, 없으면 `series` 의 첫 키를 주 지표로 그린다.
- 기능 키는 서비스의 **핵심 행동**(spec S6 의 활성화 이벤트)으로 2~5개. 테스트·점검이 만든 데이터는 뺀다(지운 데이터 제외, 스크립트 접속 제외).
- 본부 서비스 문서에 `stats.url`(아래 주소)을 적으면 데이터·재무 부서가 매일 값 그대로 `metrics/daily` 에 옮긴다(`../../company/references/cloud-run.md`).

## 종류별

| 종류 | 방문자(주 지표) | 기능별 | 어디서 | 내보내는 곳 |
|---|---|---|---|---|
| **웹 서비스** | 하루 고유 방문자 — IP·브라우저를 그날 날짜와 섞은 해시로 센다(다른 날과 이어지지 않음, 30일 뒤 삭제). 로봇·링크 미리보기·스크립트(curl 등) 제외 | 핵심 행동 테이블의 날짜별 개수 | 첫 화면 `?ref=`·`utm_source` | 서비스의 공개 통계 주소 `/api/stats/p/<비밀 경로>` — 경로는 `STATS_TOKEN` 에서 HMAC 으로 파생(새 비밀값 없음) |
| **앱** (서버 있음) | **활성 사용자**(DAU) — 앱이 하루 한 번 보내는 "열림" 신호를 기기 id 해시+날짜로 센다. 키 `visitors` 에 넣고 이름은 "활성 사용자" | 핵심 행동 수, 필요하면 `version:<버전>` 별 사용자 | 설치 경로는 스토어 콘솔(사람 확인) — 앱 안에서는 초대 링크 `ref` 만 | 웹과 같은 공개 통계 주소 |
| **앱** (서버 없음) | 스토어 콘솔·Firebase 의 활성 사용자는 로그인이 필요해 부서가 못 읽는다 → 숫자는 사람이 주 1회 입력하거나, 작은 집계 서버(Workers 무료)를 붙인다 | — | — | (사람 입력) |
| **저장소** (플러그인·라이브러리·오픈소스) | GitHub Traffic 고유 방문자 — 14일만 보관되므로 매일 모은다 | 조회·새 스타 (클론은 자동 점검이 섞여 빼요) | 참조 사이트(Traffic referrers) | `atelier-stats` 브랜치 `traffic.json` (공개 저장소면 raw 주소) |

## 웹·앱 — 구현 (Cloudflare Workers + D1 기준)
참고 구현: `examples/chaenggim-pyo` 의 `migrations/0005_visits.sql`, `src/repo.js` 의 `recordVisit`·`publicStats`·`purgeVisits`, `src/app.js` 의 `countVisit`·`/api/stats/p/:key`, `src/security.js` 의 `publicStatsKey`·`visitorId`.
1. 표 2개: `visits(date, vid)` 와 `daily_counts(date, key, n)`.
2. 사람이 연 페이지(앱이면 "열림" API)에서 `recordVisit` — 응답을 막지 않게 `waitUntil`.
3. `publicStats(14)` 가 위 공통 형식을 돌려준다. 기능 키는 지운 데이터 제외.
4. 매일 정리 작업에서 30일 지난 방문 기록 삭제.
5. 처리방침 "자동 수집" 에 방문 집계 한 줄(변환값·보관 30일) — guard G3·G4.
6. 테스트: 로봇 제외·하루 1명·지운 데이터 제외·비밀 경로 아니면 404·응답에 IP·브라우저 문자열 없음.
7. 본부 연결(사람 할 일 1개): 클라우드 환경 **네트워크 허용 도메인에 서비스 주소 추가**. 주소(비밀 경로)는 대표만 보는 본부 서비스 문서 `stats.url` 에만 적는다.

## 저장소 — 구현
1. `../../operate/templates/repo-traffic.yml` → `.github/workflows/repo-traffic.yml`, 수집기는 `scripts/atelier/repo-traffic.mjs`(install-tools 가 복사).
2. 사람 할 일(5분): GitHub → Settings → Developer settings → Fine-grained token — 그 저장소 하나만, 권한 **Administration: Read-only** → 저장소 Secrets → Actions 에 `STATS_PAT`. 없으면 워크플로가 조용히 건너뛴다.
3. 매일 `atelier-stats` 브랜치에 `traffic.json`(공통 형식 + 90일 `history`). 본부 서비스 문서 `stats.url` = `https://raw.githubusercontent.com/<owner>/<repo>/atelier-stats/traffic.json`.
- 공개 저장소면 이 파일도 공개다(집계 숫자뿐). 비공개로 두려면 비공개 저장소에서 돌린다.
