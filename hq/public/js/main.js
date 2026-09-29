// Atelier HQ (서버 없음) — 화면 전환·데이터 불러오기·버튼 처리.
import { githubClient, GhError, DATA_BRANCH } from './gh.js';
import { DEPTS, DEPT_IDS, WORKFLOW_FILE, buildBoard, loadApprovals, parseHumanTasks, markHumanTaskDone, currentStage, overallStatus } from './company.js';
import { normalizeSettings, parseRuns, bootstrap, saveSettings, parseShares, markShared } from './hqdata.js';
import { SERVICES } from './services.js';
import * as V from './views.js';

// 테스트에서만 쓰는 주소 바꾸기 (가짜 GitHub). 일반 사용자는 건드릴 일이 없다.
const cfgGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const API = cfgGet('hq.apiBase') || 'https://api.github.com';
const ANTHROPIC = cfgGet('hq.anthropicBase') || 'https://api.anthropic.com';

const AUTH_KEY = 'hq.auth';
function loadAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}
function saveAuth(a, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(a));
  } catch {
    /* 저장 불가(사생활 보호 모드 등) — 이번 탭에서만 동작 */
  }
}
function clearAuth() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* 무시 */
  }
}

let auth = loadAuth();
let gh = auth ? githubClient({ ...auth, apiBase: API }) : null;
let flashMsg = {};
let cache = null; // { at, data }

const app = document.getElementById('app');
const route = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

async function loadAll(force = false) {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.data;
  const [issues, project, paths, hqFile, statusFile, secrets, info] = await Promise.all([
    gh.issues(),
    gh.file('PROJECT.md'),
    gh.dataPaths(),
    gh.file('hq.json', DATA_BRANCH).catch(() => null),
    gh.file('status.json', DATA_BRANCH).catch(() => null),
    gh.secretNames().catch(() => []),
    gh.repoInfo(),
  ]);
  const approvals = await loadApprovals(gh, issues);
  let settings = normalizeSettings(null);
  try {
    settings = normalizeSettings(JSON.parse(hqFile?.text ?? 'null'));
  } catch {
    /* 손상된 설정 → 기본값 */
  }
  let status = { services: {} };
  try {
    status = JSON.parse(statusFile?.text ?? '{"services":{}}');
  } catch {
    /* 무시 */
  }
  const runs = parseRuns((paths ?? []).filter((p) => p.startsWith('runs/')));
  // 홍보 글 (없어도 된다)
  let share = { spec: null, specErr: null };
  const shareFile = await gh.file(settings.sharePath).catch(() => null);
  if (shareFile) {
    try {
      const spec = JSON.parse(shareFile.text);
      share = Array.isArray(spec.posts) && typeof spec.url === 'string' ? { spec } : { spec: null, specErr: '홍보 글 파일 형식이 달라요 (url, posts 필요)' };
    } catch {
      share = { spec: null, specErr: '홍보 글 파일을 읽지 못했어요 (JSON 형식 오류)' };
    }
  }
  const budgetTotal = Object.values(settings.budgets).reduce((a, b) => a + b, 0);
  const runsTotal = Object.values(runs.perDept).reduce((a, r) => a + r.usd, 0);
  const data = {
    info,
    s: settings,
    secrets,
    co: { issues, approvals, board: buildBoard(issues), humanTasks: parseHumanTasks(project?.text), stage: currentStage(project?.text), project, statusAt: status.at },
    svc: status.services ?? {},
    spend: { ...runs, runsTotal, budgetTotal, orgCost: status.services?.anthropic?.summary?.value },
    share: { ...share, sharePath: settings.sharePath, shared: parseShares(paths), feedback: issues.filter((i) => i.labels?.some((l) => (l.name ?? l) === 'feedback')) },
    ready: { github: true, anthropic: secrets.includes('ANTHROPIC_API_KEY'), bootstrap: paths !== null },
  };
  cache = { at: Date.now(), data };
  return data;
}

