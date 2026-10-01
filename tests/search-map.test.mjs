import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './helpers/d1.mjs';
import { createSearch, terms } from '../skills/build/templates/search/search.js';
import { createGeo, distanceM } from '../skills/build/templates/map/geo.js';

test('search: 한국어 부분 일치(3글자↑ 색인, 2글자↓ LIKE), 덮어쓰기·삭제, 안전한 snippet', async () => {
  const db = fakeD1(readFileSync(new URL('../skills/build/templates/search/search.sql', import.meta.url), 'utf8'));
  const s = createSearch({ db });
  await s.index('post', 1, { title: '강남역 맛집', body: '파스타가 맛있는 곳 <script>x</script>' });
  await s.index('post', 2, { title: '성수 카페', body: '조용한 카페' });
  await s.index('item', 9, { title: '맛있는 빵', body: '' });
  let r = await s.query('맛있는', { kind: 'post' });
  assert.deepEqual(r.map((x) => x.ref), ['1']);
  assert.match(r[0].snippet, /<mark>맛있는<\/mark>/);
  assert.doesNotMatch(r[0].snippet, /<script>/);
  assert.deepEqual((await s.query('카페')).map((x) => x.ref), ['2']);
  assert.deepEqual((await s.query('맛있는')).length, 2);
  await s.index('post', 2, { title: '성수 서점', body: '' });
  assert.deepEqual(await s.query('카페'), []);
  await s.remove('post', 1);
  assert.deepEqual((await s.query('맛있는')).map((x) => x.kind), ['item']);
  assert.deepEqual(terms('a"b* (c)'), ['a', 'b', 'c']);
  assert.deepEqual(await s.query('   '), []);
});

test('geo: 카카오 응답 정리·캐시·키 없음/거절', async () => {
  let calls = 0, auth;
  const fetch = async (url, o) => { calls++; auth = o.headers.authorization; assert.match(url, /keyword\.json\?query=/); return { ok: true, status: 200, json: async () => ({ documents: [{ id: '1', place_name: '카페', road_address_name: '서울 성동구', x: '127.05', y: '37.54', category_name: '음식점 > 카페', place_url: 'http://place', distance: '120' }], meta: { is_end: true } }) }; };
  const g = createGeo({ env: { KAKAO_REST_KEY: 'k' }, fetch });
  const r = await g.search('카페', { lat: 37.5, lng: 127 });
  assert.equal(auth, 'KakaoAK k');
  assert.deepEqual(r.items[0], { id: '1', name: '카페', address: '서울 성동구', lat: 37.54, lng: 127.05, phone: '', category: '카페', url: 'http://place', distance: 120 });
  await g.search('카페', { lat: 37.5, lng: 127 });
  assert.equal(calls, 1, '같은 검색은 캐시');
  assert.deepEqual(await createGeo({ env: {}, fetch }).search('x'), { ok: false, reason: 'no_key' });
  assert.equal((await createGeo({ env: { KAKAO_REST_KEY: 'k' }, fetch: async () => ({ ok: false, status: 401 }) }).search('x')).reason, 'key');
  const d = distanceM({ lat: 37.5665, lng: 126.978 }, { lat: 37.5547, lng: 126.9706 });
  assert.ok(d > 1400 && d < 1600, String(d));
});
