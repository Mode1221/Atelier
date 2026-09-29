# 벌금장부

가입 없는 스터디 벌금 장부. 진행 상태는 `PROJECT.md`(Atelier), 명세는 `docs/spec.md`·`docs/architecture.md`.

## 스택 (무료 등급)
Cloudflare Workers + D1(SQLite) + 정적 자산 + 크론. Hono, 서버 렌더링 HTML + `public/static/app.js`. 빌드 없음.

## 명령
- 실행: `npm run dev` (로컬 D1 + workerd, http://localhost:8787)
- 검증: `./scripts/check.sh` (법률 번들 → lint → vitest → Playwright(workerd) → audit). 파일 추가 후에도 다시 실행
- 배포: main 푸시 → 루트 `.github/workflows/beolgeum.yml` (테스트 → D1 마이그레이션 → `wrangler deploy`)
- 관리: `node scripts/admin.mjs <find|delete|restore|purge|stats> [모임ID]`
- 법률 문서 수정 후: `npm run legal`

## 구조
- `src/worker.js` 진입점 / `src/app.js` 라우트·권한·한도 / `src/repo.js` **모든 DB 접근 (D1 API)** / `src/fines.js` 계산 / `src/views.js` HTML
- `src/d1-node.js` 테스트용 D1 흉내 (node:sqlite). 운영에서는 쓰지 않는다
- `migrations/NNNN_*.sql` 스키마 변경은 새 파일로만
- `public/` 정적 자산 — `static/tokens.css`·`static/app.css` 는 `design/` 과 같은 내용 유지

## 규칙
- 관리 키는 URL 조각(`#k=`)에만, 서버로는 `X-Admin-Key` 헤더. 로그에 키·멤버 이름·원본 IP 금지
- 여러 문장을 함께 바꿀 때는 `db.batch()` (D1 트랜잭션). 중간에 조건이 필요하면 조건부 SQL 로
- 생성·키 실패 한도는 D1(`rate_limits`), 쓰기 한도는 인스턴스 메모리(최선 노력)
- 무료 한도(요청·D1 읽기/쓰기)를 넘길 변경은 `docs/costs.md` 를 먼저 갱신
