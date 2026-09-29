// 선택 연동 서비스. 각 서비스: 목적·입력 칸·키 받는 법·연결 테스트·요약.
// 요약은 { level: 'good'|'warning'|'critical', headline, details[] } — 대시보드가 그대로 보여 준다.
const monthStartIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().replace('.000', '');
};
const tomorrowIso = () => {
  const d = new Date(Date.now() + 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().replace('.000', '');
};

export const anthropic = {
  id: 'anthropic',
  name: 'Claude (AI 직원)',
  required: true,
  purpose: 'AI 부서들이 일할 때 쓰는 키예요. 관리자 키를 넣으면 이번 달 AI 사용료도 보여 드려요.',
  fields: [
    { key: 'api_key', label: 'API 키 (부서 실행용)', placeholder: 'sk-ant-api…', secret: true },
    { key: 'admin_key', label: '관리자 키 (비용 조회용, 선택)', placeholder: 'sk-ant-admin…', secret: true, optional: true },
  ],
  howTo: [
    'platform.claude.com 에 로그인해요.',
    'Settings → API keys 에서 "Create Key" 로 API 키를 만들어 복사해요.',
    '(선택) 조직 관리자라면 Settings → Admin keys 에서 관리자 키를 만들어요. 비용 조회에만 써요.',
    '"회사 세우기"를 누르면 API 키가 GitHub 에 안전하게(암호화) 등록돼요.',
  ],
  async test(cfg, http) {
    if (cfg.api_key) {
      await http('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': cfg.api_key, 'anthropic-version': '2023-06-01' } });
    }
    if (cfg.admin_key) await monthCost(cfg, http);
    return cfg.admin_key ? 'API 키와 관리자 키 모두 확인했어요' : 'API 키를 확인했어요';
  },
  async summary(cfg, http) {
    if (!cfg.admin_key) return null;
    const usd = await monthCost(cfg, http);
    return { level: 'good', headline: `이번 달 AI 사용료 $${usd.toFixed(2)}`, value: usd };
  },
};

// 비용 보고서: 금액은 센트 단위 문자열 → 달러
export async function monthCost(cfg, http) {
  let page = null;
  let cents = 0;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ starting_at: monthStartIso(), ending_at: tomorrowIso(), bucket_width: '1d', limit: '31' });
    if (page) q.set('page', page);
    const r = await http(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
      headers: { 'x-api-key': cfg.admin_key, 'anthropic-version': '2023-06-01', 'User-Agent': 'atelier-hq' },
    });
    for (const b of r.data ?? []) for (const x of b.results ?? []) cents += Number(x.amount) || 0;
    if (!r.has_more) break;
    page = r.next_page;
  }
  return cents / 100;
}

