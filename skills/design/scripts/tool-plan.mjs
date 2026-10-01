#!/usr/bin/env node
// Atelier design — "디자인 도구 계획" 절 만들기 (references/design-routing.md 의 표를 그대로 적용). 의존성 없음.
// pilot 이 인터뷰 직후 한 번 실행해 PROJECT.md 에 넣는다. 이후 단계는 그 절만 읽는다.
//
// 사용: node tool-plan.mjs --type tool [--screens "정산 화면=tool,소개 페이지=landing"] [--plan pro|max] [--installed a,b | --detect] [--write PROJECT.md]
//   type: tool(도구형) emotional(감성·소비자형) landing(랜딩 중심) game(게임) native(모바일 네이티브)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const TOOLS = {
  'frontend-design': { name: 'frontend-design', kind: 'skill', install: 'npx skills add https://github.com/anthropics/skills --skill frontend-design', why: '디자인 방향 원칙' },
  impeccable: { name: 'impeccable', kind: 'skill', install: 'npx impeccable install (프로젝트 폴더에서, 설치 뒤 Claude Code 다시 열기)', why: '화면 설계·검토·다듬기 명령' },
  brandkit: { name: 'brandkit', kind: 'skill', install: 'npx skills add https://github.com/Leonxlnx/taste-skill --skill brandkit', why: '로고·브랜드 보드 이미지 프롬프트' },
  'playwright-mcp': { name: 'playwright-mcp', kind: 'mcp', install: 'claude mcp add playwright npx @playwright/mcp@latest', why: '대화형 브라우저 조작 (usertest 탐색·레이아웃 버그)' },
};

export const TYPES = {
  tool: { label: '도구형', mode: 'Operate' },
  emotional: { label: '감성·소비자형', mode: 'Experience / 소개·가입 화면은 Persuade' },
  landing: { label: '랜딩 중심', mode: 'Persuade' },
  game: { label: '게임', mode: '—' },
  native: { label: '모바일 네이티브', mode: 'Operate/Experience + native' },
};

// 단계별 명령: [{ tool, cmd, fallback }] — design-routing.md 3절·6절
const FB = {
  direction: 'design-direction.md 로 방향 1장',
  shape: 'design-direction.md 로 방향 1장 + D2 와이어프레임',
  critique: '캡처 보고 design-direction.md 5절 자체 검토 1회',
  polish: '캡처 보고 design-direction.md 5절 자체 검토 1회',
  audit: 'accessibility-checklist.md + axe 자동 검사 (Playwright 스크립트)',
  harden: 'screen-states.md 상태별 화면 전부 구현 확인',
  onboard: 'launch/references/landing-copy.md 헤드라인·첫 행동',
  brandkit: 'brand-assets.md 규격으로 SVG 직접 제작 → PNG 캡처',
};
const FD = { tool: 'frontend-design', cmd: 'frontend-design 원칙 적용 (시안 없이 방향 1장)', fallback: FB.direction };
const IMP = (c, extra = '') => ({ tool: 'impeccable', cmd: `/impeccable ${c}${extra}`, fallback: FB[c] });
const BK = (what) => ({ tool: 'brandkit', cmd: `brandkit: ${what} 프롬프트 → 이미지 생성기`, fallback: FB.brandkit });
const NONE = (text) => ({ tool: null, cmd: text, fallback: '' });
const SHOT = NONE('토큰 HTML + Playwright 스크립트 캡처');
const WALK = { tool: 'playwright-mcp', cmd: 'Playwright 스크립트(walk.mjs) 기본, 스크립트로 못 찾는 막힘·레이아웃 버그만 playwright-mcp', fallback: 'Playwright 스크립트만 (walk.mjs)' };
const GROW = [NONE('작은 변경: 스킬 없음'), IMP('critique', ' (새 화면일 때만 1회)')];

