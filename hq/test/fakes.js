// 테스트용 가짜 외부 서비스 (GitHub·Claude·Sentry·Fly·Vercel·Stripe·헬스). fetch 로도, HTTP 서버로도 쓴다.
import sodium from 'libsodium-wrappers';
import { createServer } from 'node:http';

export const GOOD = 'good-token';

export async function makeFakeWorld({ projectMd = null } = {}) {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  const s = {
    issues: [],
    comments: {},
    labels: new Set(),
    files: {},
    branches: {},
    variables: {},
    secrets: {},
    dispatches: [],
    nextId: 1,
    keypair: kp,
  };
  if (projectMd) s.files['PROJECT.md'] = { text: projectMd, sha: 'sha0' };
  const addIssue = (title, labels = [], body = '', state = 'open') => {
    const n = s.nextId++;
    s.issues.push({ number: n, title, body, state, labels: labels.map((name) => ({ name })), html_url: `https://github.com/o/r/issues/${n}`, updated_at: new Date().toISOString() });
    s.comments[n] = [];
    return n;
  };
  const json = (status, body) => ({ status, body });

  function handle(method, url, headers, body) {
    const u = new URL(url);
    const p = u.pathname;
    const host = u.host;
    const auth = headers.authorization ?? headers.Authorization ?? headers['x-api-key'];
    // --- Claude
    if (host === 'api.anthropic.com') {
      const k = headers['x-api-key'];
      if (p === '/v1/models') return k === 'sk-ant-api-good' ? json(200, { data: [] }) : json(401, {});
      if (p === '/v1/organizations/cost_report') {
        if (k !== 'sk-ant-admin-good') return json(401, {});
        if (u.searchParams.get('page') === 'p2') return json(200, { data: [{ results: [{ amount: '250.5', currency: 'USD' }] }], has_more: false });
        return json(200, { data: [{ results: [{ amount: '1000', currency: 'USD' }] }, { results: [{ amount: '99.5', currency: 'USD' }] }], has_more: true, next_page: 'p2' });
      }
    }
    if (host === 'sentry.io') return auth === `Bearer ${GOOD}` ? json(200, [{ title: 'TypeError: x is undefined', count: '12' }]) : json(401, {});
    if (host === 'api.machines.dev') return auth === `Bearer ${GOOD}` ? json(200, [{ id: 'm1', name: 'app-1', state: 'started', region: 'nrt' }, { id: 'm2', state: 'stopped', region: 'nrt' }]) : json(401, {});
    if (host === 'api.vercel.com') return auth === `Bearer ${GOOD}` ? json(200, { deployments: [{ state: 'ERROR', created: Date.now() }, { state: 'READY', created: Date.now() - 1e6 }] }) : json(401, {});
    if (host === 'api.stripe.com') {
      if (auth !== `Bearer ${GOOD}`) return json(401, {});
      const price = (amount, interval) => ({ unit_amount: amount, currency: 'usd', recurring: { interval, interval_count: 1 } });
      return json(200, { data: [{ id: 'sub1', items: { data: [{ quantity: 1, price: price(900, 'month') }] } }, { id: 'sub2', items: { data: [{ quantity: 2, price: price(12000, 'year') }] } }], has_more: false });
    }
    if (host === 'status.example.com') return p === '/health' ? json(200, { ok: true }) : json(503, { ok: false });
    if (host === 'metrics.example.com') return json(200, { '주간 활성 모임': 12, '이번 주 가입': 30, note: 'text is ignored' });

    // --- GitHub
    if (host !== 'api.github.com') return json(404, {});
    if (auth !== `Bearer ${GOOD}`) return json(401, { message: 'Bad credentials' });
    let m;
    if ((m = p.match(/^\/repos\/([^/]+)\/([^/]+)$/))) return json(200, { full_name: `${m[1]}/${m[2]}`, default_branch: 'main', permissions: { push: true } });
    const rest = p.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    if (rest === '/issues' && method === 'GET') {
      const state = u.searchParams.get('state');
      return json(200, s.issues.filter((i) => i.state === state));
    }
    if (rest === '/issues' && method === 'POST') {
      const n = addIssue(body.title, body.labels, body.body);
      return json(201, s.issues.find((i) => i.number === n));
    }
    if ((m = rest.match(/^\/issues\/(\d+)\/comments$/))) {
      const n = Number(m[1]);
      if (method === 'POST') {
        s.comments[n].push({ body: body.body });
        return json(201, {});
      }
      return json(200, s.comments[n] ?? []);
    }
    if ((m = rest.match(/^\/issues\/(\d+)\/labels$/)) && method === 'POST') {
      const i = s.issues.find((x) => x.number === Number(m[1]));
      for (const name of body.labels) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
      return json(200, i.labels);
    }
    if ((m = rest.match(/^\/issues\/(\d+)\/labels\/(.+)$/)) && method === 'DELETE') {
      const i = s.issues.find((x) => x.number === Number(m[1]));
      const name = decodeURIComponent(m[2]);
      if (!i.labels.some((l) => l.name === name)) return json(404, {});
      i.labels = i.labels.filter((l) => l.name !== name);
      return json(200, i.labels);
    }
    if (rest === '/pulls') return json(200, []);
    if ((m = rest.match(/^\/actions\/workflows\/([^/]+)\/runs/))) return s.files[`.github/workflows/${decodeURIComponent(m[1])}`] ? json(200, { workflow_runs: [] }) : json(404, {});
    if ((m = rest.match(/^\/actions\/workflows\/([^/]+)\/dispatches$/))) {
      if (!s.files[`.github/workflows/${decodeURIComponent(m[1])}`]) return json(404, {});
      s.dispatches.push(body);
      return json(204, null);
    }
    if ((m = rest.match(/^\/contents\/(.+)$/))) {
      const path = decodeURIComponent(m[1]);
      const ref = method === 'GET' ? u.searchParams.get('ref') : body?.branch;
      const store = ref && ref !== 'main' ? s.branches[ref] : s.files;
      if (!store) return json(404, {});
      if (method === 'GET') {
        const f = store[path];
        return f ? json(200, { sha: f.sha, content: Buffer.from(f.text).toString('base64') }) : json(404, {});
      }
      if (method === 'PUT') {
        const f = store[path];
        if (f && body.sha !== f.sha) return json(409, { message: 'sha mismatch' });
        store[path] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: `sha${s.nextId++}` };
        return json(f ? 200 : 201, {});
      }
    }
    // git 데이터 API (데이터 브랜치)
    if ((m = rest.match(/^\/git\/trees\/([^/?]+)$/)) && method === 'GET') {
      const b = s.branches[decodeURIComponent(m[1])];
      return b ? json(200, { tree: Object.keys(b).map((path) => ({ path, type: 'blob' })) }) : json(404, {});
    }
    if (rest === '/git/trees' && method === 'POST') {
      const id = `tree${s.nextId++}`;
      s.pendingTrees ??= {};
      s.pendingTrees[id] = Object.fromEntries(body.tree.map((t) => [t.path, { text: t.content, sha: `sha${s.nextId++}` }]));
      return json(201, { sha: id });
    }
    if (rest === '/git/commits' && method === 'POST') return json(201, { sha: body.tree });
    if (rest === '/git/refs' && method === 'POST') {
      const name = body.ref.replace('refs/heads/', '');
      if (s.branches[name]) return json(422, {});
      s.branches[name] = s.pendingTrees[body.sha];
      return json(201, {});
    }
    if (rest.startsWith('/actions/secrets') && method === 'GET' && !rest.endsWith('public-key')) return json(200, { secrets: Object.keys(s.secrets).map((name) => ({ name })) });
    if ((m = rest.match(/^\/actions\/secrets\/(.+)$/)) && method === 'DELETE') {
      delete s.secrets[m[1]];
      return json(204, null);
    }
    if (rest === '/labels' && method === 'POST') {
      if (s.labels.has(body.name)) return json(422, {});
      s.labels.add(body.name);
      return json(201, {});
    }
    if (rest === '/actions/variables' && method === 'POST') {
      if (s.variables[body.name] != null) return json(409, {});
      s.variables[body.name] = body.value;
      return json(201, {});
    }
    if ((m = rest.match(/^\/actions\/variables\/(.+)$/)) && method === 'PATCH') {
      s.variables[m[1]] = body.value;
      return json(204, null);
    }
    if (rest === '/actions/secrets/public-key') return json(200, { key_id: 'kid1', key: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL) });
    if ((m = rest.match(/^\/actions\/secrets\/(.+)$/)) && method === 'PUT') {
      const plain = sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value, sodium.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey);
      s.secrets[m[1]] = sodium.to_string(plain);
      return json(201, {});
    }
    return json(404, { message: `fake: ${method} ${p}` });
  }

  const fetchImpl = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    const r = handle(opts.method ?? 'GET', url, opts.headers ?? {}, body);
    return new Response(r.body == null ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };

  // HTTP 서버 모드 (E2E): Host 헤더 대신 경로 앞부분 /__host/<host> 로 구분
  function listen(port) {
    const srv = createServer((req, res) => {
      let data = '';
      req.on('data', (d) => (data += d));
      req.on('end', () => {
        const [, , host, ...pathParts] = req.url.split('/');
        const url = `https://${host}/${pathParts.join('/')}`;
        const lower = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]));
        const r = handle(req.method, url, lower, data ? JSON.parse(data) : null);
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(r.body == null ? '' : JSON.stringify(r.body));
      });
    });
    return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok(srv)));
  }

  return { state: s, addIssue, fetch: fetchImpl, listen, handle };
}
