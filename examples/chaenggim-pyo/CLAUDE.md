# 챙김표

가입 없는 캠핑·여행 준비물 분담 + 장본 돈 정산. 진행 상태는 `PROJECT.md`(Atelier), 명세는 `docs/spec.md`·`docs/architecture.md`.

## 스택 (무료 등급)
Cloudflare Workers + D1(SQLite) + 정적 자산 + 크론. Hono, 서버 렌더링 HTML + `public/static/app.js`. 빌드 없음.

## 명령
- 실행: `npm run dev` / 검증: `./scripts/check.sh` (파일 추가 후에도 다시) / 사용성: `npm run usertest`
- 첫 배포: `npm run deploy:first` / 이후: main 푸시 → 루트 `.github/workflows/chaenggim.yml`
- 법률 문서 수정 후: `npm run legal`

## 구조
- `src/app.js` 라우트·권한·한도 / `src/repo.js` **모든 DB 접근** / `src/settle.js` 정산 계산 / `src/templates.js` 시작 준비물 / `src/views.js` HTML
- `migrations/NNNN_*.sql` 스키마 변경은 새 파일로만

## 규칙
- 목록 링크 = 참여 권한, 관리 키는 URL 조각(`#k=`)에만, 서버로는 `X-Admin-Key`. 로그에 키·이름·원본 IP 금지
- 맡기처럼 경쟁이 있는 변경은 조건부 UPDATE, 여러 문장은 `db.batch()`
- 돈은 계산만 (보관·송금 연동 금지 — ADR-003)
- 무료 한도(요청·D1 읽기/쓰기)를 넘길 변경은 `docs/costs.md` 를 먼저 갱신
