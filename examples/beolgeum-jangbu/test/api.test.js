import { describe, it, expect, beforeEach } from 'vitest';
import { openD1 } from '../src/d1-node.js';
import { createApp, scheduled } from '../src/app.js';
import { createRepo } from '../src/repo.js';

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
const newGroup = async () => {
  const res = await req('POST', '/api/groups', { body: { name: '알고리즘 스터디', fine_late: 1000, fine_absent: 3000, fine_homework: 2000 } });
  expect(res.status).toBe(201);
  return res.json();
};

describe('F1 모임 만들기', () => {
  it('만들면 id·관리 키를 주고, 키는 해시로만 저장', async () => {
    const { id, adminKey } = await newGroup();
    expect(adminKey.length).toBeGreaterThanOrEqual(24);
    expect((await repo.getGroup(id)).admin_key_hash).not.toContain(adminKey);
  });
  it('빈 이름은 필드 오류', async () => {
    const res = await req('POST', '/api/groups', { body: { name: '', fine_late: 1000, fine_absent: 1000, fine_homework: 1000 } });
    expect(res.status).toBe(400);
    expect((await res.json()).fields.name).toBe('모임 이름을 입력해 주세요');
  });
  it('IP 당 생성 한도', async () => {
    for (let i = 0; i < 3; i++) await newGroup();
    const res = await req('POST', '/api/groups', { body: { name: 'x', fine_late: 0, fine_absent: 0, fine_homework: 0 } });
    expect(res.status).toBe(429);
  });
});

describe('F5 권한', () => {
  it('키 없이 쓰기 → 403, 틀린 키 반복 → 429', async () => {
    const { id } = await newGroup();
    expect((await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' } })).status).toBe(403);
    expect((await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key: 'wrong' })).status).toBe(403);
    expect((await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key: 'wrong' })).status).toBe(429);
  });
  it('다른 모임의 키로는 편집 불가', async () => {
    const a = await newGroup();
    const b = await newGroup();
    expect((await req('POST', `/api/groups/${b.id}/members`, { body: { name: '민수' }, key: a.adminKey })).status).toBe(403);
  });
  it('다른 모임의 멤버·회차·납부 ID 를 건드릴 수 없다 (IDOR)', async () => {
    const a = await newGroup();
    const b = await newGroup();
    const m = await (await req('POST', `/api/groups/${a.id}/members`, { body: { name: '민수' }, key: a.adminKey })).json();
    expect((await req('DELETE', `/api/groups/${b.id}/members/${m.id}`, { key: b.adminKey })).status).toBe(404);
    expect((await req('POST', `/api/groups/${b.id}/payments`, { body: { member_id: m.id, amount: 1000 }, key: b.adminKey })).status).toBe(404);
    const s = await (await req('POST', `/api/groups/${a.id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'late' }] }, key: a.adminKey })).json();
    expect((await req('DELETE', `/api/groups/${b.id}/sessions/${s.id}`, { key: b.adminKey })).status).toBe(404);
    expect((await req('POST', `/api/groups/${b.id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'late' }] }, key: b.adminKey })).status).toBe(400);
  });
  it('없는 모임 → 404 화면', async () => {
    const res = await req('GET', '/g/nope');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('모임을 찾을 수 없어요');
  });
});

