# Atelier

> **English summary.** Atelier is a **Korean-language** Claude Code plugin that guides a solo builder from an idea to a launched, operable web service through eight gated stages (idea → spec → design → build → security/legal → launch → operate → grow), defaulting to free-tier hosting. After launch, an optional local "AI company" mode runs departments (CEO office, support, marketing, …) whose proposals the founder approves. Prompts, documents and generated guidance are in Korean.
>
> Install: `/plugin marketplace add Mode1221/Atelier-dev` then `/plugin install atelier-dev@atelier`, and start with `/atelier-dev:pilot` in an empty folder. License: MIT.

1인 개발자가 아이디어부터 **실제로 운영 가능한 서비스**까지 단계별로 따라갈 수 있게 해 주는 Claude Code 플러그인입니다.
각 단계는 세부 단계로 나뉘고, 게이트(완료 조건)를 통과해야 다음으로 넘어갑니다. AI 가 할 수 있는 작업은 직접 하고, 사람만 할 수 있는 일은 체크리스트로 안내합니다.

## 무료 우선
기본값은 **운영비 0원**입니다. 서버·DB·배포는 무료 등급(Cloudflare Workers + D1 등)으로 추천하고, 스토어 등록비처럼 피할 수 없는 비용은 해당 단계에 들어가기 전에 금액·시점·무료 대안과 함께 먼저 안내합니다. 기준표: `skills/build/references/free-tier.md`.

