import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { openD1 } from '../src/d1-node.js';
import { createApp, scheduled } from '../src/app.js';
import { createRepo } from '../src/repo.js';
import { LEGAL } from '../src/legal.gen.js';
import { TEMPLATES } from '../src/templates.js';

let app, repo, env;
const logs = [];
beforeEach(() => {
  logs.length = 0;
  env = { DB: openD1() };
  repo = createRepo(env.DB);
  app = createApp({ log: (o) => logs.push(o), limits: { createPerHour: 3, keyFailsPer10Min: 2 }, trustProxyHeader: 'x-forwarded-for' });
});
const req = (method, path, { body, key, ip = '1.1.1.1' } = {}) =>
  app.request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...(key ? { 'X-Admin-Key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
const newTrip = async (template = 'camping') => {
  const res = await req('POST', '/api/trips', { body: { name: '가평 캠핑', template, starts_on: '2026-10-17' } });
  expect(res.status).toBe(201);
  return res.json();
};
const join = async (id, name) => (await req('POST', `/api/trips/${id}/people`, { body: { name } })).json();
const load = async (id) => (await req('GET', `/api/trips/${id}`)).json();
const itemByName = async (id, name) => (await load(id)).items.find((i) => i.name === name);

describe('F1 목록 만들기', () => {
  it('템플릿 준비물이 미리 채워지고, 관리 키는 해시로만 저장', async () => {
    const { id, adminKey } = await newTrip();
    const d = await load(id);
    expect(d.trip).toMatchObject({ name: '가평 캠핑', starts_on: '2026-10-17' });
    expect(d.items.filter((i) => i.kind === 'shared')).toHaveLength(TEMPLATES.camping.shared.length);
    expect(d.items.filter((i) => i.kind === 'personal')).toHaveLength(TEMPLATES.camping.personal.length);
    expect(adminKey.length).toBeGreaterThanOrEqual(24);
    expect((await repo.getTrip(id)).admin_key_hash).not.toContain(adminKey);
  });
  it('모르는 템플릿은 빈 목록, 빈 이름·잘못된 날짜는 필드 오류', async () => {
    const r = await req('POST', '/api/trips', { body: { name: 'x', template: 'nope' } });
    expect((await load((await r.json()).id)).items).toEqual([]);
    const bad = await req('POST', '/api/trips', { body: { name: ' ', starts_on: '2026-02-30' } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).fields).toEqual({ name: '이름을 입력해 주세요', starts_on: '날짜를 확인해 주세요' });
  });
  it('IP 당 생성 한도', async () => {
    for (let i = 0; i < 3; i++) await newTrip('blank');
    expect((await req('POST', '/api/trips', { body: { name: 'x' } })).status).toBe(429);
  });
});

describe('F2 참여 (가입 없음)', () => {
  it('링크만 있으면 이름으로 참여, 같은 이름은 409', async () => {
    const { id } = await newTrip();
    expect(await join(id, '민수')).toMatchObject({ name: '민수' });
    const dup = await req('POST', `/api/trips/${id}/people`, { body: { name: ' 민수 ' } });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toContain('이미 있는 이름');
  });
  it('30명 한도', async () => {
    const { id } = await newTrip('blank');
    for (let i = 0; i < 30; i++) await join(id, `p${i}`);
    expect((await req('POST', `/api/trips/${id}/people`, { body: { name: 'over' } })).status).toBe(422);
  });
  it('없는 목록 → 404 화면·API', async () => {
    expect((await req('GET', '/t/nope')).status).toBe(404);
    expect((await req('POST', '/api/trips/nope/people', { body: { name: 'x' } })).status).toBe(404);
  });
});

describe('F3 준비물 맡기', () => {
  it('찜 → 챙김 → 취소 흐름', async () => {
    const { id } = await newTrip();
    const m = await join(id, '민수');
    const tent = await itemByName(id, '텐트');
    const claim = await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: m.id } });
    expect(await claim.json()).toMatchObject({ claimed_by: m.id, packed: 0 });
    await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'pack', person_id: m.id, packed: true } });
    expect(await itemByName(id, '텐트')).toMatchObject({ claimed_by: m.id, packed: true });
    await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'unclaim', person_id: m.id } });
    expect(await itemByName(id, '텐트')).toMatchObject({ claimed_by: null, packed: false });
  });
  it('이미 다른 사람이 맡은 건 뺏을 수 없다 (409 + 누가 맡았는지)', async () => {
    const { id } = await newTrip();
    const a = await join(id, '민수');
    const b = await join(id, '지영');
    const tent = await itemByName(id, '텐트');
    await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: a.id } });
    const r = await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: b.id } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('민수님이 먼저 맡았어요');
    for (const action of ['unclaim', 'pack']) expect((await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action, person_id: b.id, packed: true } })).status).toBe(409);
  });
  it('동시에 찜해도 한 사람만 된다', async () => {
    const { id } = await newTrip();
    const ps = await Promise.all(['a', 'b', 'c', 'd'].map((n) => join(id, n)));
    const tent = await itemByName(id, '텐트');
    const codes = await Promise.all(ps.map((p) => req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: p.id } }).then((r) => r.status)));
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
  });
  it('각자 챙길 것은 맡을 수 없고, 이름을 안 고르면 400', async () => {
    const { id } = await newTrip();
    const m = await join(id, '민수');
    const bag = await itemByName(id, '침낭');
    expect((await req('PATCH', `/api/trips/${id}/items/${bag.id}`, { body: { action: 'claim', person_id: m.id } })).status).toBe(400);
    const tent = await itemByName(id, '텐트');
    expect((await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim' } })).status).toBe(400);
    expect((await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'steal', person_id: m.id } })).status).toBe(400);
  });
  it('준비물 추가·삭제, 수량 검증, 200개 한도', async () => {
    const { id } = await newTrip('blank');
    const r = await req('POST', `/api/trips/${id}/items`, { body: { name: '고기 2kg', qty: 3 } });
    expect(await r.json()).toMatchObject({ name: '고기 2kg', qty: 3, kind: 'shared' });
    expect((await req('POST', `/api/trips/${id}/items`, { body: { name: 'x', qty: 0 } })).status).toBe(400);
    expect((await req('POST', `/api/trips/${id}/items`, { body: { name: '' } })).status).toBe(400);
    const item = (await load(id)).items[0];
    expect((await req('DELETE', `/api/trips/${id}/items/${item.id}`)).status).toBe(204);
    for (let i = 0; i < 200; i++) await repo.addItem(id, { name: `i${i}`, qty: 1, kind: 'personal' });
    expect((await req('POST', `/api/trips/${id}/items`, { body: { name: 'over' } })).status).toBe(422);
  });
  it('다른 목록의 준비물·사람 ID 는 건드릴 수 없다 (IDOR)', async () => {
    const a = await newTrip();
    const b = await newTrip();
    const pa = await join(a.id, '민수');
    const pb = await join(b.id, '민수');
    const tentA = await itemByName(a.id, '텐트');
    expect((await req('PATCH', `/api/trips/${b.id}/items/${tentA.id}`, { body: { action: 'claim', person_id: pb.id } })).status).toBe(404);
    expect((await req('PATCH', `/api/trips/${a.id}/items/${tentA.id}`, { body: { action: 'claim', person_id: pb.id } })).status).toBe(400);
    expect((await req('DELETE', `/api/trips/${b.id}/items/${tentA.id}`)).status).toBe(404);
    expect((await req('POST', `/api/trips/${b.id}/expenses`, { body: { paid_by: pa.id, amount: 1000, shares: [pa.id] } })).status).toBe(400);
  });
});

