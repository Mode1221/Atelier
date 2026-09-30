-- 되돌리기·변경 기록·자동 새로고침
-- trips.updated_at: 무엇이든 바뀌면 갱신 → 화면이 몇 초마다 이 값만 보고 새로고침할지 정한다
ALTER TABLE trips ADD COLUMN updated_at TEXT;
-- 지운 준비물·지출은 바로 없애지 않고 표시만 (7일 동안 되살리기 가능, 이후 크론이 정리)
ALTER TABLE items ADD COLUMN deleted_at TEXT;
ALTER TABLE expenses ADD COLUMN deleted_at TEXT;
-- 누가 무엇을 했는지 (목록 안에서만 보임, 목록과 함께 삭제)
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  who TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  ref_kind TEXT CHECK (ref_kind IN ('item','expense')),
  ref_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_trip ON activity(trip_id, id);
