// 결제 기록 저장 (D1). SQL 은 pay.sql 과 짝이다.
export function createPayStore(db) {
  const now = () => new Date().toISOString();
  return {
    async createOrder({ id, product, amount, customer }) {
      const t = now();
      await db.prepare('INSERT INTO pay_orders (id, product, amount, customer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, product, amount, customer, t, t).run();
      return { id, product, amount, customer, status: 'ready' };
    },
    getOrder: (id) => db.prepare('SELECT * FROM pay_orders WHERE id = ?').bind(id).first(),
    getOrderByPaymentKey: (key) => db.prepare('SELECT * FROM pay_orders WHERE payment_key = ?').bind(key).first(),
    // 상태 바꾸기는 조건부(예: ready 일 때만 paid) — 두 요청이 겹쳐도 한 번만 바뀐다
    async markPaid(id, p) {
      const r = await db.prepare("UPDATE pay_orders SET status = 'paid', payment_key = ?, method = ?, receipt_url = ?, updated_at = ? WHERE id = ? AND status IN ('ready', 'failed')")
        .bind(p.paymentKey, p.method ?? null, p.receipt?.url ?? null, now(), id).run();
      return r.meta.changes > 0;
    },
    markFailed: (id) => db.prepare("UPDATE pay_orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'ready'").bind(now(), id).run(),
    async markCanceled(id, { total, canceled }) {
      const status = canceled >= total ? 'canceled' : 'partial_canceled';
      await db.prepare('UPDATE pay_orders SET status = ?, canceled_amount = ?, updated_at = ? WHERE id = ?').bind(status, canceled, now(), id).run();
      return status;
    },
    listPaid: (customer) => db.prepare("SELECT * FROM pay_orders WHERE customer = ? AND status = 'paid' ORDER BY created_at DESC").bind(customer).all().then((r) => r.results),
    // 같은 이벤트는 한 번만 (INSERT 가 실패하면 이미 처리한 것)
    async once(id, kind, orderId, detail) {
      const r = await db.prepare('INSERT OR IGNORE INTO pay_events (id, kind, order_id, detail, at) VALUES (?, ?, ?, ?, ?)').bind(id, kind, orderId ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null, now()).run();
      return r.meta.changes > 0;
    },
    getSub: (customer, product) => db.prepare('SELECT * FROM pay_subscriptions WHERE customer = ? AND product = ?').bind(customer, product).first(),
    async saveSub({ customer, product, billingKey, status, periodEnd, failCount = 0, cancelAtPeriodEnd = 0 }) {
      await db.prepare(`INSERT INTO pay_subscriptions (customer, product, billing_key, status, period_end, fail_count, cancel_at_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(customer, product) DO UPDATE SET billing_key = excluded.billing_key, status = excluded.status,
        period_end = excluded.period_end, fail_count = excluded.fail_count, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`)
        .bind(customer, product, billingKey, status, periodEnd, failCount, cancelAtPeriodEnd, now()).run();
    },
    setSub: (customer, product, fields) => {
      const keys = Object.keys(fields);
      return db.prepare(`UPDATE pay_subscriptions SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE customer = ? AND product = ?`).bind(...keys.map((k) => fields[k]), now(), customer, product).run();
    },
    // 기간이 끝났는데 아직 처리 안 된 구독 (갱신·재시도·만료 대상)
    dueSubs: (at) => db.prepare("SELECT * FROM pay_subscriptions WHERE period_end <= ? AND status IN ('active', 'past_due', 'canceled')").bind(at).all().then((r) => r.results),
    // 운영 지표용 날짜별 매출(원, 환불 뺀 값)·결제 건수 — ops-stats 의 series 에 그대로 넣는다 (KST 날짜)
    revenueByDay: (fromIso) => db.prepare(`SELECT substr(datetime(created_at, '+9 hours'), 1, 10) AS date, SUM(amount - canceled_amount) AS revenue, COUNT(*) AS paid_orders
      FROM pay_orders WHERE status IN ('paid', 'partial_canceled') AND created_at >= ? GROUP BY date ORDER BY date`).bind(fromIso).all().then((r) => r.results),
    activeSubs: (at) => db.prepare("SELECT COUNT(*) AS n FROM pay_subscriptions WHERE status != 'expired' AND period_end > ?").bind(at).first().then((r) => r?.n ?? 0),
    subsOf: (customer) => db.prepare('SELECT * FROM pay_subscriptions WHERE customer = ?').bind(customer).all().then((r) => r.results),
  };
}
