# Atelier HQ — AI 회사 본부 (서버 없음 · 무료)

개발 경험이 없어도 AI 회사를 운영할 수 있는 대시보드예요. 부서(대표실·기획·디자인·개발·QA·보안법무·마케팅·고객지원·운영·데이터재무)는 AI 가 맡고, **대표님은 결재만** 해요.

**서버가 없어요.** 화면은 브라우저에서만 돌고, 데이터는 대표님 GitHub 저장소에 있어요. Atelier 쪽에는 아무것도 저장되지 않아요. 그래서 운영비가 **0원**이고, 따로 배포할 필요도 없어요.

## 쓰는 법
1. 공개 주소로 접속 (Atelier 가 Cloudflare 무료 호스팅에 올려 둔 것): `https://atelier-hq.<계정>.workers.dev`
2. 회사 저장소 이름과 GitHub 토큰(fine-grained, 그 저장소 하나만: Actions·Contents·Issues·Pull requests·Secrets·Workflows 읽기/쓰기)으로 로그인
3. 연결 → Claude 키 입력 → **회사 세우기**

## 화면
| 메뉴 | 하는 일 |
|---|---|
| 홈 | 오늘 회사 상태, 핵심 숫자, 결재함, 대표님이 할 일(PROJECT.md), 서비스·부서 상태 |
| 결재 | 배포·외부 게시·지출·약관 같은 일을 승인하거나 이유를 적어 반려 |
| 업무 | 부서 업무 칸반, 새 일 맡기기 |
| 부서 | 이번 달 비용·예산, 지금 일하기, 쉬게 하기 |
| 연결 | 외부 서비스 키를 GitHub 비밀값으로 암호화 저장, 회사 세우기 |
| 설정 | 회사 이름, 부서별 월 예산, 환율, 로그아웃 |

## 어디에 무엇이 저장되나
| 무엇 | 어디 |
|---|---|
| GitHub 토큰 | 이 브라우저만 (기본은 탭을 닫으면 삭제, "이 기기에서 기억하기"를 켜면 유지) |
| 외부 서비스 키 | 저장소 Secrets (`ANTHROPIC_API_KEY`, `ATELIER_SVC_*`) — 브라우저에서 GitHub 공개키로 봉인해 보냄, 다시 읽을 수 없음 |
| 설정·예산 | 저장소 `atelier-data` 브랜치 `hq.json` |
| 부서 실행 기록·비용 | `atelier-data` 브랜치 `runs/YYYY-MM/…` (파일 이름에 부서·비용) |
| 외부 서비스 상태 | `atelier-data` 브랜치 `status.json` — `atelier-collect` 워크플로가 3시간마다 갱신 |

## 연동 서비스
GitHub(필수), Claude(필수, 관리자 키로 AI 사용료), 서비스 상태 확인, 서비스 지표, Sentry, Fly.io, Vercel, Stripe.

## 보안
- 토큰은 `api.github.com` 으로만 보낸다 (CSP `connect-src` 로 강제). 서버가 없으니 서버 유출도 없다.
- 모든 화면 문자열은 이스케이프, 인라인 스크립트 없음, 외부 스크립트 없음.
- 공용 PC 에서는 "기억하기"를 끄거나 쓰고 나서 로그아웃.

## 개발
```
npm ci
FAKE=1 npm run dev     # 가짜 GitHub 로 화면 확인 (http://127.0.0.1:3100)
npm run lint && npm test && npm run test:e2e
```
- 비밀값 봉인(`public/js/sealed.js`)은 `vendor-src/` 를 `npm run build:vendor` 로 묶은 것. libsodium 과 호환되는지 테스트로 확인한다.
- 부서 워크플로 원본은 `../skills/company/templates/company.yml` — 바꾸면 `npm run sync-template`.
- 배포: main 에서 HQ 테스트가 통과하면 `.github/workflows/hq-deploy.yml` 이 Cloudflare 에 올린다.
