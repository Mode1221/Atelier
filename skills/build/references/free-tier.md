# 무료 우선 스택과 비용 안내

Atelier 의 기본값은 **운영비 0원으로 시작**하는 것이다. 무료 한도·조건은 자주 바뀐다 — 추천할 때마다 공식 요금 페이지를 확인하고, 확인하지 못했으면 "확인 필요"라고 적는다.

## 1. 종류별 무료 기본 스택
| 서비스 종류 | 기본 추천 (0원) | 무료로 되는 것 | 주의 |
|---|---|---|---|
| 웹 (정적) | Cloudflare Pages / GitHub Pages | 호스팅·HTTPS·CDN | GitHub Pages 는 비공개 저장소면 유료 플랜 필요 |
| **웹 + 서버 + DB** | **Cloudflare Workers + D1 + R2 + 정적 자산 + Cron** | 서버·SQLite DB·파일 저장·예약 작업·HTTPS·`*.workers.dev` 주소. 카드 없이 시작 | 하루 요청 수·DB 읽기/쓰기 한도. 인스턴스가 여러 개 → 메모리 상태 공유 불가 |
| 로그인이 필요한 웹/앱 | Supabase 무료 또는 Firebase Spark | 인증·DB·스토리지 | Supabase 무료 프로젝트는 일정 기간 미사용 시 일시정지 |
| 계속 켜진 서버가 꼭 필요 | Oracle Cloud Always Free | ARM VM | 가입·설정이 어렵고 카드 인증 필요 → 최후 수단 |
| 모바일 앱 | Expo + Firebase/Supabase 무료 | 개발·테스트 빌드 | **스토어 등록비는 피할 수 없음** (아래) |
| 게임 (웹·데스크톱) | itch.io, 웹 게임은 Cloudflare Pages | 배포·페이지 | Steam 은 등록비 |
| CI/CD | GitHub Actions | 공개 저장소 무료 / 비공개는 월 무료 분량 | 긴 E2E·자주 도는 예약 작업은 분량 확인 |
| 오류 알림 | Workers 로그 + Atelier checkup / Sentry 무료 등급 | | |
| 분석 | 서버 로그 이벤트 / PostHog·Umami 무료 등급 | | 분석 SDK 는 처리방침·쿠키 동의 확인 |
| 이메일 발송 | Resend 등 무료 등급 | | 발신 도메인 인증에 도메인 필요할 수 있음 |

추천하지 않는 무료: 상업 이용이 금지된 무료 등급(예: Vercel Hobby 는 비상업 조건 — 수익 서비스면 부적합), 일정 시간 뒤 잠드는데 디스크가 없는 등급(데이터 유실).

## 2. 피할 수 없는 비용 (미리 알린다)
| 항목 | 대략 비용 | 언제 | 대안 |
|---|---|---|---|
| Apple 개발자 프로그램 | 연 $99 | iOS 앱 스토어 출시 | 먼저 웹(PWA)으로 검증 |
| Google Play 개발자 계정 | 1회 $25 | Android 출시 | 먼저 웹으로 검증 |
| Steam 앱 등록 | 앱당 $100 | Steam 출시 | itch.io 로 먼저 |
| 자기 도메인 | 연 1~2만 원 | 원할 때 (필수 아님) | 무료 하위 주소 사용 |
| AI·지도·문자 등 외부 API | 사용량 과금 | 해당 기능을 넣을 때 | 무료 한도 + 사용자별 한도 + 캐시 |
| 결제 수수료 | 매출의 일부 | 돈을 받을 때 | 매출이 있을 때만 발생 |
| 사업자 관련 | 신고는 대부분 무료, 세무 대행은 선택 | 수익이 생길 때 | — |

## 3. 비용 안내 규칙 (모든 단계 공통)
1. **돈이 드는 선택은 실행 전에** 금액·발생 시점·무료 대안을 표로 보여 주고 사용자 결정을 받는다.
2. 사용자가 무료를 원하면 무료 스택을 기본으로 하고, 무료로 불가능한 부분만 "피할 수 없는 비용"으로 분리해 알린다.
3. 결정은 PROJECT.md "비용" 절과 `docs/costs.md` 에 기록한다: 지금 드는 비용, 무료 한도 대비 사용량 추정, 유료로 넘어가는 조건.
4. 무료 한도의 **70%** 에 닿을 것으로 보이면(기획 단계 추정 또는 운영 지표) 미리 알리고 대안(캐시·한도·최적화)을 먼저 제안한다.
5. 카드 등록이 필요한 서비스는 "카드 필요" 라고 표시한다. 카드 없이 되는 대안이 있으면 그것을 먼저 제안한다.

## 4. 무료 스택에서 코드가 달라지는 점 (Cloudflare Workers 기준)
- 파일 시스템이 없다: 문서·템플릿은 빌드 시 문자열로 묶거나 정적 자산으로.
- 인스턴스가 여러 개: 메모리 카운터·캐시는 공유되지 않는다 → 중요한 속도 제한은 DB/KV 로.
- DB 는 비동기(D1): 여러 문장을 함께 바꿀 때는 `batch()`(트랜잭션). 중간 결과에 따라 달라지는 로직은 조건부 SQL 로.
- 테스트: 단위·API 테스트는 D1 흉내(node:sqlite) 로 빠르게, E2E 는 `wrangler dev --local`(실제 런타임 workerd)로.
  - 테스트 서버 포트는 **고정하지 않는다**(8787 등 → 다른 서버·이전 실행과 충돌). `../templates/free-port.mjs` 를 `scripts/` 에 복사해 빈 포트를 받는다: 셸은 `PORT=$(node scripts/free-port.mjs)`, playwright.config.js 는 `await testPort(process.env.E2E_PORT)`(워커도 설정을 다시 읽으니 고른 번호를 환경변수로 넘김). 사용자가 포트를 지정했는데 쓰이는 중이면 `--check` 가 이유를 말하고 멈춘다. `--inspector-port` 도 같은 방법으로(기본 9229 충돌 방지). 예: `examples/beolgeum-jangbu/playwright.config.js`.
- 백업: D1 Time Travel(무료 등급 7일) + 필요하면 주기적 export 를 R2 로.
- 첫 배포: `npm run deploy:first` (`../templates/deploy-first.mjs`) — 로그인·D1 생성·ID 기록·원격 마이그레이션·배포·주소 출력을 한 번에. 사람 몫은 Cloudflare 가입(카드 없이)과 이 명령 한 줄.
- 롤백: `wrangler rollback`.
- 클라이언트 IP: `cf-connecting-ip` 헤더만 믿는다.

예시: `examples/beolgeum-jangbu` (Node + SQLite → Workers + D1 이전, 운영비 0원).
