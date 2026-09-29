import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { makeFakeWorld, GOOD } from './fakes.js';

const ORIGIN = 'http://hq.test';
const PROJECT = '# 앱\n\n## 현재 단계\n- 단계: 6 출시 / L5\n\n## 사람 할 일\n- [ ] 호스팅 계정 만들기 — B12\n\n## 로드맵\n- [ ] I1\n';
let app, world, store, cookie;

async function req(method, path, { form, json, headers = {}, noCookie = false } = {}) {
  const h = { ...headers };
  if (cookie && !noCookie) h.cookie = cookie;
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    h['content-type'] = 'application/x-www-form-urlencoded';
    h.origin ??= ORIGIN;
  }
  if (json) {
    body = JSON.stringify(json);
    h['content-type'] = 'application/json';
  }
  const res = await app.request(ORIGIN + path, { method, headers: h, body, redirect: 'manual' });
  const set = res.headers.get('set-cookie');
  if (set?.startsWith('hq_session=')) cookie = set.split(';')[0];
  return res;
}
const flash = (res) => decodeURIComponent(new URL(res.headers.get('location'), ORIGIN).searchParams.get('ok') ?? new URL(res.headers.get('location'), ORIGIN).searchParams.get('err') ?? '');

beforeEach(async () => {
  cookie = null;
  world = await makeFakeWorld({ projectMd: PROJECT });
  ({ app, store } = createApp({ db: openDb(':memory:'), key: Buffer.alloc(32, 1), fetchImpl: world.fetch, log: () => {}, workflowYaml: 'name: Atelier company\n' }));
});

async function setupAndConnect() {
  await req('POST', '/setup', { form: { company: '테스트 컴퍼니', password: 'correct-horse-1', password2: 'correct-horse-1' } });
  let r = await req('POST', '/connect/github', { form: { repo: 'o/r', token: GOOD } });
  expect(flash(r)).toContain('연결됨');
  r = await req('POST', '/connect/anthropic', { form: { api_key: 'sk-ant-api-good', admin_key: '' } });
  expect(flash(r)).toContain('연결됨');
}

describe('첫 설정·로그인·보안', () => {
  it('설정 전에는 /setup 으로, 설정 후 로그인 없이는 /login 으로', async () => {
    expect((await req('GET', '/')).headers.get('location')).toBe('/setup');
    await req('POST', '/setup', { form: { company: 'x', password: 'correct-horse-1', password2: 'correct-horse-1' } });
    cookie = null;
    expect((await req('GET', '/')).headers.get('location')).toBe('/login');
    expect((await req('GET', '/api/budget/dev')).status).toBe(401);
  });
  it('짧은 비밀번호·불일치 거부, 두 번째 setup 은 로그인으로', async () => {
    expect(flash(await req('POST', '/setup', { form: { password: 'short', password2: 'short' } }))).toContain('10자');
    expect(flash(await req('POST', '/setup', { form: { password: 'correct-horse-1', password2: 'different-horse' } }))).toContain('서로 달라요');
    await req('POST', '/setup', { form: { password: 'correct-horse-1', password2: 'correct-horse-1' } });
    expect((await req('POST', '/setup', { form: { password: 'hijack-password', password2: 'hijack-password' } })).headers.get('location')).toBe('/login');
  });
  it('로그인 실패 10회 후 잠금', async () => {
    await req('POST', '/setup', { form: { password: 'correct-horse-1', password2: 'correct-horse-1' } });
    cookie = null;
    for (let i = 0; i < 10; i++) await req('POST', '/login', { form: { password: 'wrong' } });
    expect(flash(await req('POST', '/login', { form: { password: 'correct-horse-1' } }))).toContain('15분');
  });
  it('다른 출처·Origin 없음·null 인 폼 POST 는 거부 (CSRF)', async () => {
    await setupAndConnect();
    for (const origin of ['https://evil.example', 'null']) {
      expect((await req('POST', '/depts/dev/pause', { form: {}, headers: { origin } })).status).toBe(403);
    }
    const noOrigin = await app.request(ORIGIN + '/depts/dev/pause', { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'manual' });
    expect(noOrigin.status).toBe(403);
  });
  it('Referrer-Policy 는 same-origin (no-referrer 면 브라우저가 Origin: null 을 보낸다)', async () => {
    expect((await req('GET', '/setup')).headers.get('referrer-policy')).toBe('same-origin');
  });
  it('세션 쿠키는 HttpOnly·SameSite=Strict', async () => {
    const r = await req('POST', '/setup', { form: { password: 'correct-horse-1', password2: 'correct-horse-1' } });
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(r.headers.get('set-cookie')).toMatch(/SameSite=Strict/i);
  });
  it('저장한 키는 화면·DB 에 평문으로 남지 않는다', async () => {
    await setupAndConnect();
    const html = await (await req('GET', '/connect/github')).text();
    expect(html).not.toContain(GOOD);
    expect(html).toContain('저장됨 — 바꾸려면 새로 입력');
  });
  it('비밀 칸을 비워 저장하면 기존 키 유지', async () => {
    await setupAndConnect();
    const r = await req('POST', '/connect/github', { form: { repo: 'o/r', token: '' } });
    expect(flash(r)).toContain('연결됨');
    expect(store.getSecret('github').token).toBe(GOOD);
  });
  it('틀린 키는 저장하지 않고 이유를 알려 준다', async () => {
    await req('POST', '/setup', { form: { password: 'correct-horse-1', password2: 'correct-horse-1' } });
    const r = await req('POST', '/connect/github', { form: { repo: 'o/r', token: 'bad' } });
    expect(flash(r)).toContain('키가 올바르지 않거나 권한이 부족해요');
    expect(store.getSecret('github')).toBeNull();
  });
});

