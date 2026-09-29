# 운영 — 벌금장부

> Atelier `operate` 스킬로 작성.

## O1. 모니터링·알림
| 대상 | 방법 | 상태 |
|---|---|---|
| 업타임 | `ops-checks.yml` 매일 `/health` + Fly 헬스체크(30초) | ✅ 설정 / ⏳ 즉시 알림용 외부 업타임 서비스(UptimeRobot 등) 가입 |
| 에러 | 로그 `level:error` | ⏳ 에러 모니터링 서비스 가입 또는 Fly 로그 알림 |
| 백업 | `/health?backup=1` 을 `HEALTH_URLS` 에 포함 → 26시간 넘으면 실패 | ✅ |
| 비용 | Fly 결제 알림 | ⏳ |
| 비즈니스 | `scripts/admin.js stats` 주간 기록 (grow R1) | ✅ |

## O2. 런북
`docs/runbook.md`

## O3. 백업
- 서버가 시작 1분 후 + 24시간마다 `/data/backups/` 에 백업(무결성 검사, 14개 보관)
- ⚠️ **같은 볼륨** — 볼륨 손실 시 함께 사라짐. 오프사이트 복사(객체 저장소) ⏳ 계정 필요

## O4. 고객 지원
- 창구: atlier.skill@gmail.com — 처리방침 10항·약관 제8조·모든 화면 하단 "문의" 링크와 동일
- FAQ: 첫 화면 하단
- 신고: 모임 링크와 사유를 이메일로 → `admin.js delete` → 신고자 회신

## O5. 비용
월 목표 1만 원 이하. Fly 무료 한도 확인 후 결제 한도 설정 ⏳

## O6. 유지보수
- Dependabot (⏳ 저장소 설정), 월 1회 `npm outdated`
- Node 22 지원 종료 일정 확인 (checkup monthly)

## O7. 릴리스
- 버전: SemVer, `CHANGELOG.md`
- 배포: main 푸시 → CI → Fly 배포 → 스모크 테스트

## O8. 정기 점검 자동화 (`/atelier:checkup setup`)
| 무엇 | 언제 | 알림 |
|---|---|---|
| `/health`, `/health?backup=1`, TLS, 만료일, 의존성 | 매일 00:17 UTC (`.github/workflows/ops-checks.yml`) | `ops-alert` 이슈 → GitHub 모바일 |
| AI 주간 점검 | 사용 안 함 (API 비용, 초기엔 불필요) | — |
- 로컬 실행 확인: `weekly` 실패 0 · 경고 0
- ⏳ 저장소 Variables: `HEALTH_URLS="https://<도메인>/health https://<도메인>/health?backup=1"`, `TLS_HOSTS="<도메인>"`