describe('F3-1 각자 챙길 것', () => {
  it('각자 챙길 것을 추가하면 공용 목록이 아닌 "각자 챙길 것"에 보이고, 진행률에 들어가지 않는다', async () => {
    const { id } = await newTrip('blank');
    await req('POST', `/api/trips/${id}/items`, { body: { name: '슬리퍼', kind: 'personal' } });
    await req('POST', `/api/trips/${id}/items`, { body: { name: '버너' } });
    expect((await load(id)).items.map((i) => [i.name, i.kind])).toEqual([['슬리퍼', 'personal'], ['버너', 'shared']]);
    const html = await (await req('GET', `/t/${id}`)).text();
    expect(html).toContain('0/1 맡음');
    expect(html).toContain('aria-label="슬리퍼 삭제"');
  });
});

describe('F4 장본 돈 나누기', () => {
  it('지출 → 화면에 송금 안내', async () => {
    const { id } = await newTrip('blank');
    const [a, b, c] = [await join(id, '민수'), await join(id, '지영'), await join(id, '하늘')];
    expect((await req('POST', `/api/trips/${id}/expenses`, { body: { paid_by: a.id, amount: 90_000, memo: '마트', shares: [a.id, b.id, c.id] } })).status).toBe(201);
    expect((await req('POST', `/api/trips/${id}/expenses`, { body: { paid_by: b.id, amount: 20_000, memo: '장작', shares: [b.id, c.id] } })).status).toBe(201);
    const html = await (await req('GET', `/t/${id}`)).text();
    // 1인: 민수 30,000 / 지영 40,000 / 하늘 40,000 → 민수 +60,000, 지영 -20,000, 하늘 -40,000
    expect(html).toContain('<strong>하늘</strong> → <strong>민수</strong> 40,000원');
    expect(html).toContain('<strong>지영</strong> → <strong>민수</strong> 20,000원');
    const d = await load(id);
    expect(d.expenses[0]).toMatchObject({ memo: '장작', amount: 20_000 });
    expect(d.expenses[0].shares.sort()).toEqual([b.id, c.id].sort());
  });
  it('검증: 금액·낸 사람·나눌 사람', async () => {
    const { id } = await newTrip('blank');
    const a = await join(id, '민수');
    const post = (body) => req('POST', `/api/trips/${id}/expenses`, { body });
    expect((await post({ paid_by: a.id, amount: 0, shares: [a.id] })).status).toBe(400);
    expect((await post({ paid_by: a.id, amount: 1.5, shares: [a.id] })).status).toBe(400);
    expect((await post({ paid_by: a.id, amount: 1000, shares: [] })).status).toBe(400);
    expect((await post({ amount: 1000, shares: [a.id] })).status).toBe(400);
    expect((await post({ paid_by: a.id, amount: 1000, shares: [a.id, 99999] })).status).toBe(400);
  });
  it('지출 삭제', async () => {
    const { id } = await newTrip('blank');
    const a = await join(id, '민수');
    const { id: eid } = await (await req('POST', `/api/trips/${id}/expenses`, { body: { paid_by: a.id, amount: 1000, shares: [a.id] } })).json();
    expect((await req('DELETE', `/api/trips/${id}/expenses/${eid}`)).status).toBe(204);
    expect((await load(id)).expenses).toEqual([]);
  });
});

