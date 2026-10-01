-- AI 기능 사용량 (Atelier ai 템플릿) — 사용자별 하루 횟수, 하루 전체 비용 상한을 지키는 데 쓴다. 내용(질문·답)은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT NOT NULL,          -- KST 날짜
  customer TEXT NOT NULL,     -- '*' 는 하루 전체 합계
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, customer)
);
