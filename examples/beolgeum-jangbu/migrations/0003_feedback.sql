-- 베타 피드백 (익명). 연락처처럼 보이는 값은 저장 전에 가린다. 1년 뒤 삭제.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('good','hard','bug','idea')),
  message TEXT NOT NULL,
  page TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT
);
CREATE INDEX idx_feedback_unsynced ON feedback(synced_at, id);
