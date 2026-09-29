---
name: checkup
description: 출시 후 정기 운영 점검. "/atelier:checkup setup" 으로 자동 점검(GitHub Actions 일일 검사 + 주간 AI 점검)을 프로젝트에 설치하고, "/atelier:checkup daily|weekly|monthly|quarterly" 로 해당 주기 점검을 실행해 보고서를 만든다. "점검 자동화", "정기 점검 돌려줘", "이번 주 운영 상태 어때?" 같은 요청에 사용.
---

# Checkup — 정기 점검

두 층으로 나눈다.
| 층 | 무엇 | 비용 | 실행 |
|---|---|---|---|
| **결정적 검사** | 헬스체크, TLS 만료, 만료일 목록, 의존성 취약점, 백업 신선도 | 0 | `scripts/ops-check.sh` — 매일 GitHub Actions |
| **AI 점검** | 한 주 요약, 추세 해석, 할 일 우선순위, 사람 할 일 알림 | API 사용료 | 이 스킬 — 매주 GitHub Actions 또는 수동 |

원칙: 점검은 **읽기만** 한다. 코드·설정·운영 환경을 바꾸지 않는다. 고칠 것은 보고서에 제안하고, 실제 수정은 기능 사이클(pilot)로 한다.

인자: `$ARGUMENTS` 의 첫 단어 = `setup` 또는 주기. `--ci` 가 있으면 CI 모드(사용자에게 묻지 않음, 결과를 이슈로).

---

## A. `setup` — 자동 점검 설치

1. 사용자에게 한 번에 하나씩 묻는다 (`docs/architecture.md`·`docs/operations.md` 에 있으면 제안값으로):
   - 헬스체크 URL (운영 `/health` 등), TLS 확인할 도메인
   - 백업 확인 방법. 백업이 서버 디스크에 있으면 CI 에서 직접 볼 수 없다 → 앱에 **`/health?backup=1`**(최근 백업이 26시간을 넘으면 503)을 만들고 그 URL 을 `HEALTH_URLS` 에 넣는 방식을 권한다. 객체 저장소에 있으면 `BACKUP_CHECK_CMD` 로 확인
   - 만료일 목록: 도메인, 개발자 계정(Apple 연간 등), API 키·토큰, 결제 수단, 인증서(수동 관리 시)
   - 알림을 휴대폰으로 받을 곳: GitHub 모바일 앱 알림(기본) / Slack·Discord 웹훅
   - 주간 AI 점검을 쓸지 (API 사용료 발생, 플러그인 저장소가 공개여야 CI 에서 설치 가능)
2. 이 스킬 폴더의 `templates/` 에서 프로젝트로 복사한다.
   - `templates/ops-check.sh` → `scripts/ops-check.sh` (실행 권한)
   - `templates/workflows/ops-checks.yml` → `.github/workflows/ops-checks.yml`
   - (AI 점검 선택 시) `templates/workflows/ai-checkup.yml` → `.github/workflows/ai-checkup.yml`
   - 스택에 맞게 `ops-checks.yml` 에 언어 설치 단계를 넣는다 (의존성 검사용).
3. `docs/ops/expiry.txt` 를 만든다 (`YYYY-MM-DD 설명` 한 줄씩, 모르면 비워 두고 사람 할 일로).
4. 로컬에서 `HEALTH_URLS=... TLS_HOSTS=... ./scripts/ops-check.sh weekly` 로 한 번 돌려 결과를 보여 준다.
5. **사람이 할 일**을 안내한다 (값은 채팅에 붙여 넣지 말라고 안내):
   - 저장소 Settings → Secrets and variables → Actions
     - Variables: `HEALTH_URLS`, `TLS_HOSTS`
     - Secrets: `BACKUP_CHECK_CMD`(선택), `ALERT_WEBHOOK_URL`(선택), `ANTHROPIC_API_KEY`(AI 점검 시)
   - GitHub 모바일 앱 설치·알림 켜기 (이슈 알림이 휴대폰으로 온다)
   - Actions 탭에서 `Ops checks` 를 수동 실행(Run workflow)해 한 번 확인
   - 공개 저장소는 60일간 활동이 없으면 예약 워크플로가 멈출 수 있다 — 알림 메일이 오면 다시 켠다
6. `docs/operations.md` 에 점검 구성(무엇을·언제·어디로 알림)을 기록하고, PROJECT.md 의 O8 을 체크한다.

### CI 가 없거나 GitHub Actions 를 안 쓸 때
- Claude Code 예약 작업(클라우드 Routines)이나 `/loop 1d /atelier:checkup daily` (세션이 켜져 있는 동안만) 로 대체한다.
- 서버가 있으면 크론으로 `scripts/ops-check.sh` 를 돌리고 실패 시 웹훅을 호출한다.

---

## B. 주기 점검 실행

`references/checks.md` 에서 해당 주기(하위 주기 포함)의 항목을 확인한다.

1. **결정적 검사**: `scripts/ops-check.sh <주기>` 실행 (없으면 setup 을 권하고, 가능한 항목만 직접 확인).
2. **최근 활동 수집** (지난 주기 기간):
   - `git log --since=...` — 배포·변경 내역
   - `gh issue list` — 새 버그 보고, 열린 `ops-alert`·`qa-failure` 류 이슈
   - `gh run list` — 실패한 워크플로(CI·배포·점검)
   - `gh pr list` — 열린 의존성 업데이트 PR
3. **문서 확인**: `PROJECT.md` 현재 단계·기능 사이클, `docs/growth.md` 최근 지표, `docs/incidents/` 최근 사후 분석의 재발 방지 조치가 끝났는지.
4. **판단**: 항목마다 OK / WARN / FAIL / TODO(사람). 추세가 나빠지는 것은 WARN 으로.
5. **보고서** 작성 (아래 형식).
   - 대화 모드: `docs/ops/reports/YYYY-MM-DD-<주기>.md` 로 저장하고 요약을 보여 준다.
   - `--ci` 모드: `gh label create ops-report` (없으면) 후 `gh issue create --label ops-report --title "<주기> 점검 YYYY-MM-DD"` 로 올린다. FAIL 이 있으면 제목 앞에 `[조치 필요]`.
6. FAIL·WARN 중 코드 수정이 필요한 것은 PROJECT.md "기능 사이클" 후보로 제안한다 (직접 고치지 않는다).

### 보고서 형식
```markdown
# <주기> 점검 — YYYY-MM-DD

## 요약
한두 문장. 가장 중요한 조치 1개.

## 결과
| 상태 | 항목 | 내용 | 조치 |
|---|---|---|---|

## 지난 기간 활동
- 배포 N회, 주요 변경
- 새 버그 N건 (링크), 실패 워크플로 N건

## 사람이 할 일
- [ ] ...

## 다음 기능 사이클 후보
- ...
```