export const health = {
  id: 'health',
  name: '서비스 상태 확인',
  purpose: '서비스 주소에 주기적으로 접속해 살아 있는지 봐요. 키가 필요 없어요.',
  fields: [{ key: 'urls', label: '확인할 주소 (한 줄에 하나)', placeholder: 'https://my-service.fly.dev/health', secret: false, multiline: true }],
  howTo: ['서비스의 상태 확인 주소(보통 /health)를 적어요.', 'Atelier 로 만든 서비스라면 /health?backup=1 도 함께 넣으면 백업까지 확인해요.'],
  urls: (cfg) => String(cfg.urls || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return s.headline;
  },
  async summary(cfg, http) {
    const urls = health.urls(cfg);
    const results = await Promise.all(
      urls.map(async (u) => {
        const t = Date.now();
        try {
          const r = await http(u, { raw: true, timeoutMs: 8000 });
          return { u, ok: r.ok, ms: Date.now() - t, code: r.status };
        } catch (e) {
          return { u, ok: false, ms: Date.now() - t, code: e.status ?? 0, error: e.message };
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
};

export const sentry = {
  id: 'sentry',
  name: 'Sentry (오류 알림)',
  purpose: '사용자 화면에서 생긴 오류를 모아 보여 줘요.',
  fields: [
    { key: 'org', label: '조직 이름(slug)', placeholder: 'my-org', secret: false },
    { key: 'project', label: '프로젝트 이름(slug)', placeholder: 'my-service', secret: false },
    { key: 'token', label: '인증 토큰', placeholder: 'sntryu_…', secret: true },
    { key: 'host', label: '주소 (보통 그대로)', placeholder: 'https://sentry.io', secret: false, optional: true },
  ],
  howTo: ['sentry.io 에 로그인해요.', 'Settings → Account → Personal Tokens(또는 Auth Tokens)에서 project:read 권한 토큰을 만들어요.', '주소창의 조직·프로젝트 이름을 적어요.'],
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return s.headline;
  },
  async summary(cfg, http) {
    const host = (cfg.host || 'https://sentry.io').replace(/\/$/, '');
    const list = await http(`${host}/api/0/projects/${encodeURIComponent(cfg.org)}/${encodeURIComponent(cfg.project)}/issues/?query=is:unresolved&statsPeriod=24h&limit=25`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    return {
      level: list.length ? 'warning' : 'good',
      headline: list.length ? `최근 24시간 오류 ${list.length}종류` : '최근 24시간 오류 없음',
      value: list.length,
      details: list.slice(0, 5).map((i) => `${i.title} (${i.count}회)`),
    };
  },
};

export const fly = {
  id: 'fly',
  name: 'Fly.io (서버)',
  purpose: '서비스가 돌아가는 서버 상태를 보여 줘요.',
  fields: [
    { key: 'app', label: '앱 이름', placeholder: 'my-service', secret: false },
    { key: 'token', label: '토큰', placeholder: 'FlyV1 …', secret: true },
  ],
  howTo: ['fly.io 대시보드 → 앱 선택 → Tokens 에서 읽기 전용(또는 배포) 토큰을 만들어요.', '또는 터미널에서 fly tokens create readonly 를 실행해요.'],
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return s.headline;
  },
  async summary(cfg, http) {
    const auth = cfg.token.startsWith('FlyV1 ') ? cfg.token : `Bearer ${cfg.token}`;
    const machines = await http(`https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines`, { headers: { Authorization: auth } });
    const started = machines.filter((m) => m.state === 'started').length;
    const failed = machines.filter((m) => ['failed', 'destroyed'].includes(m.state)).length;
    return {
      level: failed ? 'critical' : machines.length ? 'good' : 'warning',
      headline: failed ? `서버 ${failed}대 문제` : machines.length ? `서버 ${machines.length}대 (실행 중 ${started}, 나머지는 대기)` : '서버가 없어요',
      details: machines.map((m) => `${m.name ?? m.id} · ${m.state} · ${m.region ?? ''}`),
    };
  },
};

export const vercel = {
  id: 'vercel',
  name: 'Vercel (웹 배포)',
  purpose: '웹사이트 최근 배포가 성공했는지 보여 줘요.',
  fields: [
    { key: 'project', label: '프로젝트 ID 또는 이름', placeholder: 'prj_…', secret: false },
    { key: 'token', label: '토큰', placeholder: '', secret: true },
    { key: 'team', label: '팀 ID (팀 계정이면)', placeholder: 'team_…', secret: false, optional: true },
  ],
  howTo: ['vercel.com → Account Settings → Tokens 에서 토큰을 만들어요.', '프로젝트 Settings → General 에서 Project ID 를 복사해요.'],
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return s.headline;
  },
  async summary(cfg, http) {
    const q = new URLSearchParams({ projectId: cfg.project, limit: '5' });
    if (cfg.team) q.set('teamId', cfg.team);
    const r = await http(`https://api.vercel.com/v6/deployments?${q}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    const d = r.deployments ?? [];
    const state = (x) => x.state ?? x.readyState;
    const last = d[0];
    const bad = last && ['ERROR', 'CANCELED'].includes(state(last));
    return {
      level: !last ? 'warning' : bad ? 'critical' : 'good',
      headline: !last ? '배포 기록이 없어요' : bad ? '최근 배포 실패' : state(last) === 'READY' ? '최근 배포 성공' : '배포 진행 중',
      details: d.map((x) => `${state(x)} · ${new Date(x.created ?? x.createdAt).toLocaleString('ko-KR')}`),
    };
  },
};

export const stripe = {
  id: 'stripe',
  name: 'Stripe (결제·매출)',
  purpose: '구독 매출(월 반복 매출, MRR)과 유료 고객 수를 보여 줘요.',
  fields: [{ key: 'key', label: '제한된 키 (읽기 전용 권장)', placeholder: 'rk_live_…', secret: true }],
  howTo: ['dashboard.stripe.com → Developers → API keys 로 가요.', '"Create restricted key" 로 Subscriptions 읽기 권한만 준 키를 만들어요. (비밀 키 sk_ 는 넣지 마세요)'],
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return s.headline;
  },
  async summary(cfg, http) {
    let after = null;
    let mrr = 0;
    let count = 0;
    const currencies = new Set();
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
          if (p.currency) currencies.add(p.currency.toUpperCase());
        }
      }
      if (!r.has_more || !r.data?.length) break;
      after = r.data.at(-1).id;
    }
    const cur = [...currencies][0] ?? 'USD';
    const zeroDecimal = ['KRW', 'JPY'].includes(cur);
    const amount = zeroDecimal ? mrr : mrr / 100;
    return {
      level: 'good',
      headline: `유료 구독 ${count}개 · 월 반복 매출 ${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} ${cur}`,
      value: amount,
      currency: cur,
    };
  },
};

export const metrics = {
  id: 'metrics',
  name: '서비스 지표',
  purpose: '서비스가 제공하는 숫자(가입자, 활성 사용자 등)를 홈에 보여 줘요.',
  fields: [
    { key: 'url', label: '지표 주소 (JSON)', placeholder: 'https://my-service.fly.dev/api/stats', secret: false },
    { key: 'token', label: '토큰 (필요하면)', placeholder: '', secret: true, optional: true },
  ],
  howTo: ['개발 부서에 "지표 주소 만들어 줘"라고 이슈를 만들면 돼요.', '주소는 {"주간 활성 모임": 12, "이번 주 가입": 30} 같은 숫자 모음을 돌려주면 돼요.'],
  async test(cfg, http) {
    const s = await this.summary(cfg, http);
    return `지표 ${s.items.length}개를 읽었어요`;
  },
  async summary(cfg, http) {
    const r = await http(cfg.url, { headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {} });
    const items = Object.entries(r ?? {})
      .filter(([, v]) => typeof v === 'number')
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
    return { level: 'good', headline: `지표 ${items.length}개`, items };
  },
};
