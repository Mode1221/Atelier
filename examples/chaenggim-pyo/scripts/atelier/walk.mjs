#!/usr/bin/env node
// Atelier 0.28.0 의 skills/usertest/scripts/walk.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
/* eslint-disable */
// Atelier usertest — AI 대리 사용성 테스트 실행기.
// 페르소나 × 과제를 실제 브라우저로 걷는다. 요소는 사람 눈에 보이는 것(역할·이름·라벨·글자)으로만 찾는다 —
// 못 찾으면 그게 곧 "사용자가 못 찾는" 문제다. 화면마다 자동 점검(가로 넘침·작은 터치 영역·이름 없는 입력·콘솔 오류·axe)을 한다.
//
// 사용: node walk.mjs <plan.json> [출력 폴더=docs/usertest/<날짜>]
// 필요: 프로젝트에 playwright 또는 @playwright/test (선택: @axe-core/playwright). 크로미움 경로를 바꾸려면 PW_CHROMIUM.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STEP_TIMEOUT = 5000; // 사람이 5초 안에 못 찾으면 막힌 것으로 본다

export function loadPlaywright(from = process.cwd()) {
  // 프로젝트 → NODE_PATH → 전역 설치(npm i -g playwright) 순서로 찾는다
  const roots = [resolve(from), ...(process.env.NODE_PATH ?? '').split(/[:;]/).filter(Boolean)];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* npm 없음 */ }
  for (const root of roots) {
    const req = createRequire(join(root, 'noop.js'));
    for (const name of ['playwright', '@playwright/test']) {
      try {
        return req(name);
      } catch {
        /* 다음 후보 */
      }
    }
  }
  throw new Error('playwright 가 없어요. 프로젝트에서 `npm i -D playwright` 후 다시 실행하세요 (무료).');
}
function loadAxe(from = process.cwd()) {
  try {
    const m = createRequire(join(resolve(from), 'noop.js'))('@axe-core/playwright');
    return m.default ?? m.AxeBuilder ?? m;
  } catch {
    return null;
  }
}

// 사람이 보는 방식으로 요소 찾기
export function locate(page, t) {
  let scope = page;
  if (t.within) scope = t.within.role ? page.getByRole(t.within.role, { name: t.within.name }) : page.getByText(t.within.text);
  if (t.role) return scope.getByRole(t.role, { name: t.name, exact: t.exact ?? false }).first();
  if (t.label) return scope.getByLabel(t.label, { exact: t.exact ?? false }).first();
  if (t.text) return scope.getByText(t.text, { exact: t.exact ?? false }).first();
  if (t.placeholder) return scope.getByPlaceholder(t.placeholder).first();
  throw new Error(`찾는 방법이 없어요: ${JSON.stringify(t)}`);
}
export const describe = (s) => {
  const [op, arg] = Object.entries(s).find(([k]) => k !== 'within' && k !== 'note') ?? [];
  const t = typeof arg === 'object' ? (arg.name ?? arg.label ?? arg.text ?? arg.option ?? '') : arg;
  const where = s.within ? ` (${s.within.name ?? s.within.text} 안)` : '';
  return `${op} "${t}"${where}`;
};

