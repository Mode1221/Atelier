# 챙김표

캠핑·여행·MT 준비물, **누가 뭘 챙길지 링크 하나로** 나누고 장본 돈까지 n빵하는 가입 없는 웹 서비스.
Atelier 플러그인(`atelier-dev`)을 **자동 모드**로 아이디어부터 적용한 두 번째 예시 — 진행 상태는 `PROJECT.md`.

- 실행: `npm ci && npm run dev`
- 검증: `npm run check` (법률 번들 → lint → vitest → Playwright(workerd) → audit), 사용성: `npm run usertest`
- 첫 배포: Cloudflare 가입(무료) 후 `npm run deploy:first`
- 문서: `docs/idea.md` → `spec.md`·`architecture.md` → `design.md` → `build.md` → `guard.md` → `launch.md`·`operations.md` → `growth.md`
