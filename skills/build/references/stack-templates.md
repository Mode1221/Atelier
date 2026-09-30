# 스택 템플릿

> **무료 우선이 기본이다.** 먼저 `free-tier.md` 의 무료 기본 스택을 본다. 아래 표는 무료 스택이 맞지 않을 때의 선택지이며, 유료 항목은 결정 전에 금액을 안내한다.

1인 개발 기준으로 **운영 부담이 적은 조합**을 우선했다. 사용자가 익숙한 스택이 있으면 그걸 우선한다.
버전·요금·무료 한도는 자주 바뀐다. 추천 전에 공식 사이트에서 최신 정보를 확인한다.

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
- Git + GitHub, Conventional Commits
- 린터·포매터: ESLint + Prettier (JS/TS), Ruff (Python), dart format, gdlint 등
- `.env.example` 에 키 이름만, 값은 비움
- `CLAUDE.md` 에 실행·테스트·배포 명령
- 테스트 서버 포트는 고정하지 않는다: `scripts/free-port.mjs` (`../templates/free-port.mjs` 복사)로 빈 포트를 받는다
- Cloudflare 스택이면 `scripts/deploy-first.mjs` + `npm run deploy:first` (`../templates/deploy-first.mjs` 복사) — 첫 배포를 명령 한 줄로
