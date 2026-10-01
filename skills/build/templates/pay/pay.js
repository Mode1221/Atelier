// 결제 흐름 (프레임워크와 무관한 순수 함수) — routes.js 가 Hono 에 붙인다.
// 원칙: 금액은 서버가 정하고, 결제 성공은 서버가 토스에 확인한 뒤에만 인정한다. 같은 요청·알림이 두 번 와도 한 번만 처리한다.
// 환불하면(부분 환불 포함) 그 구매로 연 권한은 닫힌다 — 부분 환불 뒤에도 쓰게 하려면 store.access 조건을 바꾼다.
// (시험용) TOSS_API_BASE — 가짜 토스 서버로 전체 흐름을 로컬에서 돌릴 때만. 운영에는 넣지 않는다.
import { createToss, TossError } from './toss.js';
import { createPayStore } from './store.js';
import { PRODUCTS, GRACE_DAYS } from './plans.js';

const DAY = 86_400_000;
const addDays = (iso, d) => new Date(Date.parse(iso) + d * DAY).toISOString();
const newOrderId = () => `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

export function createPay({ db, env, fetch: f, products = PRODUCTS, graceDays = GRACE_DAYS, now = () => new Date().toISOString(), log = () => {} }) {
  const store = createPayStore(db);
  const toss = () => createToss({ secretKey: env.TOSS_SECRET_KEY, fetch: f, ...(env.TOSS_API_BASE ? { base: env.TOSS_API_BASE } : {}) });
  const product = (key) => {
    const p = products[key];
    if (!p) throw Object.assign(new Error('없는 상품이에요'), { status: 400 });
    return p;
  };

  return {
    store,
    // 1) 결제 준비: 주문을 만들고 화면에 필요한 값만 돌려준다 (시크릿 키는 절대 아님)
    async createOrder({ customer, product: key }) {
      const p = product(key);
      if (p.kind !== 'once') throw Object.assign(new Error('정기결제 상품은 카드 등록으로 시작해요'), { status: 400 });
      const id = newOrderId();
      await store.createOrder({ id, product: key, amount: p.amount, customer });
      return { orderId: id, amount: p.amount, orderName: p.name, clientKey: env.TOSS_CLIENT_KEY, customerKey: customer };
    },

    // 2) 성공 페이지로 돌아왔을 때: 금액이 주문과 같은지 보고 토스에 승인 요청
    async success({ paymentKey, orderId, amount }) {
      const order = await store.getOrder(orderId);
      if (!order) return { ok: false, reason: '주문을 찾을 수 없어요' };
      if (order.status === 'paid') return { ok: true, order }; // 새로고침 등으로 두 번 와도 한 번만
      if (Number(amount) !== order.amount) {
        log({ event: 'pay_amount_mismatch', orderId, amount });
        return { ok: false, reason: '결제 금액이 주문과 달라요' }; // 조작 의심 — 승인하지 않는다
      }
      try {
        const p = await toss().confirm({ paymentKey, orderId, amount: order.amount });
        if (p.status !== 'DONE') return { ok: false, reason: `결제가 끝나지 않았어요 (${p.status})` };
        await store.markPaid(orderId, p);
        await store.once(`confirm:${paymentKey}`, 'paid', orderId, { method: p.method });
        log({ event: 'pay_paid', orderId, product: order.product, amount: order.amount });
        return { ok: true, order: await store.getOrder(orderId) };
      } catch (e) {
        if (e instanceof TossError && e.code === 'ALREADY_PROCESSED_PAYMENT') {
          const p = await toss().get(paymentKey); // 이미 승인됨 — 상태만 맞춘다
          if (p.status === 'DONE') { await store.markPaid(orderId, p); return { ok: true, order: await store.getOrder(orderId) }; }
        }
        await store.markFailed(orderId);
        log({ event: 'pay_confirm_failed', orderId, code: e.code });
        return { ok: false, reason: e.message };
      }
    },

    async fail({ orderId, code }) {
      if (orderId) await store.markFailed(orderId);
      log({ event: 'pay_failed', orderId, code });
    },

    // 3) 웹훅: 알림 내용을 믿지 않고 토스에 다시 물어서 상태를 맞춘다 (결제 알림에는 서명이 없으므로)
    async webhook(body) {
      const key = body?.data?.paymentKey;
      if (!key || !String(body.eventType ?? '').startsWith('PAYMENT')) return { ok: true, ignored: true };
      const p = await toss().get(key);
      const order = await store.getOrder(p.orderId);
      if (!order) return { ok: true, ignored: true };
      if (!(await store.once(`hook:${key}:${p.status}:${p.balanceAmount ?? ''}`, 'webhook', p.orderId, { status: p.status }))) return { ok: true, duplicate: true };
      if (p.status === 'DONE') await store.markPaid(p.orderId, p);
      else if (p.status === 'CANCELED' || p.status === 'PARTIAL_CANCELED') await store.markCanceled(p.orderId, { total: order.amount, canceled: order.amount - (p.balanceAmount ?? 0) });
      else if (['ABORTED', 'EXPIRED'].includes(p.status)) await store.markFailed(p.orderId);
      return { ok: true, status: p.status };
    },

    // 4) 환불 (운영자만): 부분 환불은 amount, 없으면 전액
    async refund({ orderId, reason, amount }) {
      const order = await store.getOrder(orderId);
      if (!order?.payment_key) throw Object.assign(new Error('결제된 주문이 아니에요'), { status: 400 });
      const p = await toss().cancel(order.payment_key, { reason: reason || '고객 요청', amount, idem: `refund-${orderId}-${amount ?? 'all'}` });
      const status = await store.markCanceled(orderId, { total: order.amount, canceled: order.amount - (p.balanceAmount ?? 0) });
      log({ event: 'pay_refunded', orderId, amount: amount ?? order.amount });
      return { ok: true, status };
    },

    // 5) 정기결제 시작: 카드 등록 성공(authKey) → 빌링키 발급 → 첫 달 청구
    async startSubscription({ authKey, customer, product: key }) {
      const p = product(key);
      if (p.kind !== 'subscription') throw Object.assign(new Error('정기결제 상품이 아니에요'), { status: 400 });
      const { billingKey } = await toss().issueBillingKey({ authKey, customerKey: customer });
      const charged = await chargeOnce(customer, key, billingKey);
      if (!charged.ok) return charged;
      await store.saveSub({ customer, product: key, billingKey, status: 'active', periodEnd: addDays(now(), p.period_days) });
      return { ok: true };
    },
    // 해지: 남은 기간까지는 쓰고, 다음 갱신을 하지 않는다
    async cancelSubscription({ customer, product: key }) {
      await store.setSub(customer, key, { cancel_at_period_end: 1, status: 'canceled' });
      return { ok: true };
    },

    // 6) 매일 한 번 (Workers Cron): 기간이 끝난 구독을 갱신·재시도·만료
    async renew() {
      const t = now(), out = [];
      for (const s of await store.dueSubs(t)) {
        const p = products[s.product];
        if (!p || s.cancel_at_period_end || s.status === 'canceled') { await store.setSub(s.customer, s.product, { status: 'expired' }); out.push([s.customer, 'expired']); continue; }
        const r = await chargeOnce(s.customer, s.product, s.billing_key);
        if (r.ok) {
          await store.setSub(s.customer, s.product, { status: 'active', fail_count: 0, period_end: addDays(s.period_end, p.period_days) });
          out.push([s.customer, 'renewed']);
        } else if (Date.parse(t) > Date.parse(addDays(s.period_end, graceDays))) {
          await store.setSub(s.customer, s.product, { status: 'expired', fail_count: s.fail_count + 1 });
          out.push([s.customer, 'expired']);
        } else {
          await store.setSub(s.customer, s.product, { status: 'past_due', fail_count: s.fail_count + 1 });
          out.push([s.customer, 'past_due']);
        }
      }
      return out;
    },

    // 7) 지금 쓸 수 있는 것 — 유료 기능 화면·API 는 이것만 본다
    async access(customer) {
      const t = now();
      const subs = (await store.subsOf(customer)).filter((s) => s.status !== 'expired' && (s.period_end > t || (s.status === 'past_due' && Date.parse(t) <= Date.parse(addDays(s.period_end, graceDays)))));
      const orders = await store.listPaid(customer);
      return { subscriptions: subs.map((s) => ({ product: s.product, status: s.status, until: s.period_end, renews: !s.cancel_at_period_end })), purchases: orders.filter((o) => products[o.product]?.kind === 'once').map((o) => o.product) }; // 구독 청구 주문은 subscriptions 쪽에서 본다
    },
  };

  async function chargeOnce(customer, key, billingKey) {
    const p = products[key];
    const id = newOrderId();
    await store.createOrder({ id, product: key, amount: p.amount, customer });
    try {
      const r = await createToss({ secretKey: env.TOSS_SECRET_KEY, fetch: f, ...(env.TOSS_API_BASE ? { base: env.TOSS_API_BASE } : {}) }).chargeBilling(billingKey, { customerKey: customer, amount: p.amount, orderId: id, orderName: p.name });
      if (r.status !== 'DONE') { await store.markFailed(id); return { ok: false, reason: r.status }; }
      await store.markPaid(id, r);
      log({ event: 'pay_billed', orderId: id, product: key, amount: p.amount });
      return { ok: true, orderId: id };
    } catch (e) {
      await store.markFailed(id);
      log({ event: 'pay_bill_failed', orderId: id, code: e.code });
      return { ok: false, reason: e.message };
    }
  }
}
