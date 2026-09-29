# 장애 대응 런북 — 벌금장부

> Atelier `operate` O2. 호스팅: Fly.io (가정). 명령은 호스팅 확정 후 검증 ⏳

## 0. 접근
- Fly 대시보드·`flyctl` 로그인 (2단계 인증 복구 코드: 비밀번호 관리자)
- 앱: `beolgeum-jangbu`, 볼륨: `data` (`/data/app.db`, `/data/backups/`)

## 1. 판단 (5분)
- `curl -s https://<도메인>/health` → `db` 가 `error` 면 DB 문제
- `fly logs -a beolgeum-jangbu | grep '"level":"error"'` — 요청 ID 로 추적
- `fly releases -a beolgeum-jangbu` — 직전 배포 시각 확인

## 2. 완화
| 상황 | 조치 |
|---|---|
| 배포 직후 문제 | `fly releases` 에서 이전 이미지 확인 → `fly deploy --image <이전 이미지>` (로컬 Docker 로 실습 완료) |
| 과부하 | `fly scale vm shared-cpu-2x` / 쓰기 한도는 `src/app.js` limits |
| 악성 모임 신고 | `fly ssh console -C "node scripts/admin.js delete <모임ID>"` |
| DB 손상 | 쓰기 중지: `fly scale count 0` → 백업 복구(아래) → `fly scale count 1` |
| 디스크 가득 | `fly ssh console -C "du -sh /data/*"` → 오래된 백업 삭제, `fly volumes extend` |

## 3. 백업 복구
```
fly ssh console
ls -t /data/backups | head -3
cp /data/app.db /data/app.db.broken
cp /data/backups/app-YYYYMMDD-HHMM.db /data/app.db
rm -f /data/app.db-wal /data/app.db-shm
exit
fly machine restart
curl -s https://<도메인>/health
```
로컬 실습: 컨테이너 볼륨에서 백업 생성 확인 완료. 전체 복구 실습은 분기 1회 (checkup quarterly).

## 4. 공지
처음 화면 상단 공지는 아직 없음 → 장애 시 오픈 카톡·SNS 공지. (Should: 점검 배너 기능)

## 5. 사후 분석
`docs/incidents/YYYY-MM-DD-<요약>.md` — operate `incident-runbook.md` 5절 형식.
