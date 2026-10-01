// HTTP 라우트. 권한·검증·한도는 모두 서버에서 (docs/spec.md S2).
// Cloudflare Workers 에서 돈다. DB 는 env.DB (D1), 정적 파일(public/)은 Workers 정적 자산이 먼저 처리한다.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createRepo, RepoError } from './repo.js';
import { validateTrip, validatePersonName, validateItem, validateExpense, validateFeedback } from './validate.js';
import { keyMatches, rateLimiter, hashIp, safeEqual, publicStatsKey, visitorId } from './security.js';
import { homePage, tripPage, notFoundPage, docPage, feedbackPage, statsPage } from './views.js';
import { LEGAL } from './legal.gen.js';

const DOCS = { privacy: ['개인정보처리방침', 'privacy'], terms: ['이용약관', 'terms'] };
export const SUPPORT_HOSTS = ['toss.me', 'qr.kakaopay.com', 'buymeacoffee.com', 'www.buymeacoffee.com', 'ko-fi.com'];

// trustProxyHeader: 클라이언트 IP 를 믿고 읽을 헤더. Cloudflare 는 'cf-connecting-ip' (wrangler.toml vars).
export function createApp({ log = (o) => console.log(JSON.stringify(o)), limits = {}, trustProxyHeader } = {}) {
  // 쓰기 한도는 인스턴스 메모리(최선 노력, D1 쓰기 절약). 생성·키 실패 한도는 D1(모든 인스턴스 공유).
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

  // --- 페이지
  // 후원 링크 (SUPPORT_URL). 허용한 송금·후원 서비스의 https 주소만 — 없으면 링크를 숨긴다.
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

  // 방문 집계: 사람이 연 페이지만 (링크 미리보기·검색 로봇 제외). 실패해도 화면에는 영향 없음.
  const BOT = /bot|crawl|spider|slurp|preview|scrap|facebookexternalhit|embed|headless|lighthouse/i;
  const KST = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const countVisit = (c, src) => {
    const ua = c.req.header('user-agent') ?? '';
    if (!ua || BOT.test(ua)) return;
    const date = KST();
    const job = c.get('repo').recordVisit(date, visitorId(ipOf(c), ua, date), src).catch(() => {});
    try { c.executionCtx.waitUntil(job); } catch { /* 테스트 등 실행 문맥 없음 */ }
    return job;
  };
  app.get('/', async (c) => {
    const src = (c.req.query('ref') ?? c.req.query('utm_source') ?? '').toLowerCase();
    const ok = /^[a-z0-9_-]{1,32}$/.test(src);
    if (ok) event(c, 'landing', { src });
    await countVisit(c, ok ? src : 'direct');
    return c.html(homePage(pageOpts(c)));
  });
  app.get('/t/:id', async (c) => {
    const repo = c.get('repo');
    const trip = await repo.getTrip(c.req.param('id'));
    if (!trip) return c.html(notFoundPage(pageOpts(c)), 404);
    event(c, 'trip_opened');
    await countVisit(c, null);
    return c.html(tripPage({ trip, ...(await repo.load(trip.id)) }, pageOpts(c)));
  });
  app.get('/:doc{privacy|terms}', (c) => {
    const [title, key] = DOCS[c.req.param('doc')];
    return c.html(docPage(title, LEGAL[key], { ...pageOpts(c), page: `/${c.req.param('doc')}` }));
  });
  app.get('/health', async (c) => {
    try {
      await c.get('repo').ping();
      return c.json({ ok: true, db: 'ok' });
    } catch {
      return c.json({ ok: false, db: 'error' }, 503);
    }
  });
  // 운영 지표 (AI 회사 "지표" 연결용). STATS_TOKEN 이 없으면 꺼져 있다.
  app.get('/api/stats', async (c) => {
    const t = c.env.STATS_TOKEN;
    if (!t || !safeEqual(c.req.header('authorization')?.replace(/^Bearer /, '') ?? '', t)) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await c.get('repo').stats());
  });
  app.get('/api/stats/daily', async (c) => {
    const t = c.env.STATS_TOKEN;
    if (!t || !safeEqual(c.req.header('authorization')?.replace(/^Bearer /, '') ?? '', t)) return c.json({ error: 'unauthorized' }, 401);
    return c.json({ days: await c.get('repo').daily(14) });
  });
  // 공개 통계 (운영 대시보드가 읽는다): 집계 숫자만, 주소의 비밀 경로로 보호. STATS_TOKEN 이 없으면 꺼져 있다.
  app.get('/api/stats/p/:key', async (c) => {
    const t = c.env.STATS_TOKEN;
    if (!t || !safeEqual(c.req.param('key'), publicStatsKey(t))) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
    return c.json(await c.get('repo').publicStats(14));
  });
  // 지표 화면 — 토큰은 주소의 #t= 조각(서버로 안 감)이나 입력칸으로 받아 브라우저가 헤더로 보낸다
  app.get('/stats', (c) => c.html(statsPage(pageOpts(c))));

  // --- API
  const readJson = async (c) => {
    try {
      return await c.req.json();
    } catch {
      return {};
    }
  };
  const intParam = (c, name) => {
    const v = Number(c.req.param(name));
    if (!Number.isSafeInteger(v) || v <= 0) throw new RepoError('not_found', '찾을 수 없어요');
    return v;
  };

  app.post('/api/trips', async (c) => {
    const repo = c.get('repo');
    if (!(await repo.hit(`create:${hashIp(ipOf(c))}`, limits.createPerHour ?? 10, 3600)))
      return c.json({ error: '목록을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    const { errors, value } = validateTrip(await readJson(c));
    if (Object.keys(errors).length) return c.json({ error: '입력값을 확인해 주세요', fields: errors }, 400);
    const { id, adminKey } = await repo.createTrip(value);
    event(c, 'trip_created', { template: value.template });
    return c.json({ id, adminKey }, 201);
  });

  // 링크를 가진 사람은 누구나 참여·편집 (가입 없음). 쓰기는 IP×목록 단위로 속도 제한.
  const member = async (c, next) => {
    const repo = c.get('repo');
    const trip = await repo.getTrip(c.req.param('id'));
    if (!trip) return c.json({ error: '목록을 찾을 수 없어요' }, 404);
    if (c.req.method !== 'GET' && !writeLimit(`${hashIp(ipOf(c))}:${trip.id}`))
      return c.json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    c.set('trip', trip);
    await next();
  };
  // 관리 키: 목록 삭제·사람 내보내기만
  const admin = async (c, next) => {
    const trip = c.get('trip');
    if (!keyMatches(c.req.header('x-admin-key'), trip.admin_key_hash)) {
      if (!(await c.get('repo').hit(`keyfail:${hashIp(ipOf(c))}:${trip.id}`, limits.keyFailsPer10Min ?? 20, 600)))
        return c.json({ error: '시도가 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
      return c.json({ error: '관리 권한이 없어요', code: 'forbidden' }, 403);
    }
    await next();
  };
  const tid = (c) => c.get('trip').id;
  // 누가 했는지 (브라우저가 기억하는 "나"). 이 목록의 참여자가 아니면 기록에 이름이 남지 않는다
  const byOf = (body) => {
    const v = Number(body?.by);
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  };

  app.get('/api/trips/:id', member, async (c) => {
    const t = c.get('trip');
    return c.json({ trip: { id: t.id, name: t.name, starts_on: t.starts_on }, ...(await c.get('repo').load(t.id)) });
  });
  app.post('/api/trips/:id/auth', member, admin, (c) => c.body(null, 204));
  // 자동 새로고침용: 마지막으로 바뀐 시각만 (D1 읽기 1번)
  app.get('/api/trips/:id/version', member, (c) => {
    const t = c.get('trip');
    return c.json({ v: t.updated_at ?? t.created_at });
  });
  app.patch('/api/trips/:id', member, async (c) => {
    const body = await readJson(c);
    const { errors, value } = validateTrip(body);
    if (Object.keys(errors).length) return c.json({ error: Object.values(errors)[0], fields: errors }, 400);
    await c.get('repo').updateTrip(tid(c), value, byOf(body));
    event(c, 'trip_edited');
    return c.body(null, 204);
  });

  app.post('/api/trips/:id/people', member, async (c) => {
    const { name, error } = validatePersonName((await readJson(c)).name);
    if (error) return c.json({ error }, 400);
    const p = await c.get('repo').addPerson(tid(c), name);
    event(c, 'person_joined');
    return c.json(p, 201);
  });
  app.delete('/api/trips/:id/people/:pid', member, admin, async (c) => {
    await c.get('repo').hidePerson(tid(c), intParam(c, 'pid'));
    return c.body(null, 204);
  });

  app.post('/api/trips/:id/items', member, async (c) => {
    const body = await readJson(c);
    const { value, error } = validateItem(body);
    if (error) return c.json({ error }, 400);
    const item = await c.get('repo').addItem(tid(c), value, byOf(body));
    event(c, 'item_added', { kind: value.kind });
    return c.json(item, 201);
  });
  app.patch('/api/trips/:id/items/:iid', member, async (c) => {
    const body = await readJson(c);
    if (body.action === 'edit') {
      const { value, error } = validateItem(body);
      if (error) return c.json({ error }, 400);
      await c.get('repo').editItem(tid(c), intParam(c, 'iid'), value, byOf(body));
      event(c, 'item_edit');
      return c.body(null, 204);
    }
    const person_id = Number(body.person_id);
    if (!Number.isSafeInteger(person_id) || person_id <= 0) return c.json({ error: '내 이름을 먼저 골라 주세요' }, 400);
    const item = await c.get('repo').updateItem(tid(c), intParam(c, 'iid'), { action: body.action, person_id, packed: body.packed === true });
    event(c, `item_${body.action}`);
    return c.json(item);
  });
  app.delete('/api/trips/:id/items/:iid', member, async (c) => {
    await c.get('repo').deleteItem(tid(c), intParam(c, 'iid'), byOf(await readJson(c)));
    event(c, 'item_delete');
    return c.body(null, 204);
  });
  app.post('/api/trips/:id/items/:iid/restore', member, async (c) => {
    await c.get('repo').restoreItem(tid(c), intParam(c, 'iid'), byOf(await readJson(c)));
    event(c, 'item_restore');
    return c.body(null, 204);
  });

  app.post('/api/trips/:id/expenses', member, async (c) => {
    const body = await readJson(c);
    const { value, error } = validateExpense(body);
    if (error) return c.json({ error }, 400);
    const e = await c.get('repo').addExpense(tid(c), value, byOf(body) ?? value.paid_by);
    event(c, 'expense_added', { people: value.shares.length });
    return c.json(e, 201);
  });
  app.delete('/api/trips/:id/expenses/:eid', member, async (c) => {
    await c.get('repo').deleteExpense(tid(c), intParam(c, 'eid'), byOf(await readJson(c)));
    return c.body(null, 204);
  });
  app.post('/api/trips/:id/expenses/:eid/restore', member, async (c) => {
    await c.get('repo').restoreExpense(tid(c), intParam(c, 'eid'), byOf(await readJson(c)));
    event(c, 'expense_restore');
    return c.body(null, 204);
  });

  app.delete('/api/trips/:id', member, admin, async (c) => {
    await c.get('repo').deleteTrip(tid(c));
    event(c, 'trip_deleted');
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
  // 의견 가져오기용 (FEEDBACK_TOKEN — npm run deploy:first 가 만든다). 없으면 꺼져 있다.
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

// 매일 한 번 (wrangler.toml crons): 삭제 30일 지난 목록·오래 방치된 목록, 되살리기 7일 지난 준비물·지출 영구 삭제, 속도 제한 기록 정리
export async function scheduled(env, log = (o) => console.log(JSON.stringify(o))) {
  const repo = createRepo(env.DB);
  const deleted = await repo.purgeDeleted(30);
  const stale = await repo.purgeStale(180);
  const softDeleted = await repo.purgeSoftDeleted(7);
  await repo.cleanupRateLimits();
  await repo.purgeFeedback(365);
  await repo.purgeVisits(30);
  log({ t: new Date().toISOString(), level: 'info', event: 'daily_cleanup', purged: deleted, stale, softDeleted });
}
