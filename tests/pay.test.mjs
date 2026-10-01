// 결제 템플릿(skills/build/templates/pay) — 토스페이먼츠를 가짜로 바꿔 단건·정기·웹훅·환불·만료를 전부 돌린다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './helpers/d1.mjs';
import { createPay } from '../skills/build/templates/pay/pay.js';

const SQL = readFileSync(new URL('../skills/build/templates/pay/pay.sql', import.meta.url), 'utf8');
const ENV = { TOSS_SECRET_KEY: 'sk_fake', TOSS_CLIENT_KEY: 'ck_fake' };

// 가짜 토스: 승인한 결제를 기억하고, 카드 거절을 흉내 낸다
function fakeToss({ declineBilling = false } = {}) {
  const pays = new Map(), calls = [];
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const f = async (url, init) => {
    const path = new URL(url).pathname, body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path, body, idem: init.headers['idempotency-key'], auth: init.headers.authorization });
    if (path === '/v1/payments/confirm') {
      if (pays.has(body.paymentKey)) return json(400, { code: 'ALREADY_PROCESSED_PAYMENT', message: '이미 처리된 결제' });
      const p = { paymentKey: body.paymentKey, orderId: body.orderId, status: 'DONE', totalAmount: body.amount, balanceAmount: body.amount, method: '카드', receipt: { url: 'https://receipt/x' } };
      pays.set(body.paymentKey, p);
      return json(200, p);
    }
    let m;
    if ((m = path.match(/^\/v1\/payments\/([^/]+)\/cancel$/))) {
      const p = pays.get(decodeURIComponent(m[1]));
      p.balanceAmount -= body.cancelAmount ?? p.balanceAmount;
      p.status = p.balanceAmount === 0 ? 'CANCELED' : 'PARTIAL_CANCELED';
      return json(200, p);
    }
    if ((m = path.match(/^\/v1\/payments\/([^/]+)$/))) return json(200, pays.get(decodeURIComponent(m[1])));
    if (path === '/v1/billing/authorizations/issue') return json(200, { billingKey: `bk_${body.customerKey}` });
    if ((m = path.match(/^\/v1\/billing\/(.+)$/))) {
      if (declineBilling) return json(400, { code: 'REJECT_CARD_PAYMENT', message: '한도 초과' });
      const p = { paymentKey: `pk_${body.orderId}`, orderId: body.orderId, status: 'DONE', totalAmount: body.amount, balanceAmount: body.amount };
      pays.set(p.paymentKey, p);
      return json(200, p);
    }
    return json(404, { code: 'NOT_FOUND' });
  };
  return { f, pays, calls, setDecline: (v) => (declineBilling = v) };
}

const setup = (opts = {}) => {
  const db = fakeD1(SQL), toss = fakeToss(opts);
  let t = '2026-10-01T00:00:00.000Z';
  const pay = createPay({ db, env: ENV, fetch: toss.f, now: () => t });
  return { db, toss, pay, at: (x) => (t = x) };
};

test('pay: 단건 — 서버가 금액을 정하고, 성공 확인은 토스 승인 뒤, 새로고침해도 한 번만', async () => {
  const { pay, toss } = setup();
  const o = await pay.createOrder({ customer: 'u1', product: 'credits_100' });
  assert.equal(o.amount, 9900);
  assert.equal(o.clientKey, 'ck_fake');
  assert.ok(!JSON.stringify(o).includes('sk_fake'), '시크릿 키가 화면으로 가면 안 된다');
  const r = await pay.success({ paymentKey: 'pk1', orderId: o.orderId, amount: '9900' });
  assert.equal(r.ok, true);
  assert.equal(r.order.status, 'paid');
  assert.equal(toss.calls[0].auth, `Basic ${btoa('sk_fake:')}`);
  assert.equal(toss.calls[0].idem, `confirm-${o.orderId}`);
  assert.equal((await pay.success({ paymentKey: 'pk1', orderId: o.orderId, amount: '9900' })).ok, true); // 새로고침
  assert.equal(toss.calls.filter((c) => c.path.endsWith('/confirm')).length, 1);
  assert.deepEqual((await pay.access('u1')).purchases, ['credits_100']);
});