async function runStep(page, s, ctx) {
  const o = { timeout: STEP_TIMEOUT };
  if (s.goto !== undefined) return page.goto(new URL(s.goto, ctx.baseUrl).href);
  if (s.click) return locate(page, { ...s.click, within: s.within }).click(o);
  if (s.fill) return locate(page, { ...s.fill, within: s.within }).fill(String(s.fill.value), o);
  if (s.check) return locate(page, { ...s.check, within: s.within }).check(o);
  if (s.select) return locate(page, { ...s.select, within: s.within }).selectOption({ label: s.select.option }, o);
  if (s.see) return locate(page, { text: s.see, within: s.within }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT });
  if (s.notSee) {
    const l = locate(page, { text: s.notSee, within: s.within });
    if (await l.isVisible()) throw new Error(`보이면 안 되는 "${s.notSee}" 가 보여요`);
    return;
  }
  if (s.url) return page.waitForURL(new RegExp(s.url), o);
  if (s.shot !== undefined) {
    // 심사 제출용 화면 캡처 (카카오·네이버 로그인 검수, 스토어 심사 등) — shots/review/<이름>.png
    const name = String(s.shot).replace(/[^\w가-힣-]+/g, '-').slice(0, 60) || 'shot';
    const dir = join(ctx.shotsDir ?? '.', 'review');
    mkdirSync(dir, { recursive: true });
    return page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
  if (s.openFrom) {
    // 화면에 보이는 링크 칸(라벨)의 값을 새 방문자처럼 연다 — 공유 링크 흐름
    const v = await locate(page, s.openFrom).inputValue(o);
    return page.goto(v);
  }
  throw new Error(`모르는 단계: ${JSON.stringify(s)}`);
}

// 화면 자동 점검 (브라우저 안에서)
function pageAudit() {
  const out = [];
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push({ kind: '가로 넘침', severity: '높음', detail: `화면 폭 ${window.innerWidth}px 보다 넓음 (${document.documentElement.scrollWidth}px)` });
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 30);
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    const isInline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
    const small = Math.min(r.width, r.height);
    const labelled = el.tagName === 'INPUT' && ['radio', 'checkbox'].includes(el.type) && el.closest('label');
    if (!isInline && !labelled && small < 24) out.push({ kind: '터치 영역 너무 작음', severity: '높음', detail: `${el.tagName.toLowerCase()} "${name(el)}" ${Math.round(r.width)}×${Math.round(r.height)} (최소 24, 권장 44)` });
    else if (!isInline && !labelled && small < 44 && el.tagName !== 'A') out.push({ kind: '터치 영역 작음', severity: '낮음', detail: `${el.tagName.toLowerCase()} "${name(el)}" ${Math.round(r.width)}×${Math.round(r.height)} (권장 44)` });
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label')))
      out.push({ kind: '이름 없는 입력칸', severity: '높음', detail: `${el.tagName.toLowerCase()}#${el.id || '?'} — 무엇을 넣는 칸인지 알 수 없음` });
  }
  // 한 줄에 버튼이 뭉쳐 줄바꿈 (좁은 화면에서 목록 줄마다 버튼이 많을 때 — 자주 안 쓰는 건 "⋯" 로 접는다)
  const groups = new Map();
  for (const el of document.querySelectorAll('button, [role=button]')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const g = groups.get(el.parentElement) ?? [];
    g.push(el);
    groups.set(el.parentElement, g);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const tops = [];
    for (const el of g) {
      const t = el.getBoundingClientRect().top;
      if (!tops.some((x) => Math.abs(x - t) < 6)) tops.push(t);
    }
    if (tops.length > 1)
    {
      const p = g[0].parentElement;
      const where = `${p.tagName.toLowerCase()}${p.className && typeof p.className === 'string' ? `.${p.className.trim().split(/\s+/).join('.')}` : ''}`;
      out.push({ kind: '버튼 줄바꿈', severity: g.length >= 3 ? '높음' : '낮음', detail: `${where} 안 버튼 ${g.length}개가 ${tops.length}줄로 밀림 — 화면 폭 ${window.innerWidth}px (예: ${name(g[0])})` });
    }
  }
  return { findings: out, text: document.body.innerText };
}

const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
export function missingWords(words = [], texts = []) {
  const all = norm(texts.join(' '));
  return words.filter((w) => !all.includes(norm(w)));
}