async function render() {
  const r = route();
  if (!gh) {
    document.title = '로그인 · Atelier HQ';
    app.innerHTML = `<main class="wrap" id="main">${V.flash(flashMsg)}${V.loginPage()}</main>`;
    flashMsg = {};
    return;
  }
  if (!app.querySelector('main')) app.innerHTML = `<main class="wrap" id="main">${V.loadingPage()}</main>`;
  let d;
  try {
    d = await loadAll();
  } catch (e) {
    const msg = e instanceof GhError ? e.message : '불러오지 못했어요';
    if (e.status === 401) {
      clearAuth();
      gh = null;
      flashMsg = { err: `${msg} — 다시 로그인해 주세요` };
      return render();
    }
    app.innerHTML = `<main class="wrap" id="main">${V.flash({ err: msg })}<button data-click="reload">다시 시도</button> <button class="link" data-click="logout">로그아웃</button></main>`;
    return;
  }
  const alerts = d.co.issues.filter((i) => i.state === 'open' && i.labels?.some((l) => (l.name ?? l) === 'ops-alert')).length;
  const svcSummaries = Object.entries(d.svc).map(([id, x]) => ({ name: SERVICES[id]?.name ?? id, ...x }));
  const status = overallStatus({ serviceSummaries: svcSummaries, approvals: d.co.approvals, alerts, budgetRatio: d.spend.budgetTotal ? d.spend.runsTotal / d.spend.budgetTotal : 0 });

  const pages = {
    '/': ['홈', () => V.homePage({ ...d, status })],
    '/approvals': ['결재', () => V.approvalsPage(d)],
    '/board': ['업무', () => V.boardPage(d)],
    '/depts': ['부서', () => V.deptsPage({ ...d, repo: gh.repo })],
    '/connect': ['연결', () => V.connectPage(d)],
    '/share': ['홍보', () => V.sharePage(d.share)],
    '/settings': ['설정', () => V.settingsPage(d)],
    '/help': ['도움말', () => V.helpPage()],
  };
  let page = pages[r];
  const svcMatch = r.match(/^\/connect\/([a-z]+)$/);
  if (svcMatch && SERVICES[svcMatch[1]]) page = [SERVICES[svcMatch[1]].name, () => V.connectServicePage({ svc: SERVICES[svcMatch[1]], secrets: d.secrets })];
  if (!page) page = ['없는 페이지', () => '<h1>없는 페이지예요</h1><p><a href="#/">홈으로</a></p>'];
  document.title = `${page[0]} — ${d.s.company} · Atelier HQ`;
  app.innerHTML = `${V.chrome({ s: d.s, route: r })}<main class="wrap" id="main">${V.flash(flashMsg)}${page[1]()}</main>`;
  flashMsg = {};
}

const done = async (ok, path) => {
  flashMsg = { ok };
  cache = null;
  if (path && route() !== path) location.hash = `#${path}`;
  else await render();
};
const fail = async (err) => {
  flashMsg = { err };
  await render();
};