describe('F2~F4 멤버·회차·정산', () => {
  it('전체 흐름: 멤버 → 회차 → 수정 → 납부 → 정산', async () => {
    const { id, adminKey: key } = await newGroup();
    const m1 = await (await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key })).json();
    const m2 = await (await req('POST', `/api/groups/${id}/members`, { body: { name: '지영' }, key })).json();
    expect((await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key })).status).toBe(409);

    const s = await (
      await req('POST', `/api/groups/${id}/sessions`, {
        body: { date: '2026-09-29', entries: [{ member_id: m1.id, status: 'late' }, { member_id: m2.id, status: 'absent', homework_missed: true }] },
        key,
      })
    ).json();
    let data = await (await req('GET', `/api/groups/${id}`)).json();
    expect(data.sessions[0].entries).toHaveLength(2);

    // 수정: 민수 출석 → 0원
    const put = await req('PUT', `/api/groups/${id}/sessions/${s.id}`, {
      body: { date: '2026-09-29', entries: [{ member_id: m1.id, status: 'present' }, { member_id: m2.id, status: 'absent', homework_missed: true }], expectedUpdatedAt: s.updated_at },
      key,
    });
    expect(put.status).toBe(200);
    // 옛 updated_at 으로 다시 수정 → 충돌
    const stale = await req('PUT', `/api/groups/${id}/sessions/${s.id}`, {
      body: { date: '2026-09-29', entries: [], expectedUpdatedAt: s.updated_at },
      key,
    });
    expect(stale.status).toBe(409);

    expect((await req('POST', `/api/groups/${id}/payments`, { body: { member_id: m2.id, amount: 3000 }, key })).status).toBe(201);
    const html = await (await req('GET', `/g/${id}`)).text();
    expect(html).toMatch(/지영<\/td>\s*<td class="num">5,000<\/td><td class="num">3,000<\/td>\s*<td class="num unpaid">2,000/);
  });
  it('규칙 스냅숏: 회차 금액은 생성 당시 규칙', async () => {
    const { id, adminKey: key } = await newGroup();
    const m = await (await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key })).json();
    await req('POST', `/api/groups/${id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'late' }] }, key });
    const data = await (await req('GET', `/api/groups/${id}`)).json();
    expect(data.sessions[0].fine_late).toBe(1000);
  });
  it('멤버 30명 한도', async () => {
    const { id, adminKey: key } = await newGroup();
    for (let i = 0; i < 30; i++) await req('POST', `/api/groups/${id}/members`, { body: { name: `m${i}` }, key });
    const res = await req('POST', `/api/groups/${id}/members`, { body: { name: 'm30' }, key });
    expect(res.status).toBe(422);
  });
  it('내보낸 멤버의 기록은 정산에 남는다', async () => {
    const { id, adminKey: key } = await newGroup();
    const m = await (await req('POST', `/api/groups/${id}/members`, { body: { name: '민수' }, key })).json();
    await req('POST', `/api/groups/${id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'absent' }] }, key });
    expect((await req('DELETE', `/api/groups/${id}/members/${m.id}`, { key })).status).toBe(204);
    const html = await (await req('GET', `/g/${id}`)).text();
    expect(html).toContain('민수 <span class="muted">(나감)</span>');
  });
});

