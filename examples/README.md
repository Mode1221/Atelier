# 예시 프로젝트

## beolgeum-jangbu (벌금장부)
"아이디어부터 전부 알아서" 요청으로 Atelier 를 **자동 모드**로 처음부터 적용한 결과물. 가입 없는 스터디 벌금 장부 웹 서비스.

- 진행 상태: `PROJECT.md` — 1~5단계 코드·문서 완료, 게이트는 **보류(사람 대기)**, 출시 Go/No-Go 는 No-Go (계정·운영자 정보 필요)
- 단계별 산출물: `docs/idea.md` → `spec.md`·`architecture.md` → `design.md` → `build.md` → `guard.md` → `launch.md`·`operations.md`·`runbook.md` → `growth.md`
- 플러그인 테스트 기록: `docs/atelier-test-notes.md` (발견 24건 → v0.3.0 반영)
- 운영: **Cloudflare Workers + D1 무료 등급 (운영비 0원)** — 처음엔 Node + SQLite 로 만들고 무료 원칙에 맞춰 이전 (ADR-004, `docs/costs.md`)
- 검증: `npm ci && ./scripts/check.sh` — 단위·API 35개, E2E 7개(실제 Cloudflare 런타임 workerd, axe 접근성 포함), 의존성 감사
- 배포: 루트 `.github/workflows/beolgeum.yml` (시크릿 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`)

예시 폴더 안의 `.github/workflows/` 는 이 저장소에서 실행되지 않는다 (프로젝트를 별도 저장소로 옮기면 동작).
