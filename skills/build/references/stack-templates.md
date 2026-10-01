# 스택 템플릿

> **무료 우선이 기본이다.** 먼저 `free-tier.md` 의 무료 기본 스택을 본다. 아래 표는 무료 스택이 맞지 않을 때의 선택지이며, 유료 항목은 결정 전에 금액을 안내한다.

1인 개발 기준으로 **운영 부담이 적은 조합**을 우선했다. 사용자가 익숙한 스택이 있으면 그걸 우선한다.
버전·요금·무료 한도는 자주 바뀐다. 추천 전에 공식 사이트에서 최신 정보를 확인한다.

## 종류별 첫 실행 — 사람 몫은 "가입 + 명령 한 줄"
| 종류 | 템플릿 (`../templates/`) | 명령 | 사람 몫 |
|---|---|---|---|
| 웹 (로그인 없음, DB) | `deploy-first.mjs` | `npm run deploy:first` | Cloudflare 가입 |
| 웹 (로그인 있음) | `deploy-first.mjs` + `auth/` (Supabase) | `npm run deploy:first` (키 3개 붙여 넣기) | Cloudflare·Supabase 가입, 키 복사 (auth-accounts.md 첫 절) |
| 정적 웹·웹 게임 (Phaser 등) | `deploy-first.mjs` (DB 없으면 DB 단계 생략) | `npm run deploy:first` | Cloudflare 가입. itch.io 도 올리려면 itch 가입 후 zip 업로드(선택) |
| 모바일 앱 (Expo) | `app-first.mjs` | `npm run app:first` → 안드로이드 설치 파일(APK) | expo.dev 가입. 스토어 출시는 계정 비용(Play $25, Apple 연 $99) — 결정 후 |
| 브라우저 확장 프로그램 | `extension/` (MV3 예시·점검·zip) — `add.mjs extension` | `node scripts/ext.mjs check` → `pack` → 크롬 웹 스토어 업로드 | 크롬 웹 스토어 개발자 등록(1회 $5) |
| 챗봇 (카카오·디스코드·텔레그램) | `bot/` (서명·비밀 값 확인, 플랫폼별 응답) + 웹 스택 | `npm run deploy:first` → `node scripts/bot-setup.mjs <플랫폼> <주소>` | 플랫폼 봇 만들기(BotFather·디스코드 포털·카카오 오픈빌더) |
| 데스크톱 앱 | `desktop/` (Tauri 2 + GitHub Actions 3개 운영체제 빌드) | `git tag v0.1.0 && git push --tags` → Releases 초안 | GitHub 가입. 코드 서명은 선택(유료) — 없으면 설치 경고 |

## 기능 템플릿 — `node <atelier>/skills/build/templates/add.mjs <이름>` 으로 넣는다 (테스트로 검증됨)
| 기능 | 이름 | 무엇이 들어 있나 | 사람 몫 |
|---|---|---|---|
| 결제·구독 (국내 웹) | `pay` | 토스페이먼츠 단건·정기·웹훅·환불·자동 갱신·가격표 | 토스페이먼츠 가입(테스트 키 즉시) → 실판매는 사업자·가맹 |
| 앱 안 결제 | `iap` | RevenueCat 구매·복원·유료 판단 | 스토어 상품 등록·RevenueCat 가입 |
| 광고 | `ads` | 애드센스·애드핏, 결제 화면 제외, ads.txt | 광고 승인 신청 |
| AI 기능 | `ai` | Claude API, 사용자별 한도·하루 비용 상한·쉬운 오류·AI 표시 | Anthropic 콘솔 가입·결제 수단·API 키 |
| 파일 올리기 | `upload` | R2, 종류 확인(매직 바이트)·크기·총량·주인만 삭제 | (R2 처음이면 대시보드에서 사용 시작) |
| 실시간 (채팅·함께 편집·게임 방) | `realtime` | Durable Objects WebSocket 방, 끊기면 다시 붙는 클라이언트 | 없음 |
| 챗봇 | `bot` | 카카오·디스코드·텔레그램 | 봇 만들기 |
| 확장 프로그램 | `extension` | MV3 예시·점검·zip | 웹 스토어 등록 |
| 데스크톱 | `desktop` | Tauri 2 + CI 빌드 | GitHub |
| 운영자 화면 | `admin` | `/admin` 표 보기·검색·CSV(읽기 전용, 숨길 칸 지정, 열람 기록) | 없음 (ADMIN_TOKEN 자동) |
| 검색 | `search` | D1 FTS5 한국어 부분 일치·하이라이트(안전한 HTML)·종류별 | 없음 |
| 지도·장소 | `map` | 카카오 지도·장소 검색(서버 어댑터, 캐시) — 키 없으면 OpenStreetMap 지도 | 카카오 개발자 앱(REST·JS 키, 도메인 등록) |
| 알림 (메일·앱 푸시) | `notify` | Resend 메일(중복 방지·(광고) 표시·수신 거부)·Expo 푸시(앱 등록 코드·토큰 저장·무효 토큰 정리) | Resend 가입·보내는 도메인 인증 |