export async function walk(plan, { outDir, cwd = process.cwd(), log = console.log } = {}) {
  const pw = loadPlaywright(cwd);
  const AxeBuilder = loadAxe(cwd);
  const browser = await pw.chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const shots = join(outDir, 'shots');
  mkdirSync(shots, { recursive: true });
  plan.shotsDir = shots;
  const results = [];
  let visitor = 0;
  const findings = new Map(); // 같은 문제는 한 번만 (어디서 몇 번 났는지 모은다)
  const addFinding = (f, where) => {
    const k = `${f.kind}|${f.detail}`;
    const cur = findings.get(k) ?? { ...f, where: new Set(), count: 0 };
    cur.where.add(where);
    cur.count++;
    findings.set(k, cur);
  };
  try {
    for (const persona of plan.personas) {
      const device = persona.device === 'desktop' ? { viewport: { width: 1280, height: 800 } } : pw.devices['iPhone 13'];
      for (const task of plan.tasks) {
        if (persona.tasks && !persona.tasks.includes(task.id)) continue;
        const context = await browser.newContext({ ...device, locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'], ...(persona.dark ? { colorScheme: 'dark' } : {}),
          // 각 실행을 다른 방문자로 (로컬 테스트에서 IP 기준 속도 제한에 걸리지 않게). plan.ipHeader 예: "cf-connecting-ip"
          ...(plan.ipHeader ? { extraHTTPHeaders: { [plan.ipHeader]: `10.77.${Math.floor(++visitor / 250)}.${(visitor % 250) + 1}` } } : {}),
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
        page.on('pageerror', (e) => consoleErrors.push(e.message));
        page.on('dialog', (d) => d.accept());
        const texts = [];
        const audited = new Set();
        const audit = async () => {
          const key = new URL(page.url()).pathname.replace(/\/g\/[^/]+/, '/g/:id');
          const a = await page.evaluate(pageAudit).catch(() => ({ findings: [], text: '' }));
          texts.push(a.text);
          if (audited.has(key)) return;
          audited.add(key);
          for (const f of a.findings) addFinding(f, key);
          if (AxeBuilder) {
            const r = await new AxeBuilder({ page }).analyze().catch(() => null);
            for (const v of r?.violations ?? []) addFinding({ kind: `접근성(axe) ${v.id}`, severity: v.impact === 'critical' || v.impact === 'serious' ? '높음' : '낮음', detail: v.help }, key);
          }
        };
        const r = { persona: persona.id, task: task.id, goal: task.goal, status: '성공', steps: [], ms: 0, stuck: null };
        let tStart = Date.now();
        try {
          await page.goto(new URL(task.start ?? '/', plan.baseUrl).href);
          // 준비 단계(과제 전 상태 만들기)는 시간·결과에 넣지 않는다
          for (const s of task.setup ?? []) {
            try {
              await runStep(page, s, plan);
            } catch (e) {
              throw new Error(`준비 실패 — ${describe(s)}: ${String(e.message).split('\n')[0]}`);
            }
          }
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          await audit();
          tStart = Date.now();
          for (const [i, s] of task.steps.entries()) {
            const st = Date.now();
            try {
              await runStep(page, s, plan);
              await page.waitForLoadState('domcontentloaded').catch(() => {});
              r.steps.push({ step: describe(s), ok: true, ms: Date.now() - st });
              await audit();
            } catch (e) {
              r.status = '실패';
              r.stuck = { step: describe(s), index: i, error: String(e.message).split('\n')[0], note: s.note };
              r.steps.push({ step: describe(s), ok: false, ms: Date.now() - st });
              const file = `${persona.id}-${task.id}-stuck.jpg`;
              await page.screenshot({ path: join(shots, file), fullPage: true, type: 'jpeg', quality: 55 }).catch(() => {});
              r.stuck.shot = `shots/${file}`;
              break;
            }
          }
        } catch (e) {
          r.status = '실패';
          r.stuck = { step: '시작 화면', error: e.message };
        }
        r.ms = Date.now() - tStart;
        const file = `${persona.id}-${task.id}-end.jpg`;
        await page.screenshot({ path: join(shots, file), fullPage: true, type: 'jpeg', quality: 55 }).catch(() => {});
        r.endShot = `shots/${file}`;
        r.missingWords = missingWords(persona.words?.[task.id], texts);
        if (r.missingWords.length && r.status === '성공') r.status = '부분';
        r.consoleErrors = consoleErrors;
        for (const c of consoleErrors) addFinding({ kind: '콘솔 오류', severity: '높음', detail: c.slice(0, 200) }, task.id);
        results.push(r);
        log(`${persona.id} × ${task.id}: ${r.status}${r.stuck ? ` — 막힘: ${r.stuck.step}` : ''}${r.missingWords.length ? ` — 기대 단어 없음: ${r.missingWords.join(', ')}` : ''}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const auto = [...findings.values()].map((f) => ({ ...f, where: [...f.where] }));
  const out = { at: new Date().toISOString(), baseUrl: plan.baseUrl, personas: plan.personas, tasks: plan.tasks.map(({ id, goal }) => ({ id, goal })), results, findings: auto };
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(out, null, 2));
  writeFileSync(join(outDir, 'summary.md'), summarize(out));
  return out;
}

const SEV = { 치명: 0, 높음: 1, 낮음: 2 };
export function summarize({ at, baseUrl, personas, tasks, results, findings }) {
  const pName = Object.fromEntries(personas.map((p) => [p.id, p.name]));
  const lines = [
    `# AI 대리 사용성 테스트 — 자동 실행 결과`,
    '',
    `- 실행: ${at} · 대상: ${baseUrl}`,
    `- 페르소나 ${personas.length} × 과제 ${tasks.length}. 요소는 화면에 보이는 이름으로만 찾았다 (5초 안에 못 찾으면 막힘).`,
    '',
    '## 과제 결과',
    '| 과제 | 페르소나 | 결과 | 조작 수 | 막힌 곳 | 기대했는데 화면에 없던 말 |',
    '|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.task} ${r.goal} | ${pName[r.persona] ?? r.persona} | ${r.status} | ${r.steps.length} | ${r.stuck ? `${r.stuck.step} ([화면](${r.stuck.shot}))` : '—'} | ${r.missingWords.join(', ') || '—'} |`),
    '',
    '## 자동 점검 발견',
    findings.length ? '| 심각도 | 종류 | 내용 | 화면 |\n|---|---|---|---|' : '없음',
    ...findings.sort((a, b) => SEV[a.severity] - SEV[b.severity]).map((f) => `| ${f.severity} | ${f.kind} | ${f.detail.replace(/\|/g, '/')} | ${f.where.join(', ')} |`),
    '',
    '## 판정 규칙',
    '- 실패 = 치명 (출시 전 반드시 수정). 부분(기대 단어 없음) = 높음 — 라벨을 사용자 말로 바꿀지 검토.',
    '- 이 결과에 관찰자 검토(화면 캡처를 페르소나 눈으로 보기)를 더해 보고서를 쓴다 — SKILL.md 4단계.',
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [planPath, dir] = process.argv.slice(2);
  if (!planPath) {
    console.error('사용: node walk.mjs <plan.json> [출력 폴더]');
    process.exit(2);
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  if (process.env.BASE_URL) plan.baseUrl = process.env.BASE_URL;
  // 같은 날 다시 돌리면 앞 결과(1차 증거)를 덮지 않고 -r2, -r3 … 폴더에 쓴다
  let outDir = dir;
  if (!outDir) {
    const base = join('docs', 'usertest', new Date().toISOString().slice(0, 10));
    outDir = base;
    for (let n = 2; existsSync(outDir); n++) outDir = `${base}-r${n}`;
  }
  walk(plan, { outDir })
    .then((r) => {
      const fails = r.results.filter((x) => x.status === '실패').length;
      console.log(`\n결과: ${outDir}/summary.md (실패 ${fails})`);
      process.exit(fails ? 1 : 0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(2);
    });
}
