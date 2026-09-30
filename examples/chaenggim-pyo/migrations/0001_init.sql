-- 여행·캠핑 한 번 = trip. 링크(id)를 가진 사람은 누구나 참여·편집, 관리 키는 삭제·사람 내보내기만.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on TEXT,
  admin_key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hidden_at TEXT
);
CREATE INDEX idx_people_trip ON people(trip_id);
-- kind: shared = 공용(한 사람이 맡음), personal = 각자 챙길 것(목록만)
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 99),
  kind TEXT NOT NULL CHECK (kind IN ('shared','personal')),
  claimed_by INTEGER REFERENCES people(id) ON DELETE SET NULL,
  packed INTEGER NOT NULL DEFAULT 0 CHECK (packed IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_items_trip ON items(trip_id);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  paid_by INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_expenses_trip ON expenses(trip_id);
-- 이 지출을 나눠 낼 사람 (지출을 기록할 때 고른다)
CREATE TABLE expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, person_id)
);
