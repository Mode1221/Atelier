# Atelier HQ — AI 회사 본부

개발 경험이 없어도 AI 회사를 운영할 수 있는 대시보드예요. 부서(대표실·기획·디자인·개발·QA·보안법무·마케팅·고객지원·운영·데이터재무)는 AI 가 맡고, **대표님은 결재만** 해요.

## 화면
| 메뉴 | 하는 일 |
|---|---|
| 홈 | 오늘 회사 상태(정상·확인 필요·문제), 핵심 숫자, 결재함, 대표님이 할 일, 서비스·부서 상태 |
| 결재 | 배포·외부 게시·지출·약관 같은 일을 승인하거나 이유를 적어 반려 |
| 업무 | 부서들이 하는 일 칸반. "새 일 맡기기"로 지시 |
| 부서 | 부서별 마지막 실행, 이번 달 비용·예산, 지금 일하기, 쉬게 하기 |
| 연결 | 외부 서비스 연결(키 받는 법 안내 포함), **회사 세우기** 한 번으로 GitHub 에 자동 설치 |
| 설정 | 회사 이름, 부서별 월 예산, 환율, 비밀번호, 최근 기록 |

## 연동 서비스
| 서비스 | 필수 | 보여 주는 것 |
|---|---|---|
| GitHub | ✅ | 업무 보드(이슈), 결재(라벨), 부서 실행(Actions), PROJECT.md 의 "사람 할 일" |
| Claude | ✅ | 부서 실행 키(GitHub 에 암호화 등록), 관리자 키로 이번 달 AI 사용료 |
| 서비스 상태 확인 | | /health 주소 응답 |
| 서비스 지표 | | 서비스가 주는 숫자 (JSON) |
| Sentry | | 최근 24시간 오류 |
| Fly.io | | 서버 상태 |
| Vercel | | 최근 배포 성공 여부 |
| Stripe | | 월 반복 매출·유료 구독 수 |

키가 없는 서비스는 화면에서 빠질 뿐 나머지는 그대로 동작해요.

## 설치 (한 번)
```
cd hq
npm ci
npm start          # http://localhost:3100
```
처음 접속하면 회사 이름과 대표 비밀번호를 정해요. 그다음 **연결 → GitHub, Claude → 회사 세우기** 순서로 누르면 끝이에요.

> **비용 안내**: 아래 Fly.io 방식은 월 약 $0.2~2.2 이고 카드 등록이 필요해요. 무료 원칙에 맞춘 **서버 없는 HQ**(GitHub Pages + 저장소 데이터)는 준비 중이에요. 그 전까지 무료로 쓰려면 내 PC 에서 `npm start` 로 실행하세요 (이때 부서 실행 비용 기록·예산 한도는 동작하지 않아요).

### 인터넷에 올리기 (Fly.io, 자동)
1. fly.io 가입 (결제 카드 등록 필요) → 터미널 없이 대시보드 **Account → Access Tokens** 에서 토큰 만들기
2. 이 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - `FLY_API_TOKEN`: 1번 토큰
   - `HQ_SETUP_CODE`: 대표님만 아는 아무 문구 (첫 설정 때 한 번 물어봐요)
3. **Actions → HQ deploy → Run workflow** (이후엔 hq 코드가 바뀌면 자동 배포)
4. 실행 결과 요약에 나온 주소(`https://atelier-hq-<계정>.fly.dev`)로 접속 → 설정 코드 입력 → 회사 만들기

앱·디스크·암호화 키(`HQ_SECRET`)는 워크플로가 처음 한 번 알아서 만들어요. 앱 이름·지역을 바꾸려면 저장소 Variables 에 `HQ_APP`, `HQ_REGION`.

다른 곳에 올릴 때는 Docker 이미지(`Dockerfile`)를 쓰고, 환경변수 `NODE_ENV=production`, `HQ_SECRET`(32바이트 base64), `HQ_SETUP_CODE` 를 꼭 넣어요. 설정 코드가 없으면 운영 모드에선 첫 설정이 막혀요 (배포 직후 남이 먼저 주인이 되는 것 방지).

## 동작 방식
- 부서 실행: 저장소의 `.github/workflows/atelier-company.yml` (회사 세우기가 설치). 부서마다 정해진 시간에 `/atelier:company run <부서>` 를 실행해요.
- 할 일이 없으면 AI 를 부르지 않고, 실행 전 본부에 **남은 예산**을 물어 초과면 멈춰요.
- 실행이 끝나면 비용을 본부에 보고해요 (`/api/ingest/run`).
- 결재: 부서가 이슈에 `approval-needed` + `[결재 요청]` 댓글 → 본부에서 승인/반려 → 담당 부서가 바로 이어서 진행.

## 보안
- 대표 비밀번호: scrypt 해시. 로그인 실패 10회면 15분 잠금. 세션 쿠키 HttpOnly·SameSite=Strict.
- 연결 키: AES-256-GCM 암호화 저장, 화면에 다시 표시하지 않음. GitHub 비밀값은 GitHub 공개키로 봉인해 등록.
- 폼 요청은 같은 출처만(Origin 확인), CSP·X-Frame-Options.
- 워크플로 → 본부 요청은 별도 토큰(설정에서 교체 가능).

## 개발
```
npm run lint && npm test && npm run test:e2e
```
E2E 는 가짜 GitHub·Claude·Sentry·Stripe 서버를 띄워 처음 설정부터 결재까지 브라우저로 확인해요 (`e2e/serve.mjs`).
워크플로 원본은 `../skills/company/templates/company.yml` — 바꾸면 `npm run sync-template`.