test('pay: 금액을 바꿔 돌아오면 승인하지 않는다, 없는 상품·정기 상품 단건 주문은 거절', async () => {
  const { pay, toss } = setup();
  const o = await pay.createOrder({ customer: 'u1', product: 'credits_100' });
  const r = await pay.success({ paymentKey: 'pk2', orderId: o.orderId, amount: '100' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /금액/);
  assert.equal(toss.calls.length, 0);
  await assert.rejects(pay.createOrder({ customer: 'u1', product: 'nope' }), /없는 상품/);
  await assert.rejects(pay.createOrder({ customer: 'u1', product: 'pro_month' }), /카드 등록/);
});

test('pay: 웹훅은 알림 내용이 아니라 토스 조회 결과로 맞추고, 같은 알림은 한 번만', async () => {
  const { pay, toss } = setup();
  const o = await pay.createOrder({ customer: 'u1', product: 'credits_100' });
  await pay.success({ paymentKey: 'pk3', orderId: o.orderId, amount: 9900 });
  toss.pays.get('pk3').status = 'CANCELED'; toss.pays.get('pk3').balanceAmount = 0; // 토스 화면에서 취소됨
  const fake = { eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk3', status: 'DONE' } }; // 알림이 거짓이어도
  assert.equal((await pay.webhook(fake)).status, 'CANCELED');
  assert.equal((await pay.store.getOrder(o.orderId)).status, 'canceled');
  assert.equal((await pay.webhook(fake)).duplicate, true);
  assert.equal((await pay.webhook({ eventType: 'OTHER' })).ignored, true);
});

test('pay: 부분 환불 → 전액 환불, 환불 요청마다 멱등 키', async () => {
  const { pay, toss } = setup();
  const o = await pay.createOrder({ customer: 'u1', product: 'credits_100' });
  await pay.success({ paymentKey: 'pk4', orderId: o.orderId, amount: 9900 });
  assert.equal((await pay.refund({ orderId: o.orderId, amount: 4900, reason: '일부' })).status, 'partial_canceled');
  assert.equal((await pay.store.getOrder(o.orderId)).canceled_amount, 4900);
  assert.equal((await pay.refund({ orderId: o.orderId })).status, 'canceled');
  assert.deepEqual(toss.calls.filter((c) => c.path.endsWith('/cancel')).map((c) => c.idem), [`refund-${o.orderId}-4900`, `refund-${o.orderId}-all`]);
  await assert.rejects(pay.refund({ orderId: 'none' }), /결제된 주문이 아니/);
});

test('pay: 정기결제 — 첫 청구, 갱신, 카드 거절 시 유예 후 만료, 해지는 기간 끝까지', async () => {
  const { pay, toss, at } = setup();
  assert.equal((await pay.startSubscription({ authKey: 'a1', customer: 'u2', product: 'pro_month' })).ok, true);
  let sub = await pay.store.getSub('u2', 'pro_month');
  assert.equal(sub.status, 'active');
  assert.equal(sub.period_end, '2026-10-31T00:00:00.000Z');
  assert.equal((await pay.access('u2')).subscriptions[0].renews, true);

  at('2026-10-31T01:00:00.000Z');
  assert.deepEqual(await pay.renew(), [['u2', 'renewed']]);
  assert.equal((await pay.store.getSub('u2', 'pro_month')).period_end, '2026-11-30T00:00:00.000Z');

  toss.setDecline(true);
  at('2026-11-30T01:00:00.000Z');
  assert.deepEqual(await pay.renew(), [['u2', 'past_due']]);
  assert.equal((await pay.access('u2')).subscriptions.length, 1, '유예 기간에는 계속 쓸 수 있다');
  at('2026-12-04T01:00:00.000Z');
  assert.deepEqual(await pay.renew(), [['u2', 'expired']]);
  assert.equal((await pay.access('u2')).subscriptions.length, 0);

  toss.setDecline(false);
  at('2026-12-05T00:00:00.000Z');
  await pay.startSubscription({ authKey: 'a2', customer: 'u3', product: 'pro_month' });
  await pay.cancelSubscription({ customer: 'u3', product: 'pro_month' });
  assert.equal((await pay.access('u3')).subscriptions[0].renews, false);
  at('2027-01-04T01:00:00.000Z');
  assert.deepEqual(await pay.renew(), [['u3', 'expired']]);
  assert.equal(toss.calls.filter((c) => c.path.startsWith('/v1/billing/bk_u3')).length, 1, '해지 후에는 다시 청구하지 않는다');
});

test('pay: 첫 청구가 거절되면 구독을 만들지 않는다', async () => {
  const { pay } = setup({ declineBilling: true });
  const r = await pay.startSubscription({ authKey: 'a', customer: 'u4', product: 'pro_month' });
  assert.equal(r.ok, false);
  assert.equal(await pay.store.getSub('u4', 'pro_month'), null);
});

test('pay: 운영 지표 — 날짜별 매출(환불 뺌)·결제 건수, 활성 구독 수', async () => {
  const { pay, at } = setup();
  const a = await pay.createOrder({ customer: 'u1', product: 'credits_100' });
  await pay.success({ paymentKey: 'pa', orderId: a.orderId, amount: 9900 });
  await pay.refund({ orderId: a.orderId, amount: 900 });
  at('2026-10-02T00:00:00.000Z');
  await pay.startSubscription({ authKey: 'x', customer: 'u5', product: 'pro_month' });
  const rows = await pay.store.revenueByDay('2026-09-01T00:00:00.000Z');
  assert.equal(rows.reduce((s, r) => s + r.revenue, 0), 9000 + 4900);
  assert.equal(await pay.store.activeSubs('2026-10-03T00:00:00.000Z'), 1);
});

// pay-first.mjs — 사람이 키를 잘못 넣는 흔한 경우를 잡는다
import { checkKeys, setVar, readVars, install } from '../skills/build/templates/pay/pay-first.mjs';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('pay-first: 키 확인(빈 값·뒤바뀜·실서비스), .dev.vars 쓰기, 템플릿 설치는 기존 파일을 덮지 않음', () => {
  const j = (...p) => p.join('');
  assert.equal(checkKeys({}).ok, false);
  assert.match(checkKeys({ TOSS_CLIENT_KEY: j('test_', 'sk_', 'x'), TOSS_SECRET_KEY: j('test_', 'ck_', 'y') }).problems.join(), /바꿔/);
  assert.deepEqual(checkKeys({ TOSS_CLIENT_KEY: j('test_', 'ck_', 'x'), TOSS_SECRET_KEY: j('test_', 'sk_', 'y') }), { ok: true, problems: [], live: false });
  assert.equal(checkKeys({ TOSS_CLIENT_KEY: j('live_', 'ck_', 'x'), TOSS_SECRET_KEY: j('live_', 'sk_', 'y') }).live, true);
  const root = mkdtempSync(join(tmpdir(), 'pay-'));
  const vars = join(root, '.dev.vars');
  writeFileSync(vars, 'A=1\n');
  setVar(vars, 'TOSS_CLIENT_KEY', 'c1'); setVar(vars, 'TOSS_CLIENT_KEY', 'c2');
  assert.deepEqual(readVars(vars), { A: '1', TOSS_CLIENT_KEY: 'c2' });
  writeFileSync(join(root, 'package.json'), '{"scripts":{}}');
  const c = install(root);
  assert.ok(c.includes('src/pay/plans.js') && c.includes('public/pay/checkout.html') && c.includes('migrations/0001_pay.sql'));
  writeFileSync(join(root, 'src/pay/plans.js'), '// 내가 고침');
  assert.deepEqual(install(root), []);
  assert.ok(existsSync(join(root, 'scripts/pay-first.mjs')));
  assert.equal(readdirSync(join(root, 'migrations')).length, 1);
});

test('pay-first: 시크릿 키를 토스에 실제로 확인 (404=맞음, 401=틀림, 네트워크=모름)', async () => {
  const { verifySecret } = await import('../skills/build/templates/pay/pay-first.mjs');
  let seen;
  assert.deepEqual(await verifySecret('k', async (u, o) => { seen = o.headers.authorization; return { status: 404 }; }), { ok: true });
  assert.equal(seen, `Basic ${Buffer.from('k:').toString('base64')}`);
  assert.equal((await verifySecret('k', async () => ({ status: 401 }))).ok, false);
  assert.equal((await verifySecret('k', async () => { throw new Error('x'); })).ok, null);
});
