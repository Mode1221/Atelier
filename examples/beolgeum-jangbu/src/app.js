// HTTP 라우트. 권한·검증·한도는 모두 서버에서 (spec S2).
// Cloudflare Workers 에서 돈다. DB 는 env.DB (D1), 정적 파일(public/)은 Workers 정적 자산이 먼저 처리한다.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createRepo, RepoError } from './repo.js';
import { validateGroup, validateMemberName, validateDate, validateAmount, validateFeedback } from './validate.js';
import { keyMatches, rateLimiter, hashIp, safeEqual } from './security.js';
import { homePage, groupPage, notFoundPage, docPage, feedbackPage } from './views.js';
import { LEGAL } from './legal.gen.js';

const DOCS = { privacy: ['개인정보처리방침', 'privacy'], terms: ['이용약관', 'terms'] };
export const SUPPORT_HOSTS = ['toss.me', 'qr.kakaopay.com', 'buymeacoffee.com', 'www.buymeacoffee.com', 'ko-fi.com'];

// trustProxyHeader: 클라이언트 IP 를 믿고 읽을 헤더. Cloudflare 는 'cf-connecting-ip' (wrangler.toml vars).
// 지정하지 않으면 IP 를 모르는 것으로 본다 — 헤더 위조로 속도 제한을 우회하지 못하게.
export function createApp({ log = (o) => console.log(JSON.stringify(o)), limits = {}, trustProxyHeader } = {}) {
  // 쓰기 한도는 인스턴스 메모리로(최선 노력, D1 쓰기 절약). 생성·키 실패 한도는 D1 로(모든 인스턴스 공유).
  const writeLimit = rateLimiter({ limit: limits.writesPerMinute ?? 120, windowMs: 60_000 });
  const eventLimit = rateLimiter({ limit: 30, windowMs: 3_600_000 });

  const app = new Hono();
  const ipOf = (c) => {
    const h = trustProxyHeader ?? c.env?.TRUST_PROXY_HEADER;
    return (h && c.req.header(h)?.split(',')[0].trim()) || 'unknown';
  };
  const event = (c, name, props = {}) => log({ t: new Date().toISOString(), level: 'info', event: name, req: c.get('rid'), ...props });

  app.use('*', async (c, next) => {
    const rid = c.req.header('cf-ray') ?? crypto.randomUUID();
    c.set('rid', rid);
    c.set('repo', createRepo(c.env.DB));
    const start = Date.now();
    await next();
    c.header('X-Request-Id', rid);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (c.req.path !== '/health')
      log({ t: new Date().toISOString(), level: c.res.status >= 500 ? 'error' : 'info', req: rid, method: c.req.method, path: c.req.routePath, status: c.res.status, ms: Date.now() - start, ip: hashIp(ipOf(c)) });
  });

  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: '요청이 너무 커요' }, 413) }));

  app.onError((err, c) => {
    if (err instanceof RepoError) {
      const status = { not_found: 404, duplicate: 409, conflict: 409, limit: 422, invalid: 400 }[err.code] ?? 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    log({ t: new Date().toISOString(), level: 'error', req: c.get('rid'), event: 'request_failed', error: err.message, stack: err.stack });
    return c.json({ error: '잠시 문제가 생겼어요. 다시 시도해 주세요', req: c.get('rid') }, 500);
  });

  const loadGroup = async (repo, group) => {
    const [members, sessions, payments] = await Promise.all([repo.listMembers(group.id), repo.listSessions(group.id), repo.listPayments(group.id)]);
    return { group, members, sessions, payments };
  };

  // --- 페이지
  // 후원 링크 (SUPPORT_URL). 허용한 송금·후원 서비스의 https 주소만 쓴다 — 없으면 링크를 숨긴다.
  const supportUrl = (env) => {
    try {
      const u = new URL(env?.SUPPORT_URL ?? '');
      return u.protocol === 'https:' && SUPPORT_HOSTS.includes(u.hostname) ? u.href : null;
    } catch {
      return null;
    }
  };
  const pageOpts = (c) => ({ support: !!supportUrl(c.env) });
  app.get('/support', (c) => {
    const url = supportUrl(c.env);
    if (!url) return c.html(notFoundPage(), 404);
    event(c, 'support_clicked');
    return c.redirect(url, 302);
  });

  app.get('/', (c) => {
    // 유입 경로 (?ref= 또는 utm_source) — 공유·채널별 효과를 본다
    const src = (c.req.query('ref') ?? c.req.query('utm_source') ?? '').toLowerCase();
    if (/^[a-z0-9_-]{1,32}$/.test(src)) event(c, 'landing', { src });
    return c.html(homePage(pageOpts(c)));
  });
  app.get('/g/:id', async (c) => {
    const repo = c.get('repo');
    const group = await repo.getGroup(c.req.param('id'));
    if (!group) return c.html(notFoundPage(pageOpts(c)), 404);
    event(c, 'view_link_opened');
    return c.html(groupPage(await loadGroup(repo, group), pageOpts(c)));
  });
  app.get('/:doc{privacy|terms}', (c) => {
    const [title, key] = DOCS[c.req.param('doc')];
    return c.html(docPage(title, LEGAL[key], { ...pageOpts(c), page: `/${c.req.param('doc')}` }));
  });
  // /health — 앱·DB 상태 (업타임 감시·정기 점검용). 백업은 D1 Time Travel 이 자동으로 한다.
  app.get('/health', async (c) => {
    try {
      await c.get('repo').ping();
      return c.json({ ok: true, db: 'ok' });
    } catch {
      return c.json({ ok: false, db: 'error' }, 503);
    }
  });
  // 운영 지표 (Atelier HQ "서비스 지표" 연결용). STATS_TOKEN 이 없으면 꺼져 있다.
  app.get('/api/stats', async (c) => {
    const t = c.env.STATS_TOKEN;
    if (!t || !safeEqual(c.req.header('authorization')?.replace(/^Bearer /, '') ?? '', t)) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await c.get('repo').stats());
  });

  // --- API
  const readJson = async (c) => {
    try {
      return await c.req.json();
    } catch {
      return {};
    }
  };

  app.post('/api/groups', async (c) => {
    const repo = c.get('repo');
    if (!(await repo.hit(`create:${hashIp(ipOf(c))}`, limits.createPerHour ?? 10, 3600)))
      return c.json({ error: '모임을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    const { errors, value } = validateGroup(await readJson(c));
    if (Object.keys(errors).length) return c.json({ error: '입력값을 확인해 주세요', fields: errors }, 400);
    const { id, adminKey } = await repo.createGroup(value);
    event(c, 'group_created');
    return c.json({ id, adminKey }, 201);
  });

  app.get('/api/groups/:id', async (c) => {
    const repo = c.get('repo');
    const group = await repo.getGroup(c.req.param('id'));
    if (!group) return c.json({ error: '모임을 찾을 수 없어요' }, 404);
    const { members, sessions, payments } = await loadGroup(repo, group);
    return c.json({ group: { id: group.id, name: group.name, fine_late: group.fine_late, fine_absent: group.fine_absent, fine_homework: group.fine_homework }, members, sessions, payments });
  });

  // 이 아래 쓰기 API 는 모두 관리 키 필요
  const admin = async (c, next) => {
    const repo = c.get('repo');
    const group = await repo.getGroup(c.req.param('id'));
    if (!group) return c.json({ error: '모임을 찾을 수 없어요' }, 404);
    const ipKey = `${hashIp(ipOf(c))}:${group.id}`;
    if (!keyMatches(c.req.header('x-admin-key'), group.admin_key_hash)) {
      if (!(await repo.hit(`keyfail:${ipKey}`, limits.keyFailsPer10Min ?? 20, 600))) return c.json({ error: '시도가 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
      return c.json({ error: '편집 권한이 없어요', code: 'forbidden' }, 403);
    }
    if (!(c.req.method === 'POST' && c.req.path.endsWith('/auth')) && !writeLimit(ipKey))
      return c.json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    c.set('group', group);
    await next();
  };
  const intParam = (c, name) => {
    const v = Number(c.req.param(name));
    if (!Number.isSafeInteger(v) || v <= 0) throw new RepoError('not_found', '찾을 수 없어요');
    return v;
  };
  const gid = (c) => c.get('group').id;

  app.post('/api/groups/:id/auth', admin, (c) => c.body(null, 204));

  app.post('/api/groups/:id/members', admin, async (c) => {
    const { name, error } = validateMemberName((await readJson(c)).name);
    if (error) return c.json({ error }, 400);
    const m = await c.get('repo').addMember(gid(c), name);
    event(c, 'member_added');
    return c.json(m, 201);
  });
  app.delete('/api/groups/:id/members/:mid', admin, async (c) => {
    await c.get('repo').hideMember(gid(c), intParam(c, 'mid'));
    return c.body(null, 204);
  });

  const parseSession = (body) => {
    if (!validateDate(body.date)) throw new RepoError('invalid', '날짜를 확인해 주세요');
    if (!Array.isArray(body.entries) || body.entries.length > 100) throw new RepoError('invalid', '출결 정보가 올바르지 않아요');
    const seen = new Set();
    const entries = body.entries.map((e) => {
      const member_id = Number(e?.member_id);
      if (!Number.isSafeInteger(member_id) || seen.has(member_id)) throw new RepoError('invalid', '출결 정보가 올바르지 않아요');
      seen.add(member_id);
      return { member_id, status: e.status, homework_missed: e.homework_missed === true };
    });
    return { date: body.date, entries };
  };
  app.post('/api/groups/:id/sessions', admin, async (c) => {
    const parsed = parseSession(await readJson(c));
    const s = await c.get('repo').saveSession(gid(c), parsed);
    event(c, 'session_recorded', { members: parsed.entries.length });
    return c.json(s, 201);
  });
  app.put('/api/groups/:id/sessions/:sid', admin, async (c) => {
    const body = await readJson(c);
    const s = await c.get('repo').saveSession(gid(c), {
      ...parseSession(body),
      sessionId: intParam(c, 'sid'),
      expectedUpdatedAt: typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : undefined,
    });
    event(c, 'session_recorded', { edit: true });
    return c.json(s);
  });
  app.delete('/api/groups/:id/sessions/:sid', admin, async (c) => {
    await c.get('repo').deleteSession(gid(c), intParam(c, 'sid'));
    return c.body(null, 204);
  });

  app.post('/api/groups/:id/payments', admin, async (c) => {
    const body = await readJson(c);
    const amount = validateAmount(body.amount);
    if (!amount) return c.json({ error: '1~1,000,000원 사이로 입력해 주세요' }, 400);
    const p = await c.get('repo').addPayment(gid(c), Number(body.member_id), amount);
    event(c, 'payment_recorded');
    return c.json(p, 201);
  });
  app.delete('/api/groups/:id/payments/:pid', admin, async (c) => {
    await c.get('repo').deletePayment(gid(c), intParam(c, 'pid'));
    return c.body(null, 204);
  });

  app.delete('/api/groups/:id', admin, async (c) => {
    await c.get('repo').deleteGroup(gid(c));
    event(c, 'group_deleted');
    return c.body(null, 204);
  });

  // --- 베타 피드백
  app.get('/feedback', (c) => c.html(feedbackPage({ ...pageOpts(c), from: c.req.query('from') ?? '' })));
  app.post('/api/feedback', async (c) => {
    const repo = c.get('repo');
    const body = await readJson(c);
    if (body.website) return c.body(null, 204); // 스팸 봇용 숨은 칸 — 조용히 버린다
    if (!(await repo.hit(`feedback:${hashIp(ipOf(c))}`, limits.feedbackPerHour ?? 10, 3600)))
      return c.json({ error: '잠시 후 다시 보내 주세요', code: 'rate_limited' }, 429);
    const { value, error } = validateFeedback(body);
    if (error) return c.json({ error }, 400);
    await repo.addFeedback(value);
    event(c, 'feedback_sent', { kind: value.kind, page: value.page });
    return c.body(null, 204);
  });
  // 수집 워크플로용 (FEEDBACK_TOKEN). 없으면 꺼져 있다.
  const feedbackAuth = async (c, next) => {
    const t = c.env.FEEDBACK_TOKEN;
    if (!t || !safeEqual(c.req.header('authorization')?.replace(/^Bearer /, '') ?? '', t)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  };
  app.get('/api/feedback', feedbackAuth, async (c) => c.json({ items: await c.get('repo').listFeedback() }));
  app.post('/api/feedback/ack', feedbackAuth, async (c) => {
    const upTo = Number((await readJson(c)).upTo);
    if (!Number.isSafeInteger(upTo) || upTo <= 0) return c.json({ error: 'upTo 가 필요해요' }, 400);
    return c.json({ acked: await c.get('repo').ackFeedback(upTo) });
  });

  app.post('/api/events/:name{summary_copied|shared}', (c) => {
    if (!eventLimit(ipOf(c))) return c.body(null, 204); // 지표 부풀리기 방지 — 조용히 무시
    event(c, c.req.param('name'));
    return c.body(null, 204);
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: '찾을 수 없어요' }, 404) : c.html(notFoundPage(pageOpts(c)), 404)));

  return app;
}

// 매일 한 번 (wrangler.toml crons): 삭제 30일 지난 모임 영구 삭제, 오래된 속도 제한 기록 정리
export async function scheduled(env, log = (o) => console.log(JSON.stringify(o))) {
  const repo = createRepo(env.DB);
  const n = await repo.purgeDeleted(30);
  await repo.cleanupRateLimits();
  await repo.purgeFeedback(365);
  log({ t: new Date().toISOString(), level: 'info', event: 'daily_cleanup', purged: n });
}
