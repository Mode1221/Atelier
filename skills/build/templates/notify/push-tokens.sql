-- 앱 푸시 토큰 (Atelier notify 템플릿) — 기기마다 하나, 무효 토큰은 보낼 때 자동 삭제
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  platform TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS push_tokens_customer ON push_tokens (customer);
