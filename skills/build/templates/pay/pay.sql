-- 결제 (Atelier pay 템플릿). 프로젝트 migrations/ 에 다음 번호로 복사한다 (예: 0100_pay.sql).
-- 카드 번호는 저장하지 않는다 — 토스페이먼츠가 보관하고 우리는 paymentKey·billingKey 만 안다.
CREATE TABLE IF NOT EXISTS pay_orders (
  id TEXT PRIMARY KEY,               -- orderId (우리가 만든 무작위 값)
  product TEXT NOT NULL,             -- plans.js 의 상품 키
  amount INTEGER NOT NULL,           -- 서버가 정한 금액(원). 브라우저가 보낸 금액은 믿지 않는다
  customer TEXT NOT NULL,            -- 우리 서비스의 사용자 식별자(customerKey)
  status TEXT NOT NULL DEFAULT 'ready', -- ready → paid | failed | canceled | partial_canceled
  payment_key TEXT,
  method TEXT,
  canceled_amount INTEGER NOT NULL DEFAULT 0,
  receipt_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pay_orders_customer ON pay_orders(customer, status);

CREATE TABLE IF NOT EXISTS pay_subscriptions (
  customer TEXT NOT NULL,
  product TEXT NOT NULL,
  billing_key TEXT NOT NULL,
  status TEXT NOT NULL,              -- active | past_due | canceled(기간 끝까지 사용) | expired
  period_end TEXT NOT NULL,          -- 이 시각까지 사용 가능
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (customer, product)
);

CREATE TABLE IF NOT EXISTS pay_events (  -- 웹훅·처리 기록 (같은 알림 두 번 처리 방지 + 조회용)
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  order_id TEXT,
  detail TEXT,
  at TEXT NOT NULL
);