export const ROUTES = {
  tool: { D0: [FD], D4: [SHOT], D6: [IMP('audit')], D7: [BK('파비콘·OG')], B: [IMP('harden')], L3: [], L5: [], R: [WALK], G: GROW },
  emotional: { D0: [IMP('shape', ' — 시안 {n}안')], D4: [SHOT, IMP('critique')], D6: [NONE('accessibility-checklist.md (스킬 없음)')], D7: [BK('로고·브랜드 보드')], B: [], L3: [], L5: [IMP('polish')], R: [WALK], G: GROW },
  landing: { D0: [IMP('shape', ' (Persuade 모드) — 시안 {n}안')], D4: [SHOT], D6: [IMP('audit')], D7: [BK('OG·공유 이미지')], B: [], L3: [IMP('onboard')], L5: [IMP('polish')], R: [WALK], G: GROW },
  game: { D0: [BK('키 아트')], D4: [NONE('HUD·메뉴 시안 + 스크립트 캡처만')], D6: [NONE('accessibility-checklist.md (스킬 없음)')], D7: [BK('키 아트·아이콘')], B: [], L3: [], L5: [], R: [NONE('스크립트 캡처')], G: [NONE('스킬 없음')] },
  native: { D0: [FD], D4: [NONE('Expo 웹 미리보기·에뮬레이터 스크린샷')], D6: [IMP('audit', ' (native 자동)')], D7: [BK('앱 아이콘')], B: [IMP('harden')], L3: [], L5: [], R: [NONE('스크립트·에뮬레이터 (playwright-mcp 안 씀)')], G: GROW },
};
export const STAGES = { D0: 'D0 방향', D4: 'D4 시안', D6: 'D6 접근성', D7: 'D7 브랜드', B: 'build 게이트 전', L3: 'L3 랜딩', L5: 'L5 출시 전', R: 'usertest', G: 'grow 새 화면' };

export const BUDGET = {
  pro: { mode: '절약', drafts: 1, checks: 1, perStage: 1 },
  max: { mode: '표준', drafts: 2, checks: 2, perStage: Infinity },
};

// 설치 확인 (실제 파일·설정 기준). 세션의 스킬·MCP 목록으로 한 번 더 확인하는 건 pilot 이 한다.
export function detect({ home = homedir(), project = process.cwd() } = {}) {
  const found = new Set();
  const skillDirs = [join(home, '.claude', 'skills'), join(project, '.claude', 'skills'), join(home, '.agents', 'skills'), join(project, '.agents', 'skills')];
  for (const d of skillDirs) for (const n of ['frontend-design', 'impeccable', 'brandkit']) if (existsSync(join(d, n, 'SKILL.md'))) found.add(n);
  // 플러그인으로 설치된 스킬 (…/plugins/**/skills/<이름>/SKILL.md) — 깊이 6까지
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
      if (['frontend-design', 'impeccable', 'brandkit'].includes(e.name) && existsSync(join(dir, e.name, 'SKILL.md'))) found.add(e.name);
      walk(join(dir, e.name), depth + 1);
    }
  };
  walk(join(home, '.claude', 'plugins'), 0);
  const mcpFiles = [join(home, '.claude.json'), join(project, '.mcp.json')];
  for (const f of mcpFiles) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      const servers = [j.mcpServers, j.projects?.[project]?.mcpServers].filter(Boolean).flatMap((s) => Object.entries(s));
      if (servers.some(([k, v]) => /playwright/i.test(k) || /@playwright\/mcp/.test(JSON.stringify(v)))) found.add('playwright-mcp');
    } catch { /* 없음 */ }
  }
  return [...found];
}

// 절약 모드: 스킬 명령은 단계당 앞에서부터 perStage 개만 (스킬이 아닌 일은 그대로)
function cell(entries, installed, budget) {
  let used = 0;
  const picked = entries.filter((e) => !e.tool || used++ < budget.perStage);
  if (!picked.length) return ['—', ''];
  const use = picked.map((e) => (e.tool && !installed.includes(e.tool) ? `(${e.fallback})` : e.cmd.replace('{n}', budget.drafts))).join(entries === ROUTES.tool.G || entries.includes(GROW[0]) ? ' / ' : ' + ');
  const missing = picked.filter((e) => e.tool && !installed.includes(e.tool)).map((e) => e.tool);
  return [use, missing.length ? `${[...new Set(missing)].join(', ')} 없음 → 괄호 안 대체` : ''];
}

