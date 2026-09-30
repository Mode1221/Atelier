# 구현 — 챙김표

> 운영 준비 체크리스트: Atelier `build/references/production-readiness.md` 필수 항목.

| 항목 | 상태 |
|---|---|
| B1 기반 | 저장소 `examples/chaenggim-pyo`, CI `.github/workflows/chaenggim.yml`(lint·unit·E2E·usertest·audit), 비밀값은 `.dev.vars.example`(FEEDBACK_TOKEN=auto) |
| B2 데이터 | D1 마이그레이션 3개, 여러 문장은 `db.batch` |
| B3 인증 | 계정 없음 — 링크 권한 + 관리 키(해시). 탈퇴 대신 목록 삭제·사람 내보내기 |
| B4 핵심 기능 | F1~F7 |
| B5 결제 | N/A (무료) |
| B6 알림 | N/A (계정·연락처 없음) |
| B7 관리자 도구 | 관리 링크, `wrangler d1 execute` 절차(operations.md) |
| B8 오류 처리 | 필드 오류·409 충돌 안내·네트워크 실패 안내(상태 유지)·500 은 내부 정보 없이 요청 ID |
| B9 계측 | 구조화 로그 + observability, `/health`, `/api/stats`(토큰) |
| B10 테스트 | 단위·API 42개(정산 무작위 200회 포함), E2E 8개(workerd, 두 브라우저 동시 흐름, axe 라이트·다크), usertest |
| B11 성능·SEO | 빌드 없음, 정적 자산 캐시, 목록 화면 `noindex`, OG 이미지, `robots.txt` |
| B12 배포 | `npm run deploy:first`(처음 한 번, 사람 PC) 또는 main push → 워크플로(테스트 → D1 마이그레이션 → 배포 → 스모크). 롤백 `npx wrangler rollback` |
| B13 운영 준비 | 위 항목 통과, 로컬 usertest 치명·높음 0 |
