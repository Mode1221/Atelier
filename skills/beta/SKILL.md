---
name: beta
description: 공개 베타 운영. 링크를 열어 두고 실제 사용자 피드백을 받는 틀을 설치한다 — 베타 표시, 서비스 안 "의견 보내기"(익명·개인정보 자동 가림), 의견을 프로젝트 폴더(AI 회사 로컬 모드) 또는 GitHub 이슈로 모으기, 유입 경로 측정, 주간 분류, 졸업 기준. "베타 열자", "피드백 받고 싶어", "유저 반응 모으기", launch L2 에서 사용.
---

# Beta — 공개 베타

목표: 초대·모집 없이 **링크만 열어 두면** 실제 사용자 반응이 매일 저장소에 쌓이고, 고객지원 부서(또는 사람)가 분류해 다음 할 일로 바꾸게 한다. 운영비 0원.

## 흐름
```
사용자 → 서비스 "의견 보내기" → 서비스 DB(feedback) ─(고객지원 실행 때, feedback:pull)→ company/<서비스>/feedback/<날짜>.json  (로컬 모드, 기본)
                                                   └(매일, Actions)→ GitHub 이슈 `feedback` 1건/일  (GitHub 방식)
                                                              → 고객지원 부서 분류 → dept:qa / dept:plan 이슈
사용자 유입 ?ref= / utm_source → 서비스 로그 `landing`  → grow 지표
```

## 세부 단계
### B1. 베타 표시와 기대치
모든 화면에 작은 "베타" 표시 + "의견 보내기" 링크(푸터). 데이터가 지워질 수 있는 베타면 첫 화면에 그렇게 적는다.

### B2. 의견 보내기 (서비스 안) — `references/feedback-contract.md`
- 화면: 종류 4개(좋아요 / 불편해요 / 오류 / 제안) + 내용 1000자 + 보낸 화면(경로 **패턴**만, 예 `/g/:id`).
- 개인정보: 가입·연락처를 받지 않는다. 이메일·전화번호·비공개 링크처럼 보이는 값은 **저장 전에 가린다**. "공개 게시판에 익명으로 옮겨질 수 있음"을 폼에 적는다(저장소가 공개일 때).
- 스팸: 숨은 칸(honeypot) + IP 해시 기준 시간당 10건.
- 보관 1년, 개인정보처리방침에 항목·목적·기간 추가 (guard).
- 수집 API 2개(토큰 필요): 안 옮긴 피드백 목록, 옮긴 것 표시(ack).

### B3. 의견 모으기 (자동)
**AI 회사 로컬 모드(기본, GitHub 없음)**: `templates/feedback-pull.mjs` → 프로젝트 `scripts/feedback-pull.mjs`, package.json `"feedback:pull": "node scripts/feedback-pull.mjs"`.
- 서비스에 쌓인 의견을 `company/<서비스>/feedback/<날짜>.json`(cloud-run.md 1절 형식, status new)에 모으고 옮긴 것까지 표시(ack). 고객지원 부서가 실행할 때마다 먼저 돌린다.
- 열쇠(FEEDBACK_TOKEN)는 사람이 만들지 않는다: `.dev.vars.example` 에 `FEEDBACK_TOKEN=auto` 를 두면 `npm run deploy:first` 가 무작위로 만들어 서비스 비밀값과 `.atelier/secrets.json`(커밋 안 됨) 양쪽에 넣는다.

**GitHub 방식(고급)**: 매일 이슈로 옮기기 —
`templates/feedback-sync.mjs` + 워크플로(예: `.github/workflows/beolgeum-feedback.yml`).
- 하루치를 **이슈 1건**(표)으로 — 이슈 폭주 방지. 라벨 `feedback`, `dept:support`.
- 저장소 하나에 서비스가 여럿이면 `SERVICE_NAME`(이슈 제목 앞 `[이름]`)과 `FEEDBACK_LABELS`(예: `feedback,dept:support,svc:<id>`)로 구분 — 예: `.github/workflows/chaenggim-feedback.yml`.
- 이슈 본문은 이스케이프(멘션·HTML·표 깨짐 방지). 이슈가 만들어진 뒤에만 ack → 실패해도 다음 날 다시 옮김.
- 토큰은 사람이 만들 필요 없게 배포 비밀값에서 한 방향 해시로 파생해 배포·수집 양쪽이 같은 값을 쓴다 (예: `sha256("atelier-feedback:" + CLOUDFLARE_API_TOKEN)`).

### B4. 공유 고리 (atelier-dev:share 와 함께)
- 서비스 안 공유 버튼(Web Share API, 안 되면 복사), 공유 링크에 `?ref=share`.
- 공유받은 사람이 보는 화면에 "나도 만들기" 안내(`?ref=view`) — 사용자가 사용자를 데려오는 고리.
- 첫 화면 `?ref=`·`utm_source` 를 `landing` 이벤트로 기록.

### B4-1. 베타 리워드 (하면)
- 의견·후기에 보상(커피 쿠폰·평생 무료 등)을 걸면 **조건과 대가를 공개**한다: 홍보 글에 `reward` 칸(share), 의견 보내기 화면에 "의견을 보내면 ○○를 드려요(조건)" 한 줄.
- 보상을 받고 쓴 후기를 홍보에 쓰면 그 사실을 같이 표시한다. 좋은 후기에만 보상을 주지 않는다(내용과 상관없이 참여에 보상).
- 받은 의견·후기를 숫자로 홍보할 때는 실제 건수만(지어내거나 부풀리지 않음).

### B5. 주간 분류 (고객지원 부서 / 사람)
`docs/beta.md` 표에 합산: 출처 · 원문 요약 · 분류(버그/사용성/기능 요청/칭찬/이탈 이유) · 빈도 · 심각도 · 조치. 같은 불편이 3건 이상이면 dept:plan 이슈.
고친 것은 CHANGELOG 와 서비스 안 "최근 바뀐 점"(선택)에 — 의견 준 사람이 반영을 보게.

### B6. 졸업 기준 (공개 출시 L5 로)
기본값(프로젝트에 맞게 조정): 2주 이상 · 주간 활성 단위(모임·사용자) 10 이상 · 치명 버그 0 · 피드백 20건 이상 분류 · 활성화율 40% 이상. 30명 이상이면 PMF 설문(`launch/references/user-testing.md` 3절).

## 사람 할 일
없음이 목표. 링크를 퍼뜨리는 게시는 `atelier-dev:share` 킷에서 버튼만 누른다.

## 산출물
서비스: 베타 표시, 의견 보내기, 수집 API, 공유 버튼, 유입 기록 / 저장소: 수집 워크플로, `docs/beta.md`(운영 표·졸업 기준)