describe('F8 되돌리기·변경 기록', () => {
  it('지운 준비물은 목록에서 빠지고 "최근 변경"에서 되살린다 (누가 했는지 남음)', async () => {
    const { id } = await newTrip();
    const m = await join(id, '민수');
    const torch = await itemByName(id, '토치');
    expect((await req('DELETE', `/api/trips/${id}/items/${torch.id}`, { body: { by: m.id } })).status).toBe(204);
    const d = await load(id);
    expect(d.items.find((i) => i.name === '토치')).toBeUndefined();
    expect(d.activity[0]).toMatchObject({ who: '민수', action: 'item_delete', target: '토치', restorable: true });
    const html = await (await req('GET', `/t/${id}`)).text();
    expect(html).toContain('<strong>민수</strong> · 지움: 토치');
    expect(html).toContain('aria-label="토치 되살리기"');
    expect((await req('POST', `/api/trips/${id}/items/${torch.id}/restore`, { body: { by: m.id } })).status).toBe(204);
    const after = await load(id);
    expect(after.items.find((i) => i.name === '토치')).toBeTruthy();
    expect(after.activity[0]).toMatchObject({ action: 'item_restore' });
    expect(after.activity.find((a) => a.action === 'item_delete').restorable).toBe(false);
    expect((await req('POST', `/api/trips/${id}/items/${torch.id}/restore`)).status).toBe(404);
  });
  it('지운 준비물은 맡을 수 없고, 다른 목록 것은 되살릴 수 없다', async () => {
    const a = await newTrip();
    const b = await newTrip();
    const m = await join(a.id, '민수');
    const tent = await itemByName(a.id, '텐트');
    await req('DELETE', `/api/trips/${a.id}/items/${tent.id}`);
    expect((await req('PATCH', `/api/trips/${a.id}/items/${tent.id}`, { body: { action: 'claim', person_id: m.id } })).status).toBe(404);
    expect((await req('POST', `/api/trips/${b.id}/items/${tent.id}/restore`)).status).toBe(404);
  });
  it('낸 돈도 지우고 되살리면 정산에 다시 들어간다', async () => {
    const { id } = await newTrip('blank');
    const [a, b] = [await join(id, '민수'), await join(id, '지영')];
    const { id: eid } = await (await req('POST', `/api/trips/${id}/expenses`, { body: { paid_by: a.id, amount: 20_000, memo: '마트', shares: [a.id, b.id] } })).json();
    await req('DELETE', `/api/trips/${id}/expenses/${eid}`, { body: { by: b.id } });
    expect((await load(id)).expenses).toEqual([]);
    expect((await load(id)).activity[0]).toMatchObject({ who: '지영', action: 'expense_delete', target: '마트 20,000원', restorable: true });
    await req('POST', `/api/trips/${id}/expenses/${eid}/restore`);
    expect(await (await req('GET', `/t/${id}`)).text()).toContain('<strong>지영</strong> → <strong>민수</strong> 10,000원');
  });
  it('남의 id 를 by 로 보내도 이름이 남지 않는다', async () => {
    const a = await newTrip('blank');
    const b = await newTrip('blank');
    const other = await join(b.id, '남');
    await req('POST', `/api/trips/${a.id}/items`, { body: { name: '물', by: other.id } });
    expect((await load(a.id)).activity[0]).toMatchObject({ who: null, action: 'item_add', target: '물' });
  });
  it('지운 것까지 합쳐 한도의 2배를 넘지 않는다 (지우고 넣기 도배 방지), 7일 지나면 정리', async () => {
    const { id } = await newTrip('blank');
    const ins = env.DB.prepare("INSERT INTO items (trip_id, name, qty, kind, created_at, deleted_at) VALUES (?, 'x', 1, 'personal', '2000-01-01', '2000-01-01T00:00:00.000Z')");
    for (let i = 0; i < 400; i++) await ins.bind(id).run();
    expect((await req('POST', `/api/trips/${id}/items`, { body: { name: 'x' } })).status).toBe(422);
    expect(await repo.purgeSoftDeleted(7)).toBe(400);
    expect((await req('POST', `/api/trips/${id}/items`, { body: { name: 'x' } })).status).toBe(201);
  });
});

