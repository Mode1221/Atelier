CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  admin_key_hash TEXT NOT NULL,
  fine_late INTEGER NOT NULL,
  fine_absent INTEGER NOT NULL,
  fine_homework INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hidden_at TEXT
);
CREATE INDEX idx_members_group ON members(group_id);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  fine_late INTEGER NOT NULL,
  fine_absent INTEGER NOT NULL,
  fine_homework INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_group_date ON sessions(group_id, date);
CREATE TABLE attendance (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent')),
  homework_missed INTEGER NOT NULL DEFAULT 0 CHECK (homework_missed IN (0,1)),
  PRIMARY KEY (session_id, member_id)
);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_at TEXT NOT NULL
);
CREATE INDEX idx_payments_member ON payments(member_id);