describe('회사 세우기', () => {
  it('라벨·워크플로·변수·암호화된 비밀값을 GitHub 에 설치', async () => {
    await setupAndConnect();
    const r = await req('POST', '/company/bootstrap', { form: {} });
    expect(flash(r)).toContain('회사를 세웠어요');
    const s = world.state;
    expect(s.labels.has('dept:marketing')).toBe(true);
    expect(s.labels.has('approval-needed')).toBe(true);
    expect(s.files['.github/workflows/atelier-company.yml'].text).toBe('name: Atelier company\n');
    expect(s.variables.ATELIER_HQ_URL).toBe(ORIGIN);
    expect(s.secrets.ANTHROPIC_API_KEY).toBe('sk-ant-api-good');
    expect(s.secrets.ATELIER_HQ_TOKEN).toBe(store.get('ingestToken'));
    // 두 번 눌러도 안전 (이미 있는 라벨·변수)
    expect(flash(await req('POST', '/company/bootstrap', { form: {} }))).toContain('이미 최신');
  });
});

describe('결재·업무·부서', () => {
  beforeEach(async () => {
    await setupAndConnect();
    await req('POST', '/company/bootstrap', { form: {} });
  });
  it('결재함: 요청 요약을 보여 주고, 승인하면 라벨·댓글', async () => {
    const n = world.addIssue('로그인 기능 배포', ['dept:dev', 'approval-needed']);
    world.state.comments[n].push({ body: '[결재 요청] 카카오 로그인을 사용자에게 내보내기\n종류: 배포\n금액: 없음\n승인하면: 오늘 배포\n반려하면: 보류' });
    const html = await (await req('GET', '/approvals')).text();
    expect(html).toContain('카카오 로그인을 사용자에게 내보내기');
    expect(html).toContain('오늘 배포');
    expect(flash(await req('POST', `/approvals/${n}/approve`, { form: {} }))).toContain('승인했어요');
    const i = world.state.issues.find((x) => x.number === n);
    expect(i.labels.map((l) => l.name)).toEqual(['dept:dev', 'approved']);
    expect(world.state.comments[n].at(-1).body).toContain('대표 승인');
  });
  it('반려는 이유가 있어야 한다', async () => {
    const n = world.addIssue('광고 집행', ['dept:marketing', 'approval-needed']);
    expect(flash(await req('POST', `/approvals/${n}/reject`, { form: { reason: '' } }))).toContain('이유');
    await req('POST', `/approvals/${n}/reject`, { form: { reason: '예산이 커요' } });
    expect(world.state.comments[n].at(-1).body).toContain('예산이 커요');
  });
  it('홈: 결재 대기면 "확인할 일", 대표 할 일은 PROJECT.md 에서', async () => {
    world.addIssue('x', ['dept:dev', 'approval-needed']);
    const html = await (await req('GET', '/')).text();
    expect(html).toContain('확인할 일이 있어요');
    expect(html).toContain('호스팅 계정 만들기 — B12');
    expect(html).toContain('6 출시 / L5');
  });
  it('대표 할 일 완료 → PROJECT.md 커밋', async () => {
    await req('POST', '/tasks/done', { form: { text: '호스팅 계정 만들기 — B12' } });
    expect(world.state.files['PROJECT.md'].text).toContain('- [x] 호스팅 계정 만들기 — B12');
  });
  it('새 일 맡기기 → 부서 라벨이 붙은 이슈', async () => {
    await req('POST', '/board/new', { form: { title: '가입 버튼 색 바꾸기', dept: 'design', body: '' } });
    const i = world.state.issues.at(-1);
    expect(i.labels.map((l) => l.name)).toEqual(['dept:design', 'status:todo']);
    const html = await (await req('GET', '/board')).text();
    expect(html).toContain('가입 버튼 색 바꾸기');
  });
  it('지금 일하기 → workflow_dispatch', async () => {
    expect(flash(await req('POST', '/depts/qa/run', { form: {} }))).toContain('지금 실행');
    expect(world.state.dispatches.at(-1)).toEqual({ ref: 'main', inputs: { dept: 'qa' } });
  });
});

