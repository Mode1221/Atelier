-- 방문 집계 (운영 대시보드용). 개인을 추적하지 않는다:
-- 방문자 id 는 날마다 바뀌는 해시(IP·브라우저 + 날짜)라 다른 날과 이어 붙일 수 없고, 30일 뒤 지운다.
CREATE TABLE visits (
  date TEXT NOT NULL,
  vid TEXT NOT NULL,
  PRIMARY KEY (date, vid)
);
-- 날짜별 카운터 (페이지 열람 수, 유입 출처별 방문)
CREATE TABLE daily_counts (
  date TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, key)
);