const actions = {
  async login(f) {
    const repo = String(f.get('repo') ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
    const token = String(f.get('token') ?? '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail('저장소는 "소유자/이름" 형식이에요 (예: Mode1221/my-service)');
    const candidate = githubClient({ token, repo, apiBase: API });
    try {
      const info = await candidate.repoInfo();
      if (info.permissions && !info.permissions.push) return fail('이 토큰은 저장소에 쓰기 권한이 없어요');
    } catch (e) {
      return fail(e.message);
    }
    auth = { token, repo };
    saveAuth(auth, f.get('remember') === 'on');
    gh = candidate;
    cache = null;
    return done('연결됐어요', '/');
  },
  async approve(_f, ds) {
    const n = Number(ds.n);
    await gh.removeLabel(n, 'approval-needed');
    await gh.addLabels(n, ['approved']);
    await gh.comment(n, '✅ **대표 승인** (Atelier HQ)');
    return done(`#${n} 승인했어요. 담당 부서가 곧 진행해요`);
  },
  async reject(f, ds) {
    const n = Number(ds.n);
    const reason = String(f.get('reason') ?? '').trim().slice(0, 1000);
    if (!reason) return fail('반려 이유를 한 줄 적어 주세요 — 담당 부서가 보고 고쳐요');
    await gh.removeLabel(n, 'approval-needed');
    await gh.addLabels(n, ['rejected']);
    await gh.comment(n, `↩️ **대표 반려** (Atelier HQ)\n\n반려 이유: ${reason}`);
    return done(`#${n} 반려했어요`);
  },
  async newTask(f) {
    const title = String(f.get('title') ?? '').trim().slice(0, 200);
    const dept = String(f.get('dept') ?? 'plan');
    if (!title) return fail('무엇을 해야 하는지 적어 주세요');
    if (!DEPT_IDS.has(dept)) return fail('부서를 골라 주세요');
    await gh.createIssue(title, `${String(f.get('body') ?? '').trim()}\n\n— 대표 지시 (Atelier HQ)`, [`dept:${dept}`, 'status:todo']);
    return done(`${DEPTS.find((d) => d.id === dept).name} 부서에 일을 맡겼어요`);
  },
  async runDept(_f, ds) {
    const info = cache?.data.info ?? (await gh.repoInfo());
    try {
      await gh.dispatch(WORKFLOW_FILE, info.default_branch, { dept: ds.dept });
    } catch (e) {
      return fail(e.status === 404 ? '회사가 아직 세워지지 않았어요. 연결 화면에서 "회사 세우기"를 눌러 주세요' : e.message);
    }
    return done(`${DEPTS.find((d) => d.id === ds.dept).name} 부서를 지금 실행했어요. 몇 분 뒤 결과가 보여요`);
  },
  async togglePause(_f, ds) {
    const s = (await loadAll()).s;
    const was = s.paused.includes(ds.dept);
    const paused = was ? s.paused.filter((x) => x !== ds.dept) : [...s.paused, ds.dept];
    await saveSettings(gh, { ...s, paused });
    return done(`${DEPTS.find((d) => d.id === ds.dept).name} 부서를 ${was ? '다시 시작' : '쉬게'} 했어요`);
  },
  async taskDone(_f, ds) {
    const d = await loadAll(true);
    const t = d.co.humanTasks.filter((x) => !x.done)[Number(ds.i)];
    const next = t && d.co.project && markHumanTaskDone(d.co.project.text, t.text);
    if (!next) return fail('그 할 일을 찾지 못했어요 (이미 완료됐을 수 있어요)');
    await gh.putFile('PROJECT.md', next, `docs: 대표 할 일 완료 — ${t.text.slice(0, 50)}`, d.co.project.sha);
    return done('완료로 표시했어요');
  },
  async connect(f, ds) {
    const svc = SERVICES[ds.svc];
    const cfg = {};
    for (const fld of svc.fields) {
      cfg[fld.key] = String(f.get(fld.key) ?? '').trim();
      if (!cfg[fld.key] && !fld.optional) return fail(`"${fld.label}" 칸을 채워 주세요`);
    }
    if (svc.id === 'anthropic') {
      // 브라우저에서 바로 확인 (Anthropic 은 이 헤더가 있으면 브라우저 요청을 받는다)
      const res = await fetch(`${ANTHROPIC}/v1/models?limit=1`, {
        headers: { 'x-api-key': cfg.api_key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      }).catch(() => null);
      if (!res || !res.ok) return fail(res?.status === 401 ? 'Claude API 키가 올바르지 않아요' : 'Claude 에 연결하지 못했어요 (키를 확인해 주세요)');
    }
    for (const [name, value] of Object.entries(svc.secrets(cfg))) await gh.setSecret(name, value);
    return done(`${svc.name} 연결됨 — 키를 GitHub 비밀값으로 암호화해 저장했어요`, '/connect');
  },
  async disconnect(_f, ds) {
    const svc = SERVICES[ds.svc];
    for (const name of Object.keys(svc.secrets(Object.fromEntries(svc.fields.map((x) => [x.key, 'x']))))) await gh.deleteSecret(name);
    return done(`${svc.name} 연결을 해제했어요`, '/connect');
  },
  async bootstrap() {
    const get = async (p) => (await fetch(p)).text();
    const templates = { company: await get('templates/company.yml'), collectYml: await get('templates/collect.yml'), collectJs: await get('templates/collect.mjs') };
    const d = await loadAll(true);
    const steps = await bootstrap({ gh, templates, settings: d.s });
    return done(`회사를 세웠어요: ${steps.join(' · ')}`, '/connect');
  },
  async markShared(_f, ds) {
    const d = await loadAll();
    await markShared(gh, { channel: ds.channel, index: Number(ds.i), campaign: d.share.spec?.campaign });
    return done('올린 것으로 기록했어요. 마케팅 부서가 채널별 반응을 비교해요');
  },
  async saveSettings(f) {
    const s = (await loadAll()).s;
    const budgets = {};
    for (const d of DEPTS) {
      const v = Number(f.get(`budget_${d.id}`));
      if (Number.isFinite(v) && v >= 0 && v <= 10000) budgets[d.id] = v;
    }
    await saveSettings(gh, { ...s, company: String(f.get('company') ?? s.company), rate: Number(f.get('rate')) || s.rate, budgets, sharePath: String(f.get('sharePath') ?? s.sharePath).trim() });
    return done('저장했어요');
  },
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const btn = e.submitter;
  if (btn?.dataset.confirm && !window.confirm(btn.dataset.confirm)) return;
  const label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '처리 중…';
  }
  try {
    await actions[form.dataset.action](new FormData(form), form.dataset);
  } catch (err) {
    await fail(err instanceof GhError ? `처리하지 못했어요: ${err.message}` : '처리하지 못했어요. 잠시 후 다시 시도해 주세요');
  } finally {
    if (btn?.isConnected) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-click]');
  if (!el) return;
  if (el.dataset.click === 'logout') {
    clearAuth();
    gh = null;
    cache = null;
    flashMsg = { ok: '로그아웃했어요. 이 기기에서 토큰을 지웠어요' };
    location.hash = '#/';
    render();
  } else if (el.dataset.click === 'copy') {
    const text = document.getElementById(el.dataset.target)?.textContent ?? '';
    navigator.clipboard?.writeText(text).then(
      () => (el.textContent = '복사했어요'),
      () => (el.textContent = '복사 실패 — 글을 직접 선택하세요'),
    );
  } else if (el.dataset.click === 'reload') {
    cache = null;
    render();
  }
});
window.addEventListener('hashchange', render);
render();