describe('보안·운영', () => {
  it('신뢰 헤더를 지정하지 않으면 X-Forwarded-For 위조로 한도를 우회할 수 없다', async () => {
    const strict = createApp({ log: () => {}, limits: { createPerHour: 2 } });
    const DB = openD1();
    const make = (ip) =>
      strict.request(
        '/api/groups',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ name: 'x', fine_late: 0, fine_absent: 0, fine_homework: 0 }) },
        { DB },
      );
    const codes = [];
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) codes.push((await make(ip)).status);
    expect(codes).toEqual([201, 201, 429]);
  });
  it('DB 장애: 헬스체크 503, API 는 내부 정보 없는 500', async () => {
    const db = openD1();
    const broken = createApp({ log: () => {} });
    db.close();
    expect((await broken.request('/health', {}, { DB: db })).status).toBe(503);
    const res = await broken.request('/api/groups/x', {}, { DB: db });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/sqlite|stack|at /i);
  });
  it('32KB 넘는 요청은 413', async () => {
    const res = await req('POST', '/api/groups', { body: { name: 'x'.repeat(40_000) } });
    expect(res.status).toBe(413);
  });
  it('이름의 HTML 은 이스케이프된다 (XSS)', async () => {
    const { id, adminKey: key } = await newGroup();
    await req('POST', `/api/groups/${id}/members`, { body: { name: '<img src=x onerror=alert(1)>' }, key });
    const html = await (await req('GET', `/g/${id}`)).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
  it('JSON 데이터 블록에서 </script> 탈출 불가', async () => {
    const { id, adminKey: key } = await newGroup();
    await req('POST', `/api/groups/${id}/members`, { body: { name: '</script><b>' }, key });
    const html = await (await req('GET', `/g/${id}`)).text();
    expect(html.match(/<\/script>/g)).toHaveLength(2); // head 의 app.js + data 블록 닫기
  });
  it('보안 헤더와 요청 ID', async () => {
    const res = await req('GET', '/');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
  it('삭제한 모임은 404, 30일 뒤 영구 삭제', async () => {
    const { id, adminKey: key } = await newGroup();
    expect((await req('DELETE', `/api/groups/${id}`, { key })).status).toBe(204);
    expect((await req('GET', `/g/${id}`)).status).toBe(404);
    expect(await repo.purgeDeleted(30)).toBe(0);
    expect(await repo.purgeDeleted(-1)).toBe(1);
  });
  it('헬스체크', async () => {
    expect(await (await req('GET', '/health')).json()).toEqual({ ok: true, db: 'ok' });
  });
  it('매일 정리 작업: 30일 지난 삭제 모임 영구 삭제', async () => {
    const { id, adminKey: key } = await newGroup();
    await req('DELETE', `/api/groups/${id}`, { key });
    await env.DB.prepare("UPDATE groups SET deleted_at = '2000-01-01T00:00:00.000Z'").run();
    const out = [];
    await scheduled(env, (o) => out.push(o));
    expect(out[0]).toMatchObject({ event: 'daily_cleanup', purged: 1 });
  });
  it('운영 지표 API: 토큰이 있어야 하고 숫자만 준다', async () => {
    await newGroup();
    expect((await req('GET', '/api/stats')).status).toBe(401);
    env.STATS_TOKEN = 'stats-secret';
    const res = await app.request('/api/stats', { headers: { authorization: 'Bearer stats-secret' } }, env);
    expect(await res.json()).toMatchObject({ '전체 모임': 1 });
  });
  it('로그에 관리 키·멤버 이름이 남지 않는다', async () => {
    const { id, adminKey: key } = await newGroup();
    await req('POST', `/api/groups/${id}/members`, { body: { name: '비밀이름' }, key });
    const all = JSON.stringify(logs);
    expect(all).not.toContain(key);
    expect(all).not.toContain('비밀이름');
    expect(all).not.toContain('1.1.1.1');
  });
});

describe('법률 문서', () => {
  it('처리방침·약관이 표·목록과 함께 렌더링된다', async () => {
    const privacy = await (await req('GET', '/privacy')).text();
    expect(privacy).toContain('<h1>개인정보처리방침</h1>');
    expect(privacy).toContain('<th>이전 국가</th>');
    expect(privacy).toContain('<li>');
    expect((await req('GET', '/terms')).status).toBe(200);
  });
});

describe('D1 동시성·일관성', () => {
  it('회차 생성은 출결과 함께 한 번에 (다른 모임 회차와 섞이지 않음)', async () => {
    const a = await newGroup();
    const b = await newGroup();
    const ma = await (await req('POST', `/api/groups/${a.id}/members`, { body: { name: '가' }, key: a.adminKey })).json();
    const mb = await (await req('POST', `/api/groups/${b.id}/members`, { body: { name: '나' }, key: b.adminKey })).json();
    await Promise.all([
      req('POST', `/api/groups/${a.id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: ma.id, status: 'late' }] }, key: a.adminKey }),
      req('POST', `/api/groups/${b.id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: mb.id, status: 'absent' }] }, key: b.adminKey }),
    ]);
    const da = await (await req('GET', `/api/groups/${a.id}`)).json();
    const db = await (await req('GET', `/api/groups/${b.id}`)).json();
    expect(da.sessions[0].entries).toEqual([expect.objectContaining({ member_id: ma.id, status: 'late' })]);
    expect(db.sessions[0].entries).toEqual([expect.objectContaining({ member_id: mb.id, status: 'absent' })]);
  });
  it('충돌한 수정은 출결을 건드리지 않는다', async () => {
    const { id, adminKey: key } = await newGroup();
    const m = await (await req('POST', `/api/groups/${id}/members`, { body: { name: '가' }, key })).json();
    const s = await (await req('POST', `/api/groups/${id}/sessions`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'late' }] }, key })).json();
    await req('PUT', `/api/groups/${id}/sessions/${s.id}`, { body: { date: '2026-09-29', entries: [{ member_id: m.id, status: 'absent' }], expectedUpdatedAt: s.updated_at }, key });
    const stale = await req('PUT', `/api/groups/${id}/sessions/${s.id}`, { body: { date: '2026-09-29', entries: [], expectedUpdatedAt: s.updated_at }, key });
    expect(stale.status).toBe(409);
    const d = await (await req('GET', `/api/groups/${id}`)).json();
    expect(d.sessions[0].entries).toEqual([expect.objectContaining({ status: 'absent' })]);
  });
});

it('법률 문서 번들이 원문과 같다 (node scripts/gen-legal.mjs)', async () => {
  const { readFileSync } = await import('node:fs');
  const { LEGAL } = await import('../src/legal.gen.js');
  expect(LEGAL.privacy).toBe(readFileSync('legal/privacy-policy.md', 'utf8'));
  expect(LEGAL.terms).toBe(readFileSync('legal/terms.md', 'utf8'));
});

describe('R4 후원 링크', () => {
  it('SUPPORT_URL 이 없으면 링크를 숨기고 /support 는 404', async () => {
    expect(await (await req('GET', '/')).text()).not.toContain('/support');
    expect((await req('GET', '/support')).status).toBe(404);
  });
  it('허용한 https 주소면 푸터에 보이고 /support 가 이동시키며 클릭을 기록한다', async () => {
    env.SUPPORT_URL = 'https://toss.me/beolgeum';
    expect(await (await req('GET', '/')).text()).toContain('href="/support"');
    const res = await req('GET', '/support');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://toss.me/beolgeum');
    expect(logs.some((l) => l.event === 'support_clicked')).toBe(true);
  });
  it('허용하지 않은 주소·http 는 무시한다', async () => {
    for (const u of ['https://evil.example/pay', 'http://toss.me/x', 'javascript:alert(1)']) {
      env.SUPPORT_URL = u;
      expect((await req('GET', '/support')).status).toBe(404);
      expect(await (await req('GET', '/')).text()).not.toContain('/support');
    }
  });
});
