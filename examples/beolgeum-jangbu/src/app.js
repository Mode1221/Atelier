// HTTP 라우트. 권한·검증·한도는 모두 서버에서 (spec S2).
import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { bodyLimit } from 'hono/body-limit';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRepo, RepoError } from './repo.js';
import { validateGroup, validateMemberName, validateDate, validateAmount } from './validate.js';
import { keyMatches, rateLimiter, hashIp } from './security.js';
import { homePage, groupPage, notFoundPage, docPage } from './views.js';
import { lastBackupAgeHours } from './backup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_TYPES = { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png' };
const STATIC_FILES = new Set(['tokens.css', 'app.css', 'app.js', 'favicon.svg', 'og.png', 'apple-touch-icon.png']);
const DOCS = { privacy: ['개인정보처리방침', 'legal/privacy-policy.md'], terms: ['이용약관', 'legal/terms.md'] };

// trustProxyHeader: 클라이언트 IP 를 믿고 읽을 헤더 (예: Fly.io 는 'fly-client-ip').
// 프록시가 덮어쓰는 헤더만 지정한다. 지정하지 않으면 소켓 주소를 쓴다 — 헤더 위조로 속도 제한을 우회하지 못하게.
export function createApp({ db, log = (o) => console.log(JSON.stringify(o)), limits = {}, trustProxyHeader = process.env.TRUST_PROXY_HEADER, backupDir } = {}) {
  const repo = createRepo(db);
  const createLimit = rateLimiter({ limit: limits.createPerHour ?? 10, windowMs: 3_600_000 });
  const keyFailLimit = rateLimiter({ limit: limits.keyFailsPer10Min ?? 20, windowMs: 600_000 });
  const writeLimit = rateLimiter({ limit: limits.writesPerMinute ?? 120, windowMs: 60_000 });
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
  const event = (c, name, props = {}) => log({ t: new Date().toISOString(), level: 'info', event: name, req: c.get('rid'), ...props });

  app.use('*', async (c, next) => {
    const rid = c.req.header('x-request-id') ?? randomUUID();
    c.set('rid', rid);
    const start = performance.now();
    await next();
    c.header('X-Request-Id', rid);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const ms = Math.round(performance.now() - start);
    if (c.req.path !== '/health')
      log({ t: new Date().toISOString(), level: c.res.status >= 500 ? 'error' : 'info', req: rid, method: c.req.method, path: c.req.routePath, status: c.res.status, ms, ip: hashIp(ipOf(c)) });
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
  app.get('/', (c) => c.html(homePage()));
  app.get('/g/:id', (c) => {
    const group = repo.getGroup(c.req.param('id'));
    if (!group) return c.html(notFoundPage(), 404);
    event(c, 'view_link_opened');
    return c.html(groupPage(loadGroup(group)));
  });
  app.get('/:doc{privacy|terms}', (c) => {
    const [title, file] = DOCS[c.req.param('doc')];
    return c.html(docPage(title, readFileSync(join(ROOT, file), 'utf8')));
  });
  app.get('/static/:file', (c) => {
    const file = c.req.param('file');
    if (!STATIC_FILES.has(file)) return c.notFound();
    if (!staticCache.has(file)) staticCache.set(file, readFileSync(join(ROOT, 'public', file)));
    c.header('Content-Type', STATIC_TYPES[file.split('.').pop()]);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(staticCache.get(file));
  });
  // /health          — 앱·DB 상태 (업타임 감시용)
  // /health?backup=1 — 최근 백업이 26시간 넘으면 503 (정기 점검용: 외부에서 볼 수 없는 볼륨 백업 확인)
  app.get('/health', (c) => {
    let db = 'ok';
    try {
      repo.ping();
    } catch {
      db = 'error';
    }
    const body = { ok: db === 'ok', db };
    if (c.req.query('backup') !== undefined) {
      const h = backupDir ? lastBackupAgeHours(backupDir) : Infinity;
      body.backup_age_hours = Number.isFinite(h) ? Math.round(h * 10) / 10 : null;
      if (!(h <= 26)) body.ok = false;
    }
    return c.json(body, body.ok ? 200 : 503);
  });
  app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /g/\nDisallow: /api/\n'));

  // --- API
  const readJson = async (c) => {
    try {
      return await c.req.json();
    } catch {
      return {};
    }
  };

  app.post('/api/groups', async (c) => {
    if (!createLimit(ipOf(c))) return c.json({ error: '모임을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    const { errors, value } = validateGroup(await readJson(c));
    if (Object.keys(errors).length) return c.json({ error: '입력값을 확인해 주세요', fields: errors }, 400);
    const { id, adminKey } = repo.createGroup(value);
    event(c, 'group_created');
    return c.json({ id, adminKey }, 201);
  });

  app.get('/api/groups/:id', (c) => {
    const group = repo.getGroup(c.req.param('id'));
    if (!group) return c.json({ error: '모임을 찾을 수 없어요' }, 404);
    const { members, sessions, payments } = loadGroup(group);
    return c.json({ group: { id: group.id, name: group.name, fine_late: group.fine_late, fine_absent: group.fine_absent, fine_homework: group.fine_homework }, members, sessions, payments });
  });

  // 이 아래 쓰기 API 는 모두 관리 키 필요
  const admin = async (c, next) => {
    const group = repo.getGroup(c.req.param('id'));
    if (!group) return c.json({ error: '모임을 찾을 수 없어요' }, 404);
    const ipKey = `${hashIp(ipOf(c))}:${group.id}`;
    if (!keyMatches(c.req.header('x-admin-key'), group.admin_key_hash)) {
      if (!keyFailLimit(ipKey)) return c.json({ error: '시도가 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
      return c.json({ error: '편집 권한이 없어요', code: 'forbidden' }, 403);
    }
    if (c.req.method !== 'POST' || !c.req.path.endsWith('/auth')) {
      if (!writeLimit(ipKey)) return c.json({ error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요', code: 'rate_limited' }, 429);
    }
    c.set('group', group);
    await next();
  };
  const intParam = (c, name) => {
    const v = Number(c.req.param(name));
    if (!Number.isSafeInteger(v) || v <= 0) throw new RepoError('not_found', '찾을 수 없어요');
    return v;
  };

  app.post('/api/groups/:id/auth', admin, (c) => c.body(null, 204));

  app.post('/api/groups/:id/members', admin, async (c) => {
    const { name, error } = validateMemberName((await readJson(c)).name);
    if (error) return c.json({ error }, 400);
    const m = repo.addMember(c.get('group').id, name);
    event(c, 'member_added');
    return c.json(m, 201);
  });
  app.delete('/api/groups/:id/members/:mid', admin, (c) => {
    repo.hideMember(c.get('group').id, intParam(c, 'mid'));
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
    const s = repo.saveSession(c.get('group').id, parsed);
    event(c, 'session_recorded', { members: parsed.entries.length });
    return c.json(s, 201);
  });
  app.put('/api/groups/:id/sessions/:sid', admin, async (c) => {
    const body = await readJson(c);
    const s = repo.saveSession(c.get('group').id, {
      ...parseSession(body),
      sessionId: intParam(c, 'sid'),
      expectedUpdatedAt: typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : undefined,
    });
    event(c, 'session_recorded', { edit: true });
    return c.json(s);
  });
  app.delete('/api/groups/:id/sessions/:sid', admin, (c) => {
    repo.deleteSession(c.get('group').id, intParam(c, 'sid'));
    return c.body(null, 204);
  });

  app.post('/api/groups/:id/payments', admin, async (c) => {
    const body = await readJson(c);
    const amount = validateAmount(body.amount);
    if (!amount) return c.json({ error: '1~1,000,000원 사이로 입력해 주세요' }, 400);
    const p = repo.addPayment(c.get('group').id, Number(body.member_id), amount);
    event(c, 'payment_recorded');
    return c.json(p, 201);
  });
  app.delete('/api/groups/:id/payments/:pid', admin, (c) => {
    repo.deletePayment(c.get('group').id, intParam(c, 'pid'));
    return c.body(null, 204);
  });

  app.delete('/api/groups/:id', admin, (c) => {
    repo.deleteGroup(c.get('group').id);
    event(c, 'group_deleted');
    return c.body(null, 204);
  });

  const eventLimit = rateLimiter({ limit: 30, windowMs: 3_600_000 });
  app.post('/api/events/:name{summary_copied}', (c) => {
    if (!eventLimit(ipOf(c))) return c.body(null, 204); // 지표 부풀리기 방지 — 조용히 무시
    event(c, c.req.param('name'));
    return c.body(null, 204);
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: '찾을 수 없어요' }, 404) : c.html(notFoundPage(), 404)));

  function loadGroup(group) {
    return { group, members: repo.listMembers(group.id), sessions: repo.listSessions(group.id), payments: repo.listPayments(group.id) };
  }

  return { app, repo };
}
