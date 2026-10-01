// Atelier 상태 수집기 — GitHub Actions 가 3시간마다 실행한다 (.github/workflows/atelier-collect.yml).
// 저장소 비밀값 ATELIER_SVC_<서비스> (JSON) 로 외부 서비스를 조회하고, 결과를 데이터 브랜치의 status.json 에 쓴다.
// 대시보드(Atelier HQ)는 이 파일을 읽어 화면에 보여 준다. 키는 이 실행 안에서만 쓰이고 어디에도 기록되지 않는다.
// 이 파일은 Atelier HQ "회사 세우기"가 설치한다. 직접 고치지 말고 Atelier 에서 갱신한다.
import { pathToFileURL } from 'node:url';

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().replace('.000', '');
};
const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().replace('.000', '');
};

function makeHttp(fetchImpl) {
  return async (url, { headers = {}, timeoutMs = 10_000, raw = false } = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { headers, signal: ctrl.signal });
    } catch {
      throw new Error('연결하지 못했어요');
    } finally {
      clearTimeout(t);
    }
    if (raw) return res;
    if (res.status === 401 || res.status === 403) throw new Error('키가 올바르지 않거나 권한이 부족해요');
    if (res.status === 404) throw new Error('찾을 수 없어요 (이름을 확인해 주세요)');
    if (!res.ok) throw new Error(`서비스 오류 (${res.status})`);
    return res.json();
  };
}

