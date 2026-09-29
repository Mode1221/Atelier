# 벌금장부

가입 없는 스터디 벌금 장부. 진행 상태는 `PROJECT.md`(Atelier), 명세는 `docs/spec.md`·`docs/architecture.md`.

## 스택
Node 22 (`node:sqlite`) + Hono, 서버 렌더링 HTML + `public/app.js`. 빌드 없음.

## 명령
- 실행: `npm run dev` (http://localhost:3000)
- 검증: `./scripts/check.sh` (lint → vitest → playwright → audit). 파일 추가 후에도 다시 실행
- 관리: `node scripts/admin.js <find|delete|restore|purge|stats>` / 백업: `node scripts/backup.js [--check]`
- 성능: `node scripts/bench.js <url>`

## 구조
- `src/app.js` 라우트·권한·한도 / `src/repo.js` **모든 DB 접근** / `src/fines.js` 계산(순수) / `src/validate.js` / `src/security.js` / `src/views.js` HTML
- `migrations/*.sql` 스키마 변경은 새 파일로만 (기존 파일 수정 금지)
- `public/` 정적 파일 — `tokens.css`·`app.css` 는 `design/` 과 같은 내용 유지

## 규칙
- 관리 키는 URL 조각(`#k=`)에만, 서버로는 `X-Admin-Key` 헤더. 로그·이벤트에 키·멤버 이름·원본 IP 금지
- 모든 쓰기 API 는 `admin` 미들웨어 경유, 다른 모임 리소스 접근은 404
- 사용자 입력은 `esc()` 로 렌더링. 인라인 스크립트 금지 (CSP)
- 금액은 원 단위 정수, 회차는 생성 당시 규칙 스냅숏
- 커밋: Conventional Commits
