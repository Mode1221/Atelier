// Hono 앱에 결제 주소를 붙인다.
//   import { mountPay } from './pay/routes.js';
//   mountPay(app, { customerOf: (c) => <로그인한 사용자 id 또는 기기 id> });
// 그리고 wrangler.toml 에 매일 갱신:  [triggers] crons = ["17 0 * * *"]  →  export default { fetch: app.fetch, scheduled: (e, env, ctx) => ctx.waitUntil(renewAll(env)) }
import { createPay } from './pay.js';
import { PRODUCTS } from './plans.js';

const page = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/pay/pay.css"></head><body><main class="pay"><h1>${title}</h1>${body}<p><a class="btn" href="/">처음으로</a></p></main></body></html>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountPay(app, { customerOf, products = PRODUCTS, log } = {}) {
  const pay = (c) => createPay({ db: c.env.DB, env: c.env, products, log });
  const fail = (c, e) => c.json({ error: e.message }, e.status ?? 500);

  app.get('/api/pay/products', (c) => c.json(Object.entries(products).map(([key, p]) => ({ key, name: p.name, amount: p.amount, kind: p.kind, period_days: p.period_days ?? null }))));
  app.get('/api/pay/config', (c) => c.json({ clientKey: c.env.TOSS_CLIENT_KEY ?? null, customerKey: customerOf(c) }));
  app.post('/api/pay/orders', async (c) => {
    try { return c.json(await pay(c).createOrder({ customer: customerOf(c), product: (await c.req.json()).product })); } catch (e) { return fail(c, e); }
  });
  app.get('/pay/success', async (c) => {
    const q = c.req.query();
    const r = await pay(c).success({ paymentKey: q.paymentKey, orderId: q.orderId, amount: q.amount });
    return c.html(r.ok ? page('결제가 끝났어요', `<p>${esc(products[r.order.product]?.name)} · ${Number(r.order.amount).toLocaleString('ko-KR')}원</p>${r.order.receipt_url ? `<p><a href="${esc(r.order.receipt_url)}" target="_blank" rel="noopener">영수증 보기</a></p>` : ''}`)
      : page('결제를 끝내지 못했어요', `<p>${esc(r.reason)}</p><p>돈이 빠져나갔다면 자동으로 취소돼요. 문제가 계속되면 문의해 주세요.</p>`), r.ok ? 200 : 400);
  });
  app.get('/pay/fail', async (c) => {
    const q = c.req.query();
    await pay(c).fail({ orderId: q.orderId, code: q.code });
    return c.html(page('결제가 취소됐어요', `<p>${esc(q.message || '결제를 마치지 않았어요.')}</p>`), 400);
  });
  // 토스페이먼츠 개발자센터 → 웹훅에 https://<서비스>/api/pay/webhook 등록 (이벤트: PAYMENT_STATUS_CHANGED)
  app.post('/api/pay/webhook', async (c) => {
    try { return c.json(await pay(c).webhook(await c.req.json())); } catch (e) { return fail(c, e); }
  });
  // 정기결제 카드 등록 성공 → 빌링키·첫 청구
  app.get('/pay/billing/success', async (c) => {
    const q = c.req.query();
    if (q.customerKey !== customerOf(c)) return c.html(page('다시 시도해 주세요', '<p>로그인 정보가 바뀌었어요.</p>'), 400);
    try {
      const r = await pay(c).startSubscription({ authKey: q.authKey, customer: q.customerKey, product: q.product });
      return c.html(r.ok ? page('구독을 시작했어요', `<p>${esc(products[q.product]?.name)} · 매 ${products[q.product]?.period_days}일 자동 결제. 언제든 해지할 수 있고, 해지해도 남은 기간은 쓸 수 있어요.</p>`) : page('첫 결제에 실패했어요', `<p>${esc(r.reason)}</p>`), r.ok ? 200 : 400);
    } catch (e) { return c.html(page('카드 등록을 끝내지 못했어요', `<p>${esc(e.message)}</p>`), 400); }
  });
  app.post('/api/pay/subscription/cancel', async (c) => {
    try { return c.json(await pay(c).cancelSubscription({ customer: customerOf(c), product: (await c.req.json()).product })); } catch (e) { return fail(c, e); }
  });
  app.get('/api/pay/me', async (c) => c.json(await pay(c).access(customerOf(c))));
  // 환불 (운영자): Authorization: Bearer <PAY_ADMIN_TOKEN>
  app.post('/api/pay/refund', async (c) => {
    const t = c.env.PAY_ADMIN_TOKEN;
    if (!t || c.req.header('authorization') !== `Bearer ${t}`) return c.json({ error: 'unauthorized' }, 401);
    try { return c.json(await pay(c).refund(await c.req.json())); } catch (e) { return fail(c, e); }
  });
}

// Workers Cron 에서: 기간 끝난 구독 갱신·재시도·만료
export const renewAll = (env, { products = PRODUCTS, log } = {}) => createPay({ db: env.DB, env, products, log }).renew();