| 공통 운영 | `../../operate/templates/` `watchdog/` · `backup.mjs` | `npm run watch:setup` · `npm run backup` | 휴대폰 ntfy 앱, 백업 폴더 선택 |

## 웹 서비스 / SaaS
| 층 | 기본 추천 | 대안 |
|---|---|---|
| 프론트+서버 | Next.js (TypeScript) | SvelteKit, Remix, Nuxt |
| DB·인증·스토리지 | Cloudflare D1+R2 (무료) / Supabase 무료 (인증 필요 시) | Firebase Spark, Neon 무료, PocketBase |
| 결제 | Stripe (해외), 토스페이먼츠·포트원 (국내) | Lemon Squeezy, Paddle (세금 대행) |
| 배포 | Cloudflare Workers/Pages (무료) | Netlify (무료), Vercel (Hobby 는 비상업 조건), Fly.io (유료·카드) |
| 에러 | Sentry | — |
| 분석 | PostHog | Plausible, Umami, GA4 |
| 이메일 | Resend | Postmark |
| 테스트 | Vitest + Playwright | Jest |

## 모바일 앱
| 상황 | 추천 |
|---|---|
| 웹 개발 경험 있음 (JS/TS) | **Expo (React Native)** + EAS Build/Submit |
| 크로스플랫폼, UI 일관성 중시 | Flutter |
| iOS 만, 네이티브 기능 많음 | Swift + SwiftUI |
| Android 만 | Kotlin + Jetpack Compose |
| 백엔드 | Supabase / Firebase |
| 인앱 결제 | RevenueCat (스토어 결제 추상화) |
| 에러·분석 | Sentry, PostHog 또는 Firebase Crashlytics·Analytics |

## 게임
| 상황 | 추천 |
|---|---|
| 2D, 가볍게, 오픈소스 | **Godot** (GDScript) |
| 3D 또는 모바일 상용, 에셋 스토어 활용 | Unity (C#) — 라이선스·요금 정책 최신 확인 |
| 고사양 3D | Unreal |
| 브라우저 게임 | Phaser (TS), PixiJS |
| 게임잼·프로토타입 | Godot, PICO-8 |
| 배포 | itch.io (프로토타입), Steam (상용), 모바일 스토어 |

## 데스크톱 앱
- Tauri (가벼움, Rust 백엔드) / Electron (생태계 큼)

## CLI·개발자 도구
- TypeScript + npm 배포, 또는 Go / Rust 단일 바이너리

## 공통 기본 세트
- Git(버전 기록) — 처음부터. GitHub 은 선택(없으면 `scripts/backup.mjs` 로 동기화 폴더에 백업), Conventional Commits
- 린터·포매터: ESLint + Prettier (JS/TS), Ruff (Python), dart format, gdlint 등
- `.env.example` 에 키 이름만, 값은 비움
- `CLAUDE.md` 에 실행·테스트·배포 명령
- 테스트 서버 포트는 고정하지 않는다: `scripts/free-port.mjs` (`../templates/free-port.mjs` 복사)로 빈 포트를 받는다
- Cloudflare 스택이면 `scripts/deploy-first.mjs` + `npm run deploy:first` (`../templates/deploy-first.mjs` 복사) — 첫 배포를 명령 한 줄로