// 한글 유형 이름도 받는다 (pilot 2-1 의 판정 이름 그대로 넘겨도 되게)
export const ALIAS = { 도구형: 'tool', 감성형: 'emotional', 소비자형: 'emotional', '감성·소비자형': 'emotional', 랜딩: 'landing', '랜딩 중심': 'landing', 게임: 'game', 모바일: 'native', '모바일 네이티브': 'native', 앱: 'native' };
const norm = (t) => ALIAS[String(t ?? '').trim()] ?? String(t ?? '').trim();
export function plan({ type, screens = null, tier = 'pro', installed = [] }) {
  if (!type && !screens?.length) throw new Error('--type 이 필요해요 (tool·emotional·landing·game·native 또는 도구형·감성형·랜딩·게임·모바일)');
  const groups = (screens?.length ? screens : [{ screen: '전체', type }]).map((g) => ({ ...g, type: norm(g.type) }));
  for (const g of groups) if (!ROUTES[g.type]) throw new Error(`모르는 유형 "${g.type}" (가능: ${Object.keys(ROUTES).join(', ')})`);
  const budget = BUDGET[tier] ?? BUDGET.pro;
  const types = [...new Set(groups.map((g) => g.type))];
  const needed = [...new Set(types.flatMap((t) => Object.values(ROUTES[t]).flat().map((e) => e.tool)).filter(Boolean))];
  const lines = [
    '## 디자인 도구 계획',
    `만든 날: ${new Date().toISOString().slice(0, 10)} · 기준: atelier design/references/design-routing.md · **이후 단계는 이 절만 읽고 다시 판단하지 않는다.**`,
    '',
    `- 유형: ${groups.map((g) => `${g.screen} = ${TYPES[g.type].label} — impeccable 모드 ${TYPES[g.type].mode}`).join(' / ')}`,
    `- 예산 모드: ${budget.mode} (${tier === 'max' ? 'Max' : 'Pro'} 기준 — 시안 ${budget.drafts}안, 검증 ${budget.checks}회, 스킬 명령 단계당 ${budget.perStage === Infinity ? '제한 없음' : `최대 ${budget.perStage}개`}). 바꾸려면 이 줄만 고친다.`,
    `- 설치 확인: ${Object.keys(TOOLS).map((t) => `${t} ${installed.includes(t) ? '✅' : '—'}`).join(' · ')}`,
    '',
  ];
  for (const t of types) {
    const names = groups.filter((g) => g.type === t).map((g) => g.screen).join(', ');
    lines.push(`### ${TYPES[t].label}${groups.length > 1 ? ` — ${names}` : ''}`, '| 단계 | 할 일 | 비고 |', '|---|---|---|');
    for (const [k, label] of Object.entries(STAGES)) {
      const [use, note] = cell(ROUTES[t][k], installed, budget);
      if (use !== '—' || ['D0', 'D4', 'D6', 'D7'].includes(k)) lines.push(`| ${label} | ${use} | ${note} |`);
    }
    lines.push('');
  }
  lines.push('규칙: 디자인 스킬은 사람에게 보이는 결과물에만 · 명령의 참고 문서만 읽기 · 캡처는 Playwright 스크립트(playwright-mcp 는 대화형 조작이 필요할 때만) · grow 작은 변경은 스킬 없이.');
  const missing = needed.filter((t) => !installed.includes(t));
  return { markdown: `${lines.join('\n')}\n`, needed, missing, install: missing.map((t) => ({ tool: t, ...TOOLS[t] })) };
}

// PROJECT.md 에 절을 넣거나 바꾼다 (다른 절은 그대로)
export function upsertSection(doc, section) {
  const re = /^## 디자인 도구 계획\n[\s\S]*?(?=^## |(?![\s\S]))/m;
  if (re.test(doc)) return doc.replace(re, `${section.trimEnd()}\n\n`);
  const at = doc.search(/^## 로드맵/m);
  return at >= 0 ? `${doc.slice(0, at)}${section.trimEnd()}\n\n${doc.slice(at)}` : `${doc.trimEnd()}\n\n${section}`;
}

export function parseScreens(s) {
  return String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [screen, type] = x.split('='); return { screen: screen.trim(), type: type?.trim() }; });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
  try {
    const installed = a.includes('--detect') ? detect() : (get('installed') ?? '').split(',').filter(Boolean);
    const r = plan({ type: get('type'), screens: get('screens') ? parseScreens(get('screens')) : null, tier: get('plan') ?? 'pro', installed });
    if (get('write')) writeFileSync(get('write'), upsertSection(readFileSync(get('write'), 'utf8'), r.markdown));
    console.log(r.markdown);
    if (r.missing.length) console.log(`설치 안내 (이 유형에 필요, 선택):\n${r.install.map((i) => `- ${i.tool}: ${i.why} — ${i.install}`).join('\n')}`);
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
