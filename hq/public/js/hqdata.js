// 서버 없는 HQ 의 데이터: 사용자 저장소의 atelier-data 브랜치에 저장한다.
//   hq.json      회사 이름·환율·부서별 예산·쉬는 부서
//   status.json  외부 서비스 상태 (atelier-collect 워크플로가 3시간마다 갱신)
//   runs/YYYY-MM/<부서>__<실행ID>__<비용USD>__<결과>.json  부서 실행 기록 (파일 이름만으로 합계)
import { DEPTS, LABELS, WORKFLOW_FILE } from './company.js';
import { DATA_BRANCH } from './gh.js';

export const DEFAULT_BUDGET = 10;
export const SERVICE_SECRET = (id) => `ATELIER_SVC_${id.toUpperCase()}`;

export function defaultSettings() {
  return { company: '우리 회사', rate: 1400, budgets: Object.fromEntries(DEPTS.map((d) => [d.id, DEFAULT_BUDGET])), paused: [], sharePath: 'docs/share/posts.json' };
}

export function normalizeSettings(raw) {
  const d = defaultSettings();
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    company: typeof s.company === 'string' && s.company.trim() ? s.company.trim().slice(0, 40) : d.company,
    rate: Number(s.rate) > 0 ? Number(s.rate) : d.rate,
    budgets: { ...d.budgets, ...Object.fromEntries(Object.entries(s.budgets ?? {}).filter(([k, v]) => d.budgets[k] != null && Number(v) >= 0).map(([k, v]) => [k, Number(v)])) },
    paused: Array.isArray(s.paused) ? s.paused.filter((x) => d.budgets[x] != null) : [],
    // 홍보 글 파일 (Atelier share 스킬의 posts.json). 저장소 안 상대 경로만
    sharePath: typeof s.sharePath === 'string' && /^[\w./-]{1,200}$/.test(s.sharePath) && !s.sharePath.includes('..') ? s.sharePath.replace(/^\/+/, '') : d.sharePath,
  };
}

// runs/ 경로 목록 → 이번 달 부서별 { usd, runs } 와 부서별 마지막 실행
export function parseRuns(paths, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const perDept = {};
  const last = {};
  for (const p of paths ?? []) {
    const m = p.match(/^runs\/(\d{4}-\d{2})\/([a-z]+)__(\d+)__([\d.]+)__([a-z_]+)\.json$/);
    if (!m) continue;
    const [, mon, dept, runId, cost, status] = m;
    if (mon === month) {
      perDept[dept] ??= { usd: 0, runs: 0 };
      perDept[dept].usd += Number(cost);
      perDept[dept].runs += 1;
    }
    if (!last[dept] || Number(runId) > Number(last[dept].runId)) last[dept] = { runId, status, month: mon, cost: Number(cost) };
  }
  return { perDept, last };
}

// 회사 세우기: 라벨, 워크플로 3개(부서·수집 + 수집 스크립트), 데이터 브랜치, AI 키
export async function bootstrap({ gh, templates, anthropicKey, settings }) {
  const steps = [];
  for (const [name, color, desc] of LABELS) await gh.ensureLabel(name, color, desc);
  steps.push(`라벨 ${LABELS.length}개 준비`);
  const files = [
    [`.github/workflows/${WORKFLOW_FILE}`, templates.company, '부서 실행 일정'],
    ['.github/workflows/atelier-collect.yml', templates.collectYml, '서비스 상태 수집 일정'],
    ['.github/atelier/collect.mjs', templates.collectJs, '서비스 상태 수집기'],
  ];
  for (const [path, text, label] of files) {
    const cur = await gh.file(path);
    if (cur?.text === text) continue;
    await gh.putFile(path, text, `chore: Atelier ${label} ${cur ? '갱신' : '추가'}`, cur?.sha);
    steps.push(`${label} ${cur ? '갱신' : '설치'}`);
  }
  if ((await gh.dataPaths()) === null) {
    await gh.createDataBranch({ 'hq.json': JSON.stringify(settings, null, 2), 'README.md': '# Atelier 데이터\n\nAtelier HQ 대시보드가 쓰는 설정·실행 기록·서비스 상태입니다. 코드와 섞이지 않게 따로 둔 브랜치예요.\n' });
    steps.push(`데이터 보관용 브랜치(${DATA_BRANCH}) 생성`);
  }
  if (anthropicKey) {
    await gh.setSecret('ANTHROPIC_API_KEY', anthropicKey);
    steps.push('AI 키 등록 (암호화)');
  }
  if (steps.length === 1) steps.push('이미 최신이에요');
  return steps;
}

export async function saveSettings(gh, settings) {
  const cur = await gh.file('hq.json', DATA_BRANCH);
  await gh.putFile('hq.json', JSON.stringify(normalizeSettings(settings), null, 2), 'chore: Atelier HQ 설정 변경', cur?.sha, DATA_BRANCH);
}

// 홍보 글 올림 기록: 데이터 브랜치 shares/YYYY-MM-DD__채널__번호.json (마케팅 부서가 성과 비교에 쓴다)
export function parseShares(paths) {
  const done = new Set();
  for (const p of paths ?? []) {
    const m = /^shares\/(\d{4}-\d{2}-\d{2})__([a-z_]+)__(\d+)\.json$/.exec(p);
    if (m) done.add(`${m[2]}#${m[3]}`);
  }
  return done;
}
export async function markShared(gh, { channel, index, campaign }, now = new Date()) {
  const path = `shares/${now.toISOString().slice(0, 10)}__${channel}__${index}.json`;
  await gh.putFile(path, JSON.stringify({ at: now.toISOString(), channel, index, campaign: campaign ?? null }), `chore: 홍보 글 올림 — ${channel}`, undefined, DATA_BRANCH);
}