describe('F9 고치기', () => {
  it('준비물 이름·수량 고치기 (기록 남음), 검증', async () => {
    const { id } = await newTrip();
    const m = await join(id, '민수');
    const chair = await itemByName(id, '캠핑 의자');
    const edit = (body) => req('PATCH', `/api/trips/${id}/items/${chair.id}`, { body: { action: 'edit', by: m.id, ...body } });
    expect((await edit({ name: '캠핑 의자', qty: 6 })).status).toBe(204);
    expect((await load(id)).activity[0]).toMatchObject({ who: '민수', action: 'item_edit', target: '캠핑 의자 수량 4 → 6' });
    expect((await edit({ name: '릴렉스 체어', qty: 6 })).status).toBe(204);
    expect(await itemByName(id, '릴렉스 체어')).toMatchObject({ qty: 6 });
    expect((await edit({ name: '', qty: 1 })).status).toBe(400);
    expect((await edit({ name: 'x', qty: 100 })).status).toBe(400);
  });
  it('목록 이름·날짜 고치기', async () => {
    const { id } = await newTrip();
    expect((await req('PATCH', `/api/trips/${id}`, { body: { name: '홍천 캠핑', starts_on: '2026-11-01' } })).status).toBe(204);
    expect((await load(id)).trip).toMatchObject({ name: '홍천 캠핑', starts_on: '2026-11-01' });
    expect((await load(id)).activity[0]).toMatchObject({ action: 'trip_edit', target: '이름 → 홍천 캠핑, 날짜 → 2026-11-01' });
    expect((await req('PATCH', `/api/trips/${id}`, { body: { name: '' } })).status).toBe(400);
  });
});

