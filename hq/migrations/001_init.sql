CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE secrets (
  service TEXT PRIMARY KEY,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE owner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dept TEXT NOT NULL,
  status TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  url TEXT,
  at TEXT NOT NULL
);
CREATE INDEX idx_runs_dept_at ON runs(dept, at);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
