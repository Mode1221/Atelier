# 디자인 도구 선택 기준 (상황별 자동 선택)

목표: **사람에게 보이는 화면 품질은 올리고, Claude 사용량은 최소로.** 외부 디자인 스킬 4개를 서비스 유형·단계에 맞춰 필요한 곳에만 쓴다.
pilot 이 인터뷰 직후 **한 번** 이 표로 PROJECT.md "디자인 도구 계획" 절을 만들고(`../scripts/tool-plan.mjs`), 이후 단계는 **그 절만 읽는다** — 다시 판단하지 않는다.

## 1. 외부 스킬 (저장소에 복사하지 않는다 — 설치 안내만)
| 스킬 | 하는 일 | 명령 | 라이선스 |
|---|---|---|---|
| frontend-design (Anthropic) | 디자인 방향 원칙: 주제에서 나온 색·글꼴·레이아웃, 흔한 AI 티 피하기 | 명령 없음 — 원칙으로 적용 | Apache 2.0 |
| impeccable (pbakaus/impeccable) | 화면 설계·검토·다듬기 명령 모음 | `/impeccable shape` `critique` `audit` `harden` `polish` `onboard` … | Apache 2.0 |
| brandkit (Leonxlnx/taste-skill) | 로고·브랜드 보드·키 아트 **이미지 생성용 프롬프트** (이미지는 ChatGPT Images 등 이미지 생성기에서) | 스킬 이름으로 요청 | MIT |
| playwright-mcp (microsoft/playwright-mcp) | 대화하면서 브라우저를 직접 조작 | MCP 도구 | Apache 2.0 |

## 2. 서비스 유형 판정
프로필(형태·과금·대상)과 spec 의 핵심 화면으로 정한다. **섞여 있으면 화면별로 나눈다** (예: 정산 화면 = 도구형, 소개 페이지 = 랜딩 중심).
| 유형 | 판단 기준 | impeccable 모드 |
|---|---|---|
| 도구형 | 사용자가 할 일을 끝내러 온다 (기록·정산·관리·편집·대시보드) | Operate |
| 감성·소비자형 | 느낌·취향이 선택 이유 (추천·데이트·여행 영감·패션·취미) | Experience (소개·가입 화면은 Persuade) |
| 랜딩 중심 | 한 페이지에서 설득하고 행동시키는 게 전부 (대기 명단·예약·판매) | Persuade |
| 게임 | 플레이 화면이 제품 | (화면은 게임 엔진) |
| 모바일 네이티브 | Expo·Swift·Kotlin 앱 (웹 아님) | Operate/Experience + native |
문서·도움말 화면은 impeccable `Read` — 디자인 스킬은 쓰지 않는다(아래 4절).

## 3. 유형별 단계 표 (표준 = Max 기준, 절약 = Pro 는 5절로 줄임)
`B` = build 게이트 직전, `L3` = 랜딩, `L5` = 출시 준비 점검 전, `UT` = usertest, `G` = grow 기능 사이클.
| 단계 | 도구형 | 감성·소비자형 | 랜딩 중심 | 게임 | 모바일 네이티브 |
|---|---|---|---|---|---|
| D0 방향 | frontend-design 원칙만 (시안 없음) | `/impeccable shape` 시안 2안 | `/impeccable shape` (Persuade) | brandkit 키 아트 프롬프트 | frontend-design 원칙 |
| D4 시안 | 토큰 HTML + 스크립트 캡처 | 토큰 HTML + 캡처 → `/impeccable critique` | 토큰 HTML + 캡처 | HUD·메뉴 + 스크립트 캡처만 | Expo 웹 미리보기·에뮬레이터 캡처 |
| D6 접근성 | `/impeccable audit` | 체크리스트(스킬 없음) | `/impeccable audit` | 체크리스트 | `/impeccable audit` (native 자동) |
| D7 브랜드 | brandkit 파비콘·OG 만 | brandkit 로고·브랜드 보드 | brandkit OG·공유 이미지 | brandkit 키 아트 | brandkit 앱 아이콘 |
| B | `/impeccable harden` | — | — | — | `/impeccable harden` |
| L3 | — | — | `/impeccable onboard` | — | — |
| L5 | — | `/impeccable polish` | `/impeccable polish` | — | — |
| UT | Playwright 스크립트 (walk.mjs) | 〃 | 〃 | 스크립트 캡처 | 스크립트·에뮬레이터 — **playwright-mcp 안 씀** |
| G | 작은 변경: 스킬 없음 / 새 화면: `/impeccable critique` 1회 | 〃 | 〃 | 스킬 없음 | 〃 |

## 4. 사용량 규칙 (모든 유형)
- **사람에게 보이는 결과물(D0·D4·D6·D7, B 의 화면 보강, L3·L5)에만** 디자인 스킬을 쓴다. 문서 단계(D1 여정·D2 와이어프레임·D3 토큰 문서·D5 계획)에는 쓰지 않는다.
- 외부 스킬은 **실행하는 명령의 참고 문서만** 읽는다(예: `audit` 이면 impeccable 의 `reference/audit.md` 만). 스킬 전체·다른 명령 문서를 미리 읽지 않는다.
- 스크린샷은 **Playwright 스크립트**가 기본(한 번에 모바일·데스크톱·라이트·다크). **playwright-mcp 는 대화형 조작이 꼭 필요할 때만**: usertest 에서 스크립트로 못 찾는 막힘 탐색, 재현이 어려운 레이아웃 버그 추적.
- grow 기능 사이클: 문구·요소 수정 같은 작은 변경은 디자인 스킬 없이. 새 화면이 생길 때만 `/impeccable critique` 1회.
- impeccable 의 `init`(PRODUCT.md)은 쓰지 않아도 된다 — Atelier 의 `docs/idea.md`·`docs/spec.md` 가 같은 역할. 명령이 제품 정보를 물으면 그 두 파일을 가리킨다.

## 5. 요금제별 한도 (PROJECT.md 에서 바꿀 수 있음)
| 예산 모드 | 기본 요금제 | 시안 | 검증(캡처→고치기) | 스킬 명령 |
|---|---|---|---|---|
| **절약** | Pro (모르면 Pro 로 가정) | 1안 | 1회 | **단계당 최대 1개** — 표에서 한 칸에 둘이면 앞의 것만 |
| **표준** | Max | 2안 | 2회 | 표 그대로 |
사용자가 "디자인에 더 써도 돼"/"아껴 줘"라고 하면 PROJECT.md 의 `예산 모드` 줄만 바꾼다.

## 6. 설치 안 됐을 때 대체 수단
| 없음 | 대체 |
|---|---|
| frontend-design | `design-direction.md`(Atelier 요약: 주제에서 색·글꼴 고르기, 흔한 AI 티 목록 피하기, 한 곳에만 대담하게) |
| impeccable `shape` | `design-direction.md` 로 방향 1장 + D2 와이어프레임 |
| impeccable `critique`·`polish` | 스크립트 캡처를 보고 `design-direction.md` 5절 자체 검토 목록으로 한 번 고치기 |
| impeccable `audit` | `accessibility-checklist.md` + axe 자동 검사(Playwright 스크립트) |
| impeccable `harden` | `screen-states.md` 의 상태별 화면(빈·로딩·오류·긴 글자·오프라인) 전부 구현 확인 |
| impeccable `onboard` | `../../launch/references/landing-copy.md` 헤드라인·첫 행동 |
| brandkit | `brand-assets.md` 규격으로 Claude 가 SVG 아이콘·OG 를 직접 만들고 PNG 로 캡처 |
| playwright-mcp | Playwright 스크립트 (이미 기본) |