describe('F10 자동 새로고침', () => {
  it('무엇이든 바뀌면 version 이 바뀐다', async () => {
    const { id } = await newTrip();
    const v0 = (await (await req('GET', `/api/trips/${id}/version`)).json()).v;
    await new Promise((r) => setTimeout(r, 5));
    await join(id, '민수');
    const v1 = (await (await req('GET', `/api/trips/${id}/version`)).json()).v;
    expect(v1).not.toBe(v0);
    expect(await (await req('GET', `/t/${id}`)).text()).toContain(`"v":"${v1}"`);
  });
});

describe('F11 지표 화면', () => {
  it('/stats 는 검색 제외 빈 화면, 날짜별 API 는 토큰 필요', async () => {
    const html = await (await req('GET', '/stats')).text();
    expect(html).toContain('지표 토큰');
    expect(html).toContain('noindex');
    expect((await req('GET', '/api/stats/daily')).status).toBe(401);
  });
  it('날짜별: 만든 목록 / 2명 이상 / 정산까지', async () => {
    const a = await newTrip('blank');
    const b = await newTrip('blank');
    const [x, y] = [await join(a.id, '민수'), await join(a.id, '지영')];
    await join(b.id, '혼자');
    await req('POST', `/api/trips/${a.id}/expenses`, { body: { paid_by: x.id, amount: 1000, shares: [x.id, y.id] } });
    env.STATS_TOKEN = 's';
    const h = { headers: { authorization: 'Bearer s' } };
    const { days } = await (await app.request('/api/stats/daily', h, env)).json();
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ created: 2, together: 1, settled: 1 });
    expect(await (await app.request('/api/stats', h, env)).json()).toMatchObject({ '이번 주 2명 이상 함께 쓴 목록': 1 });
  });
});

describe('F5 관리 링크', () => {
  it('관리 키 없이 삭제·내보내기 → 403, 틀린 키 반복 → 429', async () => {
    const { id } = await newTrip();
    const p = await join(id, '민수');
    expect((await req('DELETE', `/api/trips/${id}/people/${p.id}`)).status).toBe(403);
    expect((await req('DELETE', `/api/trips/${id}`, { key: 'wrong' })).status).toBe(403);
    expect((await req('DELETE', `/api/trips/${id}`, { key: 'wrong' })).status).toBe(429);
  });
  it('내보낸 사람: 맡은 준비물은 풀리고, 지출은 정산에 남는다', async () => {
    const { id, adminKey: key } = await newTrip();
    const a = await join(id, '민수');
    const b = await join(id, '지영');
    const tent = await itemByName(id, '텐트');
    await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: b.id } });
    await req('POST', `/api/trips/${id}/expenses`, { body: { paid_by: b.id, amount: 10_000, shares: [a.id, b.id] } });
    expect((await req('DELETE', `/api/trips/${id}/people/${b.id}`, { key })).status).toBe(204);
    expect(await itemByName(id, '텐트')).toMatchObject({ claimed_by: null });
    const html = await (await req('GET', `/t/${id}`)).text();
    expect(html).toContain('지영 <span class="muted">(나감)</span>');
    expect(html).toContain('<strong>민수</strong> → <strong>지영</strong> 5,000원');
    // 나간 사람은 다시 맡을 수 없다
    expect((await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: b.id } })).status).toBe(400);
  });
  it('삭제한 목록은 404, 30일 뒤 영구 삭제', async () => {
    const { id, adminKey: key } = await newTrip();
    expect((await req('POST', `/api/trips/${id}/auth`, { key })).status).toBe(204);
    expect((await req('DELETE', `/api/trips/${id}`, { key })).status).toBe(204);
    expect((await req('GET', `/t/${id}`)).status).toBe(404);
    expect(await repo.purgeDeleted(30)).toBe(0);
    expect(await repo.purgeDeleted(-1)).toBe(1);
  });
});

