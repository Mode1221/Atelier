# 운영 — 챙김표

| 단계 | 내용 |
|---|---|
| O1 모니터링 | 매시간 운영 점검(`chaenggim-ops.yml`, 실패 시 `ops-alert-chaenggim` 이슈 → GitHub 알림 메일), 서비스 지킴이(저장소 Secrets `CHAENGGIM_NTFY_TOPIC` 이 있으면 배포 때 자동 설치 → 5분마다 확인, 10분 응답 없으면 휴대폰 ntfy 알림), 지표 화면 `/stats` |
| O2 런북 | 아래 |
| O3 백업 | D1 Time Travel(자동 7일) + `npm run backup`(코드 번들 + DB 내보내기, 14개 보관) |
| O4 고객 지원 | `/feedback` → `npm run feedback:pull` → `company/chaenggim/feedback/`, 문의 atlier.skill@gmail.com |
| O5 비용 | `docs/costs.md` 월 1회 |
| O6 유지보수 | Dependabot(저장소 설정), `npm audit` CI |
| O7 릴리스 | CHANGELOG, main 푸시 = 배포, 롤백 `npx wrangler rollback` |
| O8 정기 점검 | `/atelier-dev:checkup setup` |

## 런북
- **사이트가 안 열림**: Cloudflare 상태 페이지 → `npx wrangler deployments list` → 직전 배포면 `npx wrangler rollback`.
- **DB 오류(/health 503)**: `npx wrangler d1 info chaenggim-pyo`, 필요하면 Time Travel 복구 `npx wrangler d1 time-travel restore chaenggim-pyo --timestamp=<시각>`.
- **악성 목록 신고**: `npx wrangler d1 execute chaenggim-pyo --remote --command "UPDATE trips SET deleted_at = datetime('now') WHERE id = '<ID>'"`.
- **무료 한도 초과**: 요청 제한 확인 → `docs/costs.md` 조건에 따라 대표 결정.