## 준비물
- Claude Pro 이상 요금제, 내 컴퓨터(Windows·Mac)의 [Claude Code](https://docs.claude.com/en/docs/claude-code/overview), 빈 폴더 하나. **GitHub 계정은 없어도 됩니다.**
- Node.js·Git 은 처음 `/atelier-dev:pilot` 을 실행하면 Claude 가 확인하고, 없으면 설치를 도와줍니다.
- 나중 단계에서만: 무료 Cloudflare 계정(배포 때, `npm run deploy:first` 한 줄), 휴대폰 ntfy 앱(장애 알림, 선택).

## 설치
```
/plugin marketplace add Mode1221/Atelier-dev
/plugin install atelier-dev@atelier
```
이미 설치했다면 `/plugin marketplace update atelier` 후 `/plugin update atelier-dev@atelier` 로 최신 버전을 받습니다.

> **0.8.0 부터 플러그인 이름이 `atelier` → `atelier-dev` 로 바뀌었습니다.** 명령어도 `/atelier:pilot` → `/atelier-dev:pilot` 입니다.
> 예전 버전을 설치했다면 한 번만 다시 설치하세요: `/plugin marketplace update atelier` → `/plugin uninstall atelier@atelier` → `/plugin install atelier-dev@atelier`.
> 프로젝트 폴더의 `PROJECT.md`·`.atelier/` 는 그대로 이어서 쓸 수 있습니다.

> 만드는 사람용: 스킬을 바꿔 배포할 때마다 `.claude-plugin/plugin.json` 의 `version` 을 올려야 기존 설치자에게 업데이트가 전달됩니다 (작은 수정 0.7.1, 기능 추가 0.8.0).

## 사용
프로젝트 폴더에서 `/atelier-dev:pilot` 으로 시작합니다. 인터뷰를 거쳐 `PROJECT.md`(맞춤 로드맵)가 만들어지고, 이후 세션마다 현재 단계를 안내합니다.
매 push 마다 **품질 게이트**(`npm run quality`)가 사람 대신 확인합니다: 기능마다 테스트가 있는지(요구사항 추적), 분석 이벤트 계획과 코드가 맞는지, DB 변경이 데이터를 날리지 않는지, 비밀값이 새지 않는지. 운영은 서비스 목표치(SLO)·오류 예산·장애 등급·사후 분석으로, 아이디어는 가장 위험한 가정부터 숫자 기준으로 검증합니다.
단계를 넘길 때마다 **증거 검사**(`skills/pilot/scripts/gate-check.mjs` — 완료로 체크했는데 결과물이 없으면 잡음)와 **대표 확인**(단계별로 직접 볼 것 한 줄, `skills/pilot/references/owner-checks.md`)을 거칩니다.

## 단계
| # | 스킬 | 세부 단계 | 게이트 |
|---|---|---|---|
| 1 | idea | (후보 거름망) · 문제 정의 · 경쟁 조사 · 린 캔버스 · 수요 검증 · 사업성 · MVP 범위 · 이름·상표 확인 | MVP·중단 기준 확정 |
| 2 | spec | 스토리·수용 기준 · 기능 정책 · 데이터 모델 · 아키텍처 · 비기능 요구 · 분석 이벤트 · 작업 분해 · 대표용 한 장 요약 | 명세 확정 |
| 3 | design | 여정·흐름 · 와이어프레임(상태별) · 토큰·컴포넌트 · 시안 · 프로토타입 테스트 · 접근성 · 브랜드 에셋 | 시안·접근성 통과 |
| 4 | build | 기반·환경 분리 · 데이터 · 인증·탈퇴 · 기능 · 결제 · 알림 · 관리자 · 오류 처리 · 계측 · 테스트 · 성능·SEO · 배포·롤백 · 서비스 지도 · 자체 도메인(선택) | 운영 준비 체크리스트 |
| 5 | guard | 보안 · 부하·장애 · 개인정보 · 처리방침·약관 · 라이선스 · 스토어 심사 · 사업 신고 · 운영 계정 2단계 인증 | 치명 이슈 0 |
| 6 | launch | 사용성 테스트(usertest) · 공개 베타(beta) · 랜딩·스토어 · 채널 계획·공유(share) · Go/No-Go · 출시일 운영 · 회고 | 출시·회고 |
| 7 | operate | 모니터링 · 장애 런북 · 백업·복구 · 고객 지원 · 비용 · 유지보수 · 릴리스 · 정기 점검 · 서비스 종료 절차 | 운영 체계 가동 |
| 8 | grow | 대시보드 · 퍼널·코호트 · 리텐션 · 가격 · 실험 · 로드맵 재정렬 | 2~4주 주기 반복 |

### 사람 없이 돌아가는 출시 도구
- `usertest` — **AI 대리 사용성 테스트**: 페르소나가 실제 브라우저로 과제를 수행(화면에 보이는 이름으로만 찾기), 막힘·사용자 말과 다른 라벨·접근성 자동 점검 → 보고서·수정. CI 에서 매번 재실행.
- `beta` — **공개 베타**: 링크만 열어 두면 서비스 안 "의견 보내기"(익명·개인정보 자동 가림) → 프로젝트 폴더로 가져오기(`npm run feedback:pull`, GitHub 없이) 또는 GitHub 이슈로 자동 수집 → 고객지원 부서 분류.
- `share` — **SNS 공유**: 서비스 안 공유 고리(공유 버튼·`?ref=`·"나도 만들기"), 채널별 홍보 글 → HQ **홍보** 화면에서 버튼 한 번으로 공식 공유 창 열기, utm 으로 채널별 유입 측정.

출시 후 운영은 명령 한 줄씩: `npm run watch:setup`(서비스가 죽으면 휴대폰 알림, 컴퓨터 꺼져도 동작) · `npm run backup`(코드·DB 를 구글 드라이브 같은 동기화 폴더로). GitHub 을 쓴다면 정기 점검도 `/atelier-dev:checkup setup` 으로 자동화합니다 — 매일 헬스체크·인증서·만료일·의존성·백업 검사(GitHub Actions, 비용 0), 매주 AI 점검 보고서(선택). 실패하면 이슈와 휴대폰 알림이 옵니다.

출시 후 새 기능은 `grow → spec → design → build → guard → 릴리스` 기능 사이클로 작게 반복합니다.
프로필(웹/앱/게임, 과금, 계정 유무)에 따라 해당 없는 세부 단계는 `N/A` 로 표시됩니다.

## 디자인 강화 (선택)
설치하면 화면 품질이 올라가고, 없으면 Atelier 자체 기준으로 진행합니다. `/atelier-dev:pilot` 이 인터뷰 직후 서비스 유형에 맞춰 **어느 단계에서 무엇을 쓸지 한 번만 정해** PROJECT.md "디자인 도구 계획"에 적고(`skills/design/references/design-routing.md`), 필요한데 없는 것만 한 번 알려 줍니다. Pro 요금제는 "절약" 모드(시안 1안, 단계당 명령 1개)로 사용량을 아낍니다.
| 스킬 | 하는 일 | 설치 (정확한 방법은 각 저장소 README) | 쓰이는 유형 |
|---|---|---|---|
| [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (Anthropic, Apache 2.0) | 주제에 맞는 색·글꼴·레이아웃 방향, 흔한 AI 티 피하기 | `npx skills add https://github.com/anthropics/skills --skill frontend-design` | 도구형·모바일의 방향 잡기 |
| [impeccable](https://github.com/pbakaus/impeccable) (Apache 2.0) | `shape`·`critique`·`audit`·`harden`·`polish`·`onboard` 등 화면 설계·검토 명령 | 프로젝트 폴더에서 `npx impeccable install` | 도구형(점검), 감성형·랜딩(설계·다듬기), 모바일(native 점검) |
| [brandkit](https://github.com/Leonxlnx/taste-skill) (MIT) | 로고·브랜드 보드·키 아트 이미지용 프롬프트 (이미지는 ChatGPT Images 등에서 생성) | `npx skills add https://github.com/Leonxlnx/taste-skill --skill brandkit` | 모든 유형의 브랜드 에셋(범위는 유형별) |
| [playwright-mcp](https://github.com/microsoft/playwright-mcp) (Apache 2.0) | 대화하면서 브라우저를 직접 조작 | `claude mcp add playwright npx @playwright/mcp@latest` | 웹 유형의 usertest 막힘 탐색·레이아웃 버그 추적만 |
외부 스킬 파일은 이 저장소에 들어 있지 않습니다(각 라이선스는 원 저장소).

## AI 회사 모드 + 본부
출시 후에는 부서 10개(대표실·기획·디자인·개발·QA·보안법무·마케팅·고객지원·운영·데이터재무)가 **스스로 일하고**, 사람은 **대표로서 결재만** 합니다.
- **기본 = 로컬 모드**: 내 컴퓨터의 Claude Code 만 있으면 됩니다(클라우드·GitHub·토큰 없음). 본부는 프로젝트 폴더 `company/<서비스>/` 파일, 결재는 대화창에서 `/atelier-dev:company` → "1번 승인". 부서 실행은 `run all`(직접) 또는 `schedule`(매일, **컴퓨터가 켜져 있을 때만**). 설치: `/atelier-dev:company setup`.
- **고급 = 클라우드** (`setup cloud`, **claude.ai/code 클라우드 세션에서**): claude.ai 본부 페이지 — 컴퓨터가 꺼져도 부서가 돌고 **폰에서 결재**. **GitHub 방식** (`setup github`): 아래 `hq/` 대시보드 + GitHub Actions(API 키 필요).
- 차이 한 줄: 로컬은 설치가 가장 쉽지만 내 컴퓨터가 켜져 있어야 하고, 클라우드는 항상 돌지만 claude.ai/code 세션이 필요합니다.
- `skills/company` — 부서 역할(`references/departments/`), 업무 규칙(`references/board.md`), 부서별 예약 실행 워크플로
- `hq/` — 개발 경험이 없어도 쓰는 대시보드 (**서버 없음·무료**: 정적 페이지 + GitHub 저장소가 데이터 저장소): 오늘 회사 상태, 결재함(승인·반려), 업무 보드, 부서별 비용·예산, 홍보(한 번 눌러 올리기)·베타 의견, 외부 서비스 연결(GitHub·Claude·Sentry·Fly.io·Vercel·Stripe·상태 확인·지표), **회사 세우기** 버튼 하나로 GitHub 에 자동 설치. 사용법은 `hq/README.md`
- 하지 않는 것: 애니메이션·영상 제작, API 없는 커뮤니티 자동 게시, 결재 없는 지출·배포·게시

## 구성
- `skills/` — 단계별 스킬과 참고 자료(`references/`)
- `agents/reviewer.md` — 단계 게이트 검토 (테스트 명령 실행 권한을 주면 E2E 까지 직접 확인)
- `hooks/` — 세션 시작 시 현재 단계·진행률 표시

법률 관련 산출물은 참고용 초안이며, 최종 판단은 전문가에게 확인하세요.