describe('보안·운영', () => {
  it('신뢰 헤더를 지정하지 않으면 X-Forwarded-For 위조로 한도를 우회할 수 없다', async () => {
    const strict = createApp({ log: () => {}, limits: { createPerHour: 2 } });
    const DB = openD1();
    const make = (ip) => strict.request('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ name: 'x' }) }, { DB });
    const codes = [];
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) codes.push((await make(ip)).status);
    expect(codes).toEqual([201, 201, 429]);
  });
  it('쓰기 속도 제한 (IP×목록)', async () => {
    const tight = createApp({ log: () => {}, limits: { writesPerMinute: 2 }, trustProxyHeader: 'x-forwarded-for' });
    const { id } = await newTrip('blank');
    const add = (n) => tight.request(`/api/trips/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify({ name: n }) }, env);
    expect([(await add('a')).status, (await add('b')).status, (await add('c')).status]).toEqual([201, 201, 429]);
  });
  it('DB 장애: 헬스체크 503, API 는 내부 정보 없는 500', async () => {
    const db = openD1();
    const broken = createApp({ log: () => {} });
    db.close();
    expect((await broken.request('/health', {}, { DB: db })).status).toBe(503);
    const res = await broken.request('/api/trips/x', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/sqlite|stack|at /i);
  });
  it('32KB 넘는 요청은 413', async () => {
    expect((await req('POST', '/api/trips', { body: { name: 'x'.repeat(40_000) } })).status).toBe(413);
  });
  it('이름·준비물의 HTML 은 이스케이프, 데이터 블록에서 </script> 탈출 불가 (XSS)', async () => {
    const { id } = await newTrip('blank');
    await join(id, '<img src=x>');
    await req('POST', `/api/trips/${id}/items`, { body: { name: '</script><b>' } });
    const html = await (await req('GET', `/t/${id}`)).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html.match(/<\/script>/g)).toHaveLength(2); // head 의 app.js + data 블록 닫기
  });
  it('보안 헤더와 요청 ID', async () => {
    const res = await req('GET', '/');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
  it('매일 정리: 30일 지난 삭제 목록 + 180일 지난 방치 목록', async () => {
    const a = await newTrip();
    await req('DELETE', `/api/trips/${a.id}`, { key: a.adminKey });
    await env.DB.prepare("UPDATE trips SET deleted_at = '2000-01-01T00:00:00.000Z'").run();
    const b = await newTrip('blank');
    await env.DB.prepare("UPDATE trips SET created_at = '2000-01-01T00:00:00.000Z', starts_on = '2000-02-01' WHERE id = ?").bind(b.id).run();
    const c = await newTrip('blank'); // 새 목록은 남는다
    const out = [];
    await scheduled(env, (o) => out.push(o));
    expect(out[0]).toMatchObject({ event: 'daily_cleanup', purged: 1, stale: 1 });
    expect(await repo.getTrip(c.id)).toBeTruthy();
  });
  it('운영 지표 API: 토큰이 있어야 하고 숫자만 준다', async () => {
    await newTrip();
    expect((await req('GET', '/api/stats')).status).toBe(401);
    env.STATS_TOKEN = 'stats-secret';
    const res = await app.request('/api/stats', { headers: { authorization: 'Bearer stats-secret' } }, env);
    expect(await res.json()).toMatchObject({ '전체 목록': 1 });
  });
  it('로그에 관리 키·이름·원본 IP 가 남지 않는다', async () => {
    const { id, adminKey: key } = await newTrip();
    await join(id, '비밀이름');
    await req('POST', `/api/trips/${id}/auth`, { key });
    const all = JSON.stringify(logs);
    expect(all).not.toContain(key);
    expect(all).not.toContain('비밀이름');
    expect(all).not.toContain('1.1.1.1');
  });
});

describe('화면', () => {
  it('첫 화면: 템플릿 선택과 만들기 버튼', async () => {
    const html = await (await req('GET', '/')).text();
    expect(html).toContain('준비물 목록 만들기');
    for (const t of Object.values(TEMPLATES)) expect(html).toContain(t.label);
  });
  it('목록 화면: 진행률·맡은 사람 표시, 검색 제외', async () => {
    const { id } = await newTrip();
    const m = await join(id, '민수');
    const tent = await itemByName(id, '텐트');
    await req('PATCH', `/api/trips/${id}/items/${tent.id}`, { body: { action: 'claim', person_id: m.id } });
    const html = await (await req('GET', `/t/${id}`)).text();
    expect(html).toContain(`1/${TEMPLATES.camping.shared.length} 맡음`);
    expect(html).toContain('민수 맡음');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
  it('법률 문서가 렌더링되고 번들이 원문과 같다 (node scripts/gen-legal.mjs)', async () => {
    const html = await (await req('GET', '/privacy')).text();
    expect(html).toContain('<table>');
    expect(html).toContain('챙김표 운영자');
    expect(LEGAL.privacy).toBe(readFileSync('legal/privacy-policy.md', 'utf8'));
    expect(LEGAL.terms).toBe(readFileSync('legal/terms.md', 'utf8'));
  });
  it('?ref= 를 landing 이벤트로 남기고 이상한 값은 무시', async () => {
    await req('GET', '/?ref=kakao');
    await req('GET', '/?ref=<x>');
    expect(logs.filter((l) => l.event === 'landing')).toEqual([expect.objectContaining({ src: 'kakao' })]);
  });
});

describe('후원 링크', () => {
  it('SUPPORT_URL 이 없으면 숨기고, 허용한 https 주소면 이동', async () => {
    expect((await req('GET', '/support')).status).toBe(404);
    env.SUPPORT_URL = 'https://toss.me/someone';
    const res = await req('GET', '/support');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://toss.me/someone');
    env.SUPPORT_URL = 'http://toss.me/x';
    expect((await req('GET', '/support')).status).toBe(404);
  });
});

describe('F7 베타 피드백', () => {
  it('저장하면서 연락처·목록 링크를 가리고 경로는 패턴만 남긴다', async () => {
    const r = await req('POST', '/api/feedback', { body: { kind: 'idea', message: '좋아요 a@b.com 010-1234-5678 https://x.dev/t/abc123', page: '/t/abc123' } });
    expect(r.status).toBe(204);
    const [f] = await repo.listFeedback();
    expect(f.message).toBe('좋아요 [이메일 가림] [전화번호 가림] [목록 링크 가림]');
    expect(f.page).toBe('/t/:id');
  });
  it('수집 API: 토큰 없으면 401, ack 뒤에는 다시 나오지 않는다', async () => {
    await req('POST', '/api/feedback', { body: { kind: 'good' } });
    expect((await req('GET', '/api/feedback')).status).toBe(401);
    env.FEEDBACK_TOKEN = 't';
    const h = { headers: { authorization: 'Bearer t', 'content-type': 'application/json' } };
    const { items } = await (await app.request('/api/feedback', h, env)).json();
    expect(items).toHaveLength(1);
    await app.request('/api/feedback/ack', { ...h, method: 'POST', body: JSON.stringify({ upTo: items[0].id }) }, env);
    expect((await (await app.request('/api/feedback', h, env)).json()).items).toEqual([]);
  });
});

describe('운영 대시보드 공개 통계', () => {
  it('사람 방문만 세고(로봇 제외, 같은 사람 하루 1명), 비밀 경로로만 집계 숫자를 준다', async () => {
    const { publicStatsKey } = await import('../src/security.js');
    const ua = { 'user-agent': 'Mozilla/5.0 (iPhone)', 'cf-connecting-ip': '1.2.3.4' };
    await app.request('/?utm_source=threads', { headers: ua }, env);
    await app.request('/', { headers: ua }, env);
    await app.request('/', { headers: { 'user-agent': 'Mozilla/5.0 (Android)', 'cf-connecting-ip': '5.6.7.8' } }, env);
    await app.request('/', { headers: { 'user-agent': 'facebookexternalhit/1.1', 'cf-connecting-ip': '9.9.9.9' } }, env);
    env.STATS_TOKEN = 'stats-secret';
    expect((await app.request('/api/stats/p/wrong', {}, env)).status).toBe(404);
    const res = await app.request(`/api/stats/p/${publicStatsKey('stats-secret')}`, {}, env);
    expect(res.status).toBe(200);
    const s = await res.json();
    const today = s.days.at(-1);
    expect(s.days).toHaveLength(14);
    expect(today).toMatchObject({ visitors: 2, views: 3 });
    expect(s.sources).toMatchObject({ threads: 1, direct: 2 });
    expect(s.series.created).toBe('목록 만들기');
    expect(JSON.stringify(s)).not.toMatch(/1\.2\.3\.4|iPhone/);
  });
  it('STATS_TOKEN 이 없으면 꺼져 있다', async () => {
    delete env.STATS_TOKEN;
    expect((await app.request('/api/stats/p/anything', {}, env)).status).toBe(404);
  });
});