// 각 서비스: 설정(JSON) → { level: good|warning|critical, headline, value?, details?, items? }
export const SERVICES = {
  async anthropic(cfg, http) {
    if (!cfg.admin_key) return null;
    let page = null;
    let cents = 0;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ starting_at: monthStart(), ending_at: tomorrow(), bucket_width: '1d', limit: '31' });
      if (page) q.set('page', page);
      const r = await http(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, { headers: { 'x-api-key': cfg.admin_key, 'anthropic-version': '2023-06-01', 'User-Agent': 'atelier-hq' } });
      for (const b of r.data ?? []) for (const x of b.results ?? []) cents += Number(x.amount) || 0;
      if (!r.has_more) break;
      page = r.next_page;
    }
    const usd = cents / 100;
    return { level: 'good', headline: `이번 달 AI 사용료 $${usd.toFixed(2)}`, value: usd };
  },
  async health(cfg, http) {
    const urls = String(cfg.urls || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u));
    const results = await Promise.all(
      urls.map(async (u) => {
        const t = Date.now();
        try {
          const r = await http(u, { raw: true, timeoutMs: 8000 });
          return { u, ok: r.ok, ms: Date.now() - t, code: r.status };
        } catch (e) {
          return { u, ok: false, ms: Date.now() - t, code: 0, error: e.message };
        }
      }),
    );
    const bad = results.filter((r) => !r.ok);
    return {
      level: bad.length ? 'critical' : 'good',
      headline: bad.length ? `${bad.length}곳이 응답하지 않아요` : `${results.length}곳 모두 정상`,
      details: results.map((r) => `${r.ok ? '정상' : '문제'} · ${r.u.replace(/^https?:\/\//, '')} · ${r.ok ? `${r.ms}ms` : r.error || `응답 ${r.code}`}`),
    };
  },
  async metrics(cfg, http) {
    const r = await http(cfg.url, { headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {} });
    const items = Object.entries(r ?? {})
      .filter(([, v]) => typeof v === 'number')
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
    return { level: 'good', headline: `지표 ${items.length}개`, items };
  },
  async sentry(cfg, http) {
    const host = (cfg.host || 'https://sentry.io').replace(/\/$/, '');
    const list = await http(`${host}/api/0/projects/${encodeURIComponent(cfg.org)}/${encodeURIComponent(cfg.project)}/issues/?query=is:unresolved&statsPeriod=24h&limit=25`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    return { level: list.length ? 'warning' : 'good', headline: list.length ? `최근 24시간 오류 ${list.length}종류` : '최근 24시간 오류 없음', value: list.length, details: list.slice(0, 5).map((i) => `${i.title} (${i.count}회)`) };
  },
  async fly(cfg, http) {
    const auth = cfg.token.startsWith('FlyV1 ') ? cfg.token : `Bearer ${cfg.token}`;
    const m = await http(`https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines`, { headers: { Authorization: auth } });
    const failed = m.filter((x) => ['failed', 'destroyed'].includes(x.state)).length;
    return { level: failed ? 'critical' : m.length ? 'good' : 'warning', headline: failed ? `서버 ${failed}대 문제` : `서버 ${m.length}대 (실행 중 ${m.filter((x) => x.state === 'started').length})` };
  },
  async vercel(cfg, http) {
    const q = new URLSearchParams({ projectId: cfg.project, limit: '5' });
    if (cfg.team) q.set('teamId', cfg.team);
    const d = (await http(`https://api.vercel.com/v6/deployments?${q}`, { headers: { Authorization: `Bearer ${cfg.token}` } })).deployments ?? [];
    const st = (x) => x.state ?? x.readyState;
    const bad = d[0] && ['ERROR', 'CANCELED'].includes(st(d[0]));
    return { level: !d[0] ? 'warning' : bad ? 'critical' : 'good', headline: !d[0] ? '배포 기록이 없어요' : bad ? '최근 배포 실패' : st(d[0]) === 'READY' ? '최근 배포 성공' : '배포 진행 중' };
  },
  async stripe(cfg, http) {
    let after = null;
    let mrr = 0;
    let count = 0;
    let cur = 'USD';
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ status: 'active', limit: '100' });
      if (after) q.set('starting_after', after);
      const r = await http(`https://api.stripe.com/v1/subscriptions?${q}`, { headers: { Authorization: `Bearer ${cfg.key}` } });
      for (const s of r.data ?? []) {
        count++;
        for (const it of s.items?.data ?? []) {
          const p = it.price ?? {};
          const perMonth = { month: 1, year: 1 / 12, week: 52 / 12, day: 365 / 12 }[p.recurring?.interval] ?? 0;
          mrr += ((p.unit_amount ?? 0) * (it.quantity ?? 1) * perMonth) / (p.recurring?.interval_count ?? 1);
          if (p.currency) cur = p.currency.toUpperCase();
        }
      }
      if (!r.has_more || !r.data?.length) break;
      after = r.data.at(-1).id;
    }
    const amount = ['KRW', 'JPY'].includes(cur) ? mrr : mrr / 100;
    return { level: 'good', headline: `유료 구독 ${count}개 · 월 반복 매출 ${Math.round(amount).toLocaleString('ko-KR')} ${cur}`, value: amount, currency: cur };
  },
};

export async function collect({ env = process.env, fetchImpl = fetch } = {}) {
  const http = makeHttp(fetchImpl);
  const out = { at: new Date().toISOString(), services: {} };
  for (const [id, fn] of Object.entries(SERVICES)) {
    const raw = env[`ATELIER_SVC_${id.toUpperCase()}`];
    if (!raw) continue;
    try {
      const s = await fn(JSON.parse(raw), http);
      if (s) out.services[id] = { summary: s };
    } catch (e) {
      out.services[id] = { error: e.message };
    }
  }
  return out;
}

// 데이터 브랜치의 status.json 갱신 (GitHub Actions 의 GITHUB_TOKEN 사용)
export async function writeStatus(status, { repo, token, fetchImpl = fetch, apiBase = 'https://api.github.com', branch = 'atelier-data' }) {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const cur = await fetchImpl(`${apiBase}/repos/${repo}/contents/status.json?ref=${branch}`, { headers: h });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetchImpl(`${apiBase}/repos/${repo}/contents/status.json`, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ message: 'chore: 서비스 상태 수집', content: Buffer.from(JSON.stringify(status, null, 2)).toString('base64'), branch, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`status.json 저장 실패 (${res.status})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await collect();
  await writeStatus(status, { repo: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN });
  console.log(`수집 완료: ${Object.keys(status.services).join(', ') || '(연결된 서비스 없음)'}`);
}
