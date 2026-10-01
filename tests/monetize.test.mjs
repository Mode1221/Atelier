// 앱 안 결제(templates/iap) · 웹 광고(templates/ads) — SDK 를 가짜로 바꿔 판단 로직을 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../skills/build/templates/iap/purchases.js';
import { shouldShowAds, mountAds, adsTxt, ADS } from '../skills/build/templates/ads/ads.js';

function fakePurchases({ owned = false } = {}) {
  const state = { owned, configured: null };
  const info = () => ({ entitlements: { active: state.owned ? { pro: {} } : {} } });
  return {
    state,
    configure: (o) => (state.configured = o),
    getOfferings: async () => ({ current: { availablePackages: [{ identifier: '$rc_monthly', product: { title: '프로 월간', priceString: '₩4,900' } }] } }),
    purchasePackage: async (p) => { if (p.cancel) throw Object.assign(new Error('취소'), { userCancelled: true }); state.owned = true; return { customerInfo: info() }; },
    restorePurchases: async () => info(),
    getCustomerInfo: async () => info(),
  };
}

test('iap: 키 없으면 알려 주고, 구매·취소·복원·유료 판단은 entitlement 로만', async () => {
  const P = fakePurchases();
  await assert.rejects(createStore({ Purchases: P, platform: 'ios', keys: {} }).init(), /EXPO_PUBLIC_RC_IOS_KEY/);
  const s = createStore({ Purchases: P, platform: 'android', keys: { android: 'goog_x' } });
  await assert.rejects(s.products(), /init/);
  await s.init('user-1');
  assert.deepEqual(P.state.configured, { apiKey: 'goog_x', appUserID: 'user-1' });
  const [item] = await s.products();
  assert.equal(item.price, '₩4,900');
  assert.deepEqual(await s.buy({ ...item, pkg: { cancel: true } }), { ok: false, cancelled: true });
  assert.equal(await s.isPro(), false);
  assert.deepEqual(await s.buy(item), { ok: true });
  assert.equal(await s.isPro(), true);
  assert.deepEqual(await createStore({ Purchases: fakePurchases({ owned: true }), platform: 'ios', keys: { ios: 'appl_x' } }).restore(), { ok: true });
  assert.match(s.manageUrl(), /play\.google\.com/);
});

test('ads: 승인 전(ID 없음)·꺼짐·결제/가입 화면에는 광고 없음, 자리 먼저 잡고 스크립트 한 번, ads.txt', () => {
  assert.equal(shouldShowAds('/', ADS), false, '게시자 ID 없으면 끔');
  const cfg = { ...ADS, client: 'ca-pub-123', slots: { sidebar: '111', inline: '' } };
  assert.equal(shouldShowAds('/', cfg), true);
  assert.equal(shouldShowAds('/pay/checkout.html', cfg), false);
  assert.equal(shouldShowAds('/', { ...cfg, provider: 'off' }), false);
  const els = [{ dataset: { ad: 'sidebar' }, style: {} }, { dataset: { ad: 'inline' }, style: {} }];
  const head = [];
  const doc = { location: { pathname: '/' }, querySelectorAll: () => els, createElement: () => ({}), head: { append: (s) => head.push(s) } };
  assert.equal(mountAds(doc, cfg), 1);
  assert.match(els[0].innerHTML, /data-ad-slot="111"/);
  assert.equal(els[0].style.minHeight, '100px');
  assert.equal(head.length, 1);
  assert.match(head[0].src, /client=ca-pub-123/);
  assert.equal(adsTxt('ca-pub-123'), 'google.com, pub-123, DIRECT, f08c47fec0942fa0\n');
  assert.equal(adsTxt(''), '');
});
