// Atelier HQ 라우트. 화면은 HTML 폼 + 리디렉트로 동작 (JS 없어도 됨).
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getConnInfo } from '@hono/node-server/conninfo';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { newToken, safeEqual } from './crypto.js';
import { makeHttp, ServiceError } from './services/http.js';
import { SERVICES, serviceById, createCache } from './services/index.js';
import { githubClient } from './services/github.js';
import { DEPTS, DEPT_IDS, WORKFLOW_FILE, buildBoard, loadApprovals, parseHumanTasks, markHumanTaskDone, currentStage, overallStatus, bootstrap } from './company.js';
import * as V from './views.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { 'app.css': 'text/css', 'app.js': 'text/javascript', 'favicon.svg': 'image/svg+xml' };
const DEFAULT_BUDGET = 10; // 부서별 월 USD

export function createApp({ db, key, fetchImpl, log = (o) => console.log(JSON.stringify(o)), trustProxyHeader = process.env.TRUST_PROXY_HEADER, workflowYaml } = {}) {
  const store = createStore(db, key);
  const http = makeHttp(fetchImpl);
  const cache = createCache();
  const yaml = workflowYaml ?? readFileSync(join(ROOT, 'templates', 'company.yml'), 'utf8');
  const loginFails = new Map();
  const staticCache = new Map();
  const app = new Hono();

  const ipOf = (c) => {
    if (trustProxyHeader) return c.req.header(trustProxyHeader)?.split(',')[0].trim() || 'unknown';
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };
  const settings = () => ({
    company: store.get('company', '우리 회사'),
    publicUrl: store.get('publicUrl', ''),
    rate: store.get('rate', 1400),
    budgets: { ...Object.fromEntries(DEPTS.map((d) => [d.id, DEFAULT_BUDGET])), ...store.get('budgets', {}) },
    paused: store.get('paused', []),
    bootstrappedAt: store.get('bootstrappedAt'),
  });
  const ghCfg = () => store.getSecret('github');
  const gh = () => {
    const cfg = ghCfg();
    return cfg ? githubClient(http, cfg) : null;
  };
  const back = (c, path, msg, kind = 'ok') => c.redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`, 303);

  // --- 공통: 보안 헤더, 로그
  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin'); // no-referrer 면 브라우저가 폼 POST 에 Origin: null 을 보내 CSRF 확인이 막힌다
    c.header('X-Frame-Options', 'DENY');
    c.header('Cache-Control', c.req.path.startsWith('/static/') ? 'public, max-age=3600' : 'no-store');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (c.req.path !== '/health') log({ t: new Date().toISOString(), method: c.req.method, path: c.req.routePath, status: c.res.status, ms: Math.round(performance.now() - start) });
  });

  app.get('/static/:f', (c) => {
    const f = c.req.param('f');
    if (!STATIC[f]) return c.notFound();
    if (!staticCache.has(f)) staticCache.set(f, readFileSync(join(ROOT, 'public', f)));
    c.header('Content-Type', STATIC[f]);
    return c.body(staticCache.get(f));
  });
  app.get('/health', (c) => c.json({ ok: true }));

  // --- 워크플로가 호출하는 API (Bearer 토큰)
  const bearerOk = (c) => {
    const t = store.get('ingestToken');
    return !!t && safeEqual(c.req.header('authorization')?.replace(/^Bearer /, ''), t);
  };
  app.get('/api/budget/:dept', (c) => {
    if (!bearerOk(c)) return c.json({ error: 'unauthorized' }, 401);
    const dept = c.req.param('dept');
    if (!DEPT_IDS.has(dept)) return c.json({ error: 'unknown dept' }, 404);
    const s = settings();
    const spent = store.monthSpend()[dept]?.usd ?? 0;
    const allowed = !s.paused.includes(dept) && spent < s.budgets[dept];
    return c.json({ dept, allowed, spent_usd: spent, budget_usd: s.budgets[dept], paused: s.paused.includes(dept) });
  });
  app.post('/api/ingest/run', async (c) => {
    if (!bearerOk(c)) return c.json({ error: 'unauthorized' }, 401);
    const b = await c.req.json().catch(() => ({}));
    if (!DEPT_IDS.has(b.dept)) return c.json({ error: 'unknown dept' }, 400);
    const cost = Number(b.cost_usd);
    const url = typeof b.url === 'string' && /^https:\/\/github\.com\//.test(b.url) ? b.url : null;
    store.addRun({ dept: b.dept, status: ['success', 'failure', 'cancelled', 'skipped'].includes(b.status) ? b.status : 'unknown', cost_usd: Number.isFinite(cost) && cost >= 0 ? cost : 0, url });
    return c.json({ ok: true }, 201);
  });

  // --- 첫 설정 · 로그인
  const isLoggedIn = (c) => store.validSession(getCookie(c, 'hq_session'));
  const secure = (c) => new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
  const startSession = (c) =>
    setCookie(c, 'hq_session', store.createSession(), { httpOnly: true, sameSite: 'Strict', secure: secure(c), path: '/', maxAge: 14 * 86400 });

  // 폼 POST 는 같은 출처에서만 (CSRF 방어: SameSite=Strict 쿠키 + Origin 확인)
  app.use('*', async (c, next) => {
    if (c.req.method === 'POST' && !c.req.path.startsWith('/api/')) {
      // Origin 이 없거나(null 포함) 다른 출처면 거부 — 세션 쿠키 SameSite=Strict 와 이중 방어
      const origin = c.req.header('origin');
      const allowed = [new URL(c.req.url).origin, settings().publicUrl.replace(/\/$/, '')].filter(Boolean);
      if (!origin || !allowed.includes(origin)) return c.text('잘못된 요청이에요', 403);
    }
    await next();
  });

  app.get('/setup', (c) => (store.hasOwner() ? c.redirect('/login') : c.html(V.setupPage({ err: c.req.query('err') }))));
  app.post('/setup', async (c) => {
    if (store.hasOwner()) return c.redirect('/login', 303);
    const f = await c.req.parseBody();
    const pw = String(f.password ?? '');
    if (pw.length < 10) return back(c, '/setup', '비밀번호는 10자 이상으로 정해 주세요', 'err');
    if (pw !== f.password2) return back(c, '/setup', '비밀번호가 서로 달라요', 'err');
    store.setOwnerPassword(pw);
    store.set('company', String(f.company || '우리 회사').slice(0, 40));
    store.set('publicUrl', new URL(c.req.url).origin);
    store.set('ingestToken', newToken());
    store.audit('setup');
    startSession(c);
    return back(c, '/connect', '회사가 만들어졌어요. 이제 GitHub 와 Claude 를 연결해 주세요');
  });
  app.get('/login', (c) => (store.hasOwner() ? c.html(V.loginPage({ err: c.req.query('err') })) : c.redirect('/setup')));
  app.post('/login', async (c) => {
    const ip = ipOf(c);
    const rec = loginFails.get(ip);
    if (rec && rec.n >= 10 && Date.now() - rec.at < 15 * 60_000) return back(c, '/login', '시도가 너무 많아요. 15분 뒤 다시 시도해 주세요', 'err');
    const f = await c.req.parseBody();
    if (!store.checkPassword(f.password ?? '')) {
      loginFails.set(ip, { n: (rec && Date.now() - rec.at < 15 * 60_000 ? rec.n : 0) + 1, at: Date.now() });
      return back(c, '/login', '비밀번호가 맞지 않아요', 'err');
    }
    loginFails.delete(ip);
    startSession(c);
    return c.redirect('/', 303);
  });
  app.post('/logout', (c) => {
    store.endSession(getCookie(c, 'hq_session'));
    deleteCookie(c, 'hq_session', { path: '/' });
    return c.redirect('/login', 303);
  });

  // --- 이 아래는 로그인 필요
  app.use('*', async (c, next) => {
    if (!store.hasOwner()) return c.redirect('/setup');
    if (!isLoggedIn(c)) return c.redirect('/login');
    await next();
  });
  const page = (c, fn) => c.html(fn({ s: settings(), ok: c.req.query('ok'), err: c.req.query('err'), path: c.req.path }));

  async function loadCompany() {
    const g = gh();
    if (!g) return { connected: false };
    const out = { connected: true, issues: [], approvals: [], humanTasks: [], stage: null, githubError: null, workflowRuns: [] };
    try {
      out.issues = await cache.get('issues', () => g.issues());
      out.approvals = await cache.get('approvals', () => loadApprovals(g, out.issues));
      const project = await cache.get('project', () => g.file('PROJECT.md'));
      out.humanTasks = parseHumanTasks(project?.text);
      out.stage = currentStage(project?.text);
      out.workflowRuns = (await cache.get('runs', () => g.workflowRuns(WORKFLOW_FILE))).workflow_runs ?? [];
    } catch (e) {
      out.githubError = e instanceof ServiceError ? e.message : '알 수 없는 오류';
    }
    return out;
  }
  async function loadServices() {
    const connected = new Set(store.connectedServices().map((r) => r.service));
    return Promise.all(
      SERVICES.filter((s) => s.summary && connected.has(s.id)).map(async (s) => {
        try {
          const summary = await cache.get(`svc:${s.id}`, () => s.summary(store.getSecret(s.id), http));
          return { id: s.id, name: s.name, summary };
        } catch (e) {
          return { id: s.id, name: s.name, error: e instanceof ServiceError ? e.message : '확인 실패' };
        }
      }),
    );
  }
  function spending(services) {
    const s = settings();
    const perDept = store.monthSpend();
    const runsTotal = Object.values(perDept).reduce((a, r) => a + r.usd, 0);
    const budgetTotal = Object.values(s.budgets).reduce((a, b) => a + b, 0);
    const orgCost = services.find((x) => x.id === 'anthropic')?.summary?.value;
    return { perDept, runsTotal, budgetTotal, orgCost, ratio: budgetTotal ? runsTotal / budgetTotal : 0 };
  }

  app.get('/', async (c) => {
    const [co, services] = await Promise.all([loadCompany(), loadServices()]);
    const spend = spending(services);
    const alerts = co.issues?.filter((i) => i.state === 'open' && i.labels?.some((l) => (l.name ?? l) === 'ops-alert')).length ?? 0;
    const status = co.connected ? overallStatus({ serviceSummaries: services, approvals: co.approvals, alerts, budgetRatio: spend.ratio, githubError: co.githubError }) : null;
    const connected = new Set(store.connectedServices().map((r) => r.service));
    return page(c, (p) => V.homePage({ ...p, co, services, spend, status, connected, lastRuns: store.lastRunByDept(), board: co.connected ? buildBoard(co.issues) : null }));
  });

  app.get('/approvals', async (c) => {
    const co = await loadCompany();
    return page(c, (p) => V.approvalsPage({ ...p, co }));
  });
  app.post('/approvals/:n/:action{approve|reject}', async (c) => {
    const g = gh();
    if (!g) return back(c, '/connect', '먼저 GitHub 를 연결해 주세요', 'err');
    const n = Number(c.req.param('n'));
    const approve = c.req.param('action') === 'approve';
    const f = await c.req.parseBody();
    const reason = String(f.reason ?? '').trim().slice(0, 1000);
    if (!approve && !reason) return back(c, '/approvals', '반려 이유를 한 줄 적어 주세요 — 담당 부서가 보고 고쳐요', 'err');
    try {
      await g.removeLabel(n, 'approval-needed');
      await g.addLabels(n, [approve ? 'approved' : 'rejected']);
      await g.comment(n, approve ? '✅ **대표 승인** (Atelier HQ)' : `↩️ **대표 반려** (Atelier HQ)\n\n반려 이유: ${reason}`);
    } catch (e) {
      return back(c, '/approvals', `처리하지 못했어요: ${e.message}`, 'err');
    }
    store.audit(approve ? 'approve' : 'reject', { issue: n });
    cache.clear();
    return back(c, '/approvals', approve ? `#${n} 승인했어요. 담당 부서가 곧 진행해요` : `#${n} 반려했어요`);
  });

  app.get('/board', async (c) => {
    const co = await loadCompany();
    return page(c, (p) => V.boardPage({ ...p, co, board: co.connected && !co.githubError ? buildBoard(co.issues) : null }));
  });
  app.post('/board/new', async (c) => {
    const g = gh();
    if (!g) return back(c, '/connect', '먼저 GitHub 를 연결해 주세요', 'err');
    const f = await c.req.parseBody();
    const title = String(f.title ?? '').trim().slice(0, 200);
    const dept = String(f.dept ?? 'ceo');
    if (!title) return back(c, '/board', '무엇을 해야 하는지 적어 주세요', 'err');
    if (!DEPT_IDS.has(dept)) return back(c, '/board', '부서를 골라 주세요', 'err');
    const body = `${String(f.body ?? '').trim()}\n\n— 대표 지시 (Atelier HQ)`;
    try {
      await g.createIssue(title, body, [`dept:${dept}`, 'status:todo']);
    } catch (e) {
      return back(c, '/board', `만들지 못했어요: ${e.message}`, 'err');
    }
    store.audit('task', { dept });
    cache.clear();
    return back(c, '/board', `${DEPTS.find((d) => d.id === dept).name} 부서에 일을 맡겼어요`);
  });

  app.get('/depts', async (c) => {
    const co = await loadCompany();
    return page(c, (p) => V.deptsPage({ ...p, co, spend: spending([]), lastRuns: store.lastRunByDept(), runs: store.lastRuns(50) }));
  });
  app.post('/depts/:id/run', async (c) => {
    const id = c.req.param('id');
    const g = gh();
    if (!DEPT_IDS.has(id) || !g) return back(c, '/depts', '먼저 GitHub 를 연결해 주세요', 'err');
    try {
      const repo = await g.repoInfo();
      await g.dispatch(WORKFLOW_FILE, repo.default_branch, { dept: id });
    } catch (e) {
      return back(c, '/depts', e.status === 404 ? '회사가 아직 세워지지 않았어요. 연결 화면에서 "회사 세우기"를 눌러 주세요' : `실행하지 못했어요: ${e.message}`, 'err');
    }
    store.audit('run', { dept: id });
    return back(c, '/depts', `${DEPTS.find((d) => d.id === id).name} 부서를 지금 실행했어요. 몇 분 뒤 결과가 보여요`);
  });
  app.post('/depts/:id/pause', async (c) => {
    const id = c.req.param('id');
    if (!DEPT_IDS.has(id)) return c.notFound();
    const paused = new Set(settings().paused);
    const was = paused.has(id);
    was ? paused.delete(id) : paused.add(id);
    store.set('paused', [...paused]);
    store.audit(was ? 'resume' : 'pause', { dept: id });
    return back(c, '/depts', `${DEPTS.find((d) => d.id === id).name} 부서를 ${was ? '다시 시작' : '쉬게'} 했어요`);
  });

  app.post('/tasks/done', async (c) => {
    const g = gh();
    if (!g) return back(c, '/', '먼저 GitHub 를 연결해 주세요', 'err');
    const text = String((await c.req.parseBody()).text ?? '');
    try {
      const f = await g.file('PROJECT.md');
      const next = f && markHumanTaskDone(f.text, text);
      if (!next) return back(c, '/', '그 할 일을 찾지 못했어요 (이미 완료됐을 수 있어요)', 'err');
      await g.putFile('PROJECT.md', next, `docs: 대표 할 일 완료 — ${text.slice(0, 50)}`, f.sha);
    } catch (e) {
      return back(c, '/', `저장하지 못했어요: ${e.message}`, 'err');
    }
    store.audit('human_task_done', { text });
    cache.clear();
    return back(c, '/', '완료로 표시했어요');
  });

  // --- 연결
  app.get('/connect', (c) => {
    const connected = new Map(store.connectedServices().map((r) => [r.service, r.updated_at]));
    return page(c, (p) => V.connectPage({ ...p, services: SERVICES, connected }));
  });
  app.get('/connect/:id', (c) => {
    const svc = serviceById[c.req.param('id')];
    if (!svc) return c.notFound();
    const cur = store.getSecret(svc.id) ?? {};
    return page(c, (p) => V.connectServicePage({ ...p, svc, cur }));
  });
  app.post('/connect/:id', async (c) => {
    const svc = serviceById[c.req.param('id')];
    if (!svc) return c.notFound();
    const f = await c.req.parseBody();
    const prev = store.getSecret(svc.id) ?? {};
    const cfg = {};
    for (const fld of svc.fields) {
      const v = String(f[fld.key] ?? '').trim();
      cfg[fld.key] = v || (fld.secret ? prev[fld.key] ?? '' : ''); // 비밀 칸을 비워 두면 기존 값 유지
      if (!cfg[fld.key] && !fld.optional) return back(c, `/connect/${svc.id}`, `"${fld.label}" 칸을 채워 주세요`, 'err');
    }
    if (svc.id === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) return back(c, '/connect/github', '저장소는 "소유자/이름" 형식이에요 (예: Mode1221/my-service)', 'err');
    let msg;
    try {
      msg = await svc.test(cfg, http);
    } catch (e) {
      return back(c, `/connect/${svc.id}`, `연결 확인 실패: ${e instanceof ServiceError ? e.message : '알 수 없는 오류'}`, 'err');
    }
    store.saveSecret(svc.id, cfg);
    store.audit('connect', { service: svc.id });
    cache.clear();
    return back(c, '/connect', `${svc.name} 연결됨 — ${msg}`);
  });
  app.post('/connect/:id/remove', (c) => {
    const svc = serviceById[c.req.param('id')];
    if (!svc) return c.notFound();
    store.deleteSecret(svc.id);
    store.audit('disconnect', { service: svc.id });
    cache.clear();
    return back(c, '/connect', `${svc.name} 연결을 해제했어요`);
  });
  app.post('/company/bootstrap', async (c) => {
    const g = gh();
    if (!g) return back(c, '/connect', '먼저 GitHub 를 연결해 주세요', 'err');
    const s = settings();
    try {
      const steps = await bootstrap({ gh: g, workflowYaml: yaml, hqUrl: s.publicUrl, hqToken: store.get('ingestToken'), anthropicKey: store.getSecret('anthropic')?.api_key });
      store.set('bootstrappedAt', new Date().toISOString());
      store.audit('bootstrap', steps);
      cache.clear();
      return back(c, '/connect', `회사를 세웠어요: ${steps.join(' · ')}`);
    } catch (e) {
      return back(c, '/connect', `회사 세우기 실패: ${e.message} — GitHub 토큰 권한(Workflows·Secrets·Variables)을 확인해 주세요`, 'err');
    }
  });

  // --- 설정
  app.get('/settings', (c) => page(c, (p) => V.settingsPage({ ...p, audit: store.recentAudit(30) })));
  app.post('/settings', async (c) => {
    const f = await c.req.parseBody();
    const company = String(f.company ?? '').trim().slice(0, 40);
    if (company) store.set('company', company);
    const url = String(f.publicUrl ?? '').trim().replace(/\/$/, '');
    if (url && !/^https?:\/\/[^\s/]+$/.test(url)) return back(c, '/settings', '대시보드 주소는 https://… 형식이에요 (경로 없이)', 'err');
    if (url) store.set('publicUrl', url);
    const rate = Number(f.rate);
    if (rate > 0 && rate < 100000) store.set('rate', rate);
    const budgets = {};
    for (const d of DEPTS) {
      const v = Number(f[`budget_${d.id}`]);
      if (Number.isFinite(v) && v >= 0 && v <= 10000) budgets[d.id] = v;
    }
    store.set('budgets', budgets);
    store.audit('settings');
    return back(c, '/settings', '저장했어요');
  });
  app.post('/settings/password', async (c) => {
    const f = await c.req.parseBody();
    if (!store.checkPassword(f.current ?? '')) return back(c, '/settings', '지금 비밀번호가 맞지 않아요', 'err');
    const pw = String(f.password ?? '');
    if (pw.length < 10) return back(c, '/settings', '새 비밀번호는 10자 이상으로 정해 주세요', 'err');
    if (pw !== f.password2) return back(c, '/settings', '새 비밀번호가 서로 달라요', 'err');
    store.setOwnerPassword(pw);
    store.audit('password');
    startSession(c);
    return back(c, '/settings', '비밀번호를 바꿨어요. 다른 기기는 로그아웃됐어요');
  });
  app.post('/settings/rotate-token', (c) => {
    store.set('ingestToken', newToken());
    store.audit('rotate_token');
    return back(c, '/connect', '연결 토큰을 새로 만들었어요. "회사 세우기"를 다시 눌러 GitHub 에 반영해 주세요');
  });

  app.get('/help', (c) => page(c, (p) => V.helpPage(p)));

  app.notFound((c) => c.html(V.notFoundPage(), 404));
  app.onError((err, c) => {
    log({ t: new Date().toISOString(), level: 'error', error: err.message, stack: err.stack });
    return c.html(V.errorPage(), 500);
  });

  return { app, store };
}
