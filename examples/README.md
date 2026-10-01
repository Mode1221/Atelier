# 예시 프로젝트

## beolgeum-jangbu (벌금장부)
"아이디어부터 전부 알아서" 요청으로 Atelier 를 **자동 모드**로 처음부터 적용한 결과물. 가입 없는 스터디 벌금 장부 웹 서비스.

- 진행 상태: `PROJECT.md` — 1~5단계 코드·문서 완료, 게이트는 **보류(사람 대기)**, 출시 Go/No-Go 는 No-Go (계정·운영자 정보 필요)
- 단계별 산출물: `docs/idea.md` → `spec.md`·`architecture.md` → `design.md` → `build.md` → `guard.md` → `launch.md`·`operations.md`·`runbook.md` → `growth.md`
- 플러그인 테스트 기록: `docs/atelier-test-notes.md` (발견 24건 → v0.3.0 반영)
- 운영: **Cloudflare Workers + D1 무료 등급 (운영비 0원)** — 처음엔 Node + SQLite 로 만들고 무료 원칙에 맞춰 이전 (ADR-004, `docs/costs.md`)
- 검증: `npm ci && npm run check` — 단위·API 35개, E2E 7개(실제 Cloudflare 런타임 workerd, axe 접근성 포함), 의존성 감사
- 배포: 루트 `.github/workflows/beolgeum.yml` (시크릿 `CLOUDFLARE_API_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`)

## chaenggim-pyo (챙김표)
두 번째 자동 모드 예시. 대표는 **아이디어 후보 3개 중 하나만 고르고**(캠핑·여행 준비물 분담), 인터뷰 답·기획·디자인·구현·검증·출시 준비는 AI 가 진행. 가입 없는 준비물 분담 + 장본 돈 n빵 웹 서비스.

- 진행 상태: `PROJECT.md` — 1~5단계 완료, L1 AI 대리 사용성 테스트 통과(치명 1·높음 2 수정), L2 공개 베타 준비
- 검증: `npm ci && npm run check` — 단위·API 42개(정산 무작위 검사 포함), E2E 8개(두 브라우저 동시 맡기·axe 라이트/다크), `npm run usertest`
- 배포: 루트 `.github/workflows/chaenggim.yml` (Cloudflare 무료 등급)

예시 폴더 안의 `.github/workflows/` 는 이 저장소에서 실행되지 않는다 (프로젝트를 별도 저장소로 옮기면 동작).
