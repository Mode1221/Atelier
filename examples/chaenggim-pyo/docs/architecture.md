# 아키텍처 — 챙김표

```
브라우저 (서버 렌더 HTML + public/static/app.js)
   │  GET /, /t/:id  (HTML)          POST/PATCH/DELETE /api/trips/:id/...  (JSON)
   ▼
Cloudflare Workers (src/worker.js → src/app.js, Hono)
   │  권한(member: 목록 존재 + 쓰기 한도 / admin: X-Admin-Key) · 검증(validate.js) · 로그
   ▼
src/repo.js  ── 모든 DB 접근 (D1 API, 여러 문장은 db.batch = 트랜잭션)
   ▼
Cloudflare D1 (SQLite)  ·  크론(매일 03:23 KST): 삭제·방치 목록 정리
```

| 파일 | 역할 |
|---|---|
| `src/app.js` | 라우트·권한·한도·보안 헤더·오류 처리·크론 |
| `src/repo.js` | DB 접근 전부. 맡기 경쟁은 조건부 UPDATE |
| `src/settle.js` | 정산 계산(순수 함수): 나누기·차액·최소 송금 |
| `src/templates.js` | 시작 준비물 5종 |
| `src/validate.js` | 입력 검증, 의견 개인정보 가림 |
| `src/views.js` | HTML (esc 필수, 데이터는 `<script type="application/json">`) |
| `public/static/app.js` | "나는 누구"(localStorage), 버튼 붙이기, API 호출 후 새로고침 |
| `src/d1-node.js` | 테스트용 D1 흉내 (node:sqlite) |

## 결정
- ADR-001 가입 없음 + 링크 권한: 친구 모임에서 설치·가입이 가장 큰 장벽. 대신 신원 확인 없음(S2).
- ADR-002 실시간 동기화 없음: WebSocket(Durable Objects)은 무료 등급 밖 → 조작 뒤 새로고침 + 맡기 충돌 409 로 정확성 보장.
- ADR-003 돈은 계산만: 송금·보관은 규제·책임. 송금 안내 문구만.
- ADR-004 Cloudflare Workers + D1: 운영비 0원 (벌금장부와 같은 무료 스택).
