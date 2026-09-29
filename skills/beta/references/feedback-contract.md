# 의견 보내기 — 서비스 쪽 계약

수집 워크플로(`templates/feedback-sync.mjs`)가 기대하는 모양. 스택이 달라도 이 계약만 맞추면 된다.

## 저장 (예: SQL)
```sql
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('good','hard','bug','idea')),
  message TEXT NOT NULL,        -- 가린 뒤 저장
  page TEXT NOT NULL,           -- 경로 패턴 (/g/:id), 실제 ID 금지
  created_at TEXT NOT NULL,
  synced_at TEXT                -- 이슈로 옮긴 시각
);
```

## API
| 요청 | 인증 | 응답 |
|---|---|---|
| `POST /api/feedback` `{kind, message, page, website}` | 없음 (속도 제한) | 204. `website`(숨은 칸)가 차 있으면 저장 안 하고 204 |
| `GET /api/feedback` | `Authorization: Bearer FEEDBACK_TOKEN` | `{items:[{id,kind,message,page,created_at}]}` 안 옮긴 것, id 순, 최대 100 |
| `POST /api/feedback/ack` `{upTo}` | 같음 | `{acked:n}` — id ≤ upTo 를 옮긴 것으로 표시 |

토큰이 설정되지 않으면 수집 API 는 401 (꺼짐).

## 검증
- kind: 4개 중 하나. message: 0~1000자, `good` 외에는 필수.
- 가림 순서: 비공개 링크(`https://…/g/<id>…`) → 이메일 → 전화번호(010-…, +82…).
- page: 알려진 경로만 패턴으로, 나머지는 "기타".

## 참고 구현
`examples/beolgeum-jangbu` — `src/validate.js`(검증·가림), `src/app.js`(라우트), `migrations/0003_feedback.sql`, `test/feedback-sync.test.js`(서비스 + 수집기 통합 테스트).
