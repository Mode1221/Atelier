# plan.json 형식

```json
{
  "baseUrl": "http://127.0.0.1:3998",
  "ipHeader": "cf-connecting-ip",
  "personas": [
    { "id": "P1", "name": "민지 (24, 스터디장, 휴대폰)", "device": "mobile",
      "tasks": ["T1", "T2"],
      "words": { "T1": ["모임 만들기", "지각"], "T2": ["출석"] } },
    { "id": "P4", "name": "태윤 (PC, 다크 모드)", "device": "desktop", "dark": true }
  ],
  "tasks": [
    { "id": "T1", "goal": "모임을 만든다", "start": "/",
      "setup": [],
      "steps": [
        { "fill": { "label": "모임 이름", "value": "토익 스터디" } },
        { "click": { "role": "button", "name": "모임 만들기" } },
        { "see": "관리 링크를 꼭 저장하세요", "note": "저장 안내를 보는가" }
      ] }
  ]
}
```

| 키 | 뜻 |
|---|---|
| `baseUrl` | 테스트할 주소. 환경변수 `BASE_URL` 이 있으면 그걸 쓴다 — 실행 스크립트가 빈 포트로 띄운 로컬 서버 주소를 넘긴다(`npm run usertest`, 포트 고정 금지) |
| `ipHeader` | 서버가 IP 를 읽는 헤더. 실행마다 다른 가짜 IP → 속도 제한에 안 걸림 (로컬 전용) |
| `persona.device` | `mobile`(iPhone 13) / `desktop`(1280×800). `dark: true` 다크 모드 |
| `persona.tasks` | 이 페르소나가 할 과제 (없으면 전부) |
| `persona.words` | 과제별 기대 단어 — **화면을 보기 전에** 쓴다 |
| `task.setup` | 과제 전 상태 만들기 (결과·조작 수에 안 셈) |

## 단계 종류
| 단계 | 예 | 설명 |
|---|---|---|
| `goto` | `{"goto": "/"}` | 주소로 이동 |
| `click` | `{"click": {"role": "button", "name": "저장"}}` | `role`+`name` / `label` / `text` / `placeholder` 로 찾음. `exact: true` 가능 |
| `fill` | `{"fill": {"label": "금액", "value": "3000"}}` | 입력 |
| `check` | `{"check": {"label": "불편해요"}}` | 체크박스·라디오 |
| `select` | `{"select": {"label": "멤버", "option": "지영"}}` | 목록에서 고르기 |
| `see` / `notSee` | `{"see": "저장했어요"}` | 글자가 보이는지 / 안 보이는지 |
| `url` | `{"url": "/g/[\\w-]+"}` | 주소가 바뀌었는지 (정규식) |
| `openFrom` | `{"openFrom": {"label": "보기 링크"}}` | 화면의 링크 칸 값을 연다 (공유 링크 흐름) |

모든 단계에 `within`(예: `{"role": "radiogroup", "name": "민수 출결"}`)으로 범위를, `note` 로 관찰 포인트를 달 수 있다.
