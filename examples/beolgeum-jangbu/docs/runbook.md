# 장애 대응 런북 — 벌금장부

> Atelier `operate` O2. 호스팅: Fly.io (가정). 명령은 호스팅 확정 후 검증 ⏳

## 0. 접근
- Cloudflare 대시보드 → Workers & Pages → beolgeum-jangbu (2단계 인증 복구 코드: 비밀번호 관리자)
- 로그: 대시보드 Observability 또는 `npx wrangler tail`

## 1. 판단 (5분)
- `curl -s https://<주소>/health` → `db` 가 `error` 면 D1 문제
- `npx wrangler tail --format pretty | grep '"level":"error"'` — 요청 ID(`cf-ray`)로 추적
- `npx wrangler deployments list` — 직전 배포 시각

## 2. 완화
| 상황 | 조치 |
|---|---|
| 배포 직후 문제 | `npx wrangler rollback` (직전 버전으로 즉시) |
| 악성 모임 신고 | `node scripts/admin.mjs delete <모임ID>` |
| 데이터 손상 | D1 Time Travel 로 시점 복구 (아래) |
| 무료 한도 초과 임박 | `docs/costs.md` 대안 적용, 대표 결재 후 유료 전환 |

## 3. 데이터 복구 (D1 Time Travel, 무료 등급 7일)
```
npx wrangler d1 time-travel info beolgeum-jangbu                      # 복구 가능한 시점 확인
npx wrangler d1 time-travel restore beolgeum-jangbu --timestamp=<UNIX 초 또는 RFC3339>
curl -s https://<주소>/health
```
복구도 되돌릴 수 있다(복구 결과에 표시되는 이전 bookmark 로 다시 restore).

## 4. 공지
장애 시 오픈 카톡·SNS 공지. (Should: 점검 배너 기능)

## 5. 사후 분석
`docs/incidents/YYYY-MM-DD-<요약>.md` — operate `incident-runbook.md` 5절 형식.
