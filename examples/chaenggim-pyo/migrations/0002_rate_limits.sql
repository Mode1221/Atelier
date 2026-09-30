-- 속도 제한 카운터 (Workers 는 인스턴스가 여러 개라 메모리 카운터를 공유할 수 없다)
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