describe('워크플로 API (예산·실행 기록)', () => {
  let token;
  beforeEach(async () => {
    await setupAndConnect();
    token = store.get('ingestToken');
  });
  const auth = () => ({ authorization: `Bearer ${token}` });
  it('토큰 없거나 틀리면 401', async () => {
    expect((await req('GET', '/api/budget/dev', { noCookie: true })).status).toBe(401);
    expect((await req('GET', '/api/budget/dev', { noCookie: true, headers: { authorization: 'Bearer nope' } })).status).toBe(401);
  });
  it('실행 비용이 쌓여 예산을 넘으면 allowed=false', async () => {
    expect(await (await req('GET', '/api/budget/dev', { headers: auth() })).json()).toMatchObject({ allowed: true, budget_usd: 10 });
    await req('POST', '/api/ingest/run', { json: { dept: 'dev', status: 'success', cost_usd: 6, url: 'https://github.com/o/r/actions/runs/1' }, headers: auth() });
    await req('POST', '/api/ingest/run', { json: { dept: 'dev', status: 'success', cost_usd: 4.5 }, headers: auth() });
    expect(await (await req('GET', '/api/budget/dev', { headers: auth() })).json()).toMatchObject({ allowed: false, spent_usd: 10.5 });
    const html = await (await req('GET', '/depts')).text();
    expect(html).toContain('$10.50');
  });
  it('쉬게 한 부서는 allowed=false', async () => {
    await req('POST', '/depts/marketing/pause', { form: {} });
    expect(await (await req('GET', '/api/budget/marketing', { headers: auth() })).json()).toMatchObject({ allowed: false, paused: true });
  });
  it('이상한 입력은 걸러낸다 (부서·URL·비용)', async () => {
    expect((await req('POST', '/api/ingest/run', { json: { dept: 'hacker' }, headers: auth() })).status).toBe(400);
    await req('POST', '/api/ingest/run', { json: { dept: 'qa', status: '<script>', cost_usd: -5, url: 'javascript:alert(1)' }, headers: auth() });
    const run = store.lastRuns(1)[0];
    expect(run).toMatchObject({ status: 'unknown', cost_usd: 0, url: null });
  });
});

describe('XSS', () => {
  it('이슈 제목·결재 요약의 HTML 은 이스케이프', async () => {
    await setupAndConnect();
    const n = world.addIssue('<img src=x onerror=alert(1)>', ['dept:dev', 'approval-needed']);
    world.state.comments[n].push({ body: '[결재 요청] <script>alert(1)</script>' });
    const html = (await (await req('GET', '/approvals')).text()) + (await (await req('GET', '/board')).text());
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
  });
});
