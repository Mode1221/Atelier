// design 스킬: 디자인 도구 계획 (skills/design/scripts/tool-plan.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan, upsertSection, parseScreens, detect, ROUTES } from '../skills/design/scripts/tool-plan.mjs';

const ALL = ['frontend-design', 'impeccable', 'brandkit', 'playwright-mcp'];
const row = (md, stage) => md.split('\n').find((l) => l.startsWith(`| ${stage}`)) ?? '';

test('tool-plan: 도구형과 감성형은 단계별 명령이 다르다', () => {
  const tool = plan({ type: 'tool', tier: 'max', installed: ALL }).markdown;
  const emo = plan({ type: 'emotional', tier: 'max', installed: ALL }).markdown;
  assert.match(row(tool, 'D0'), /frontend-design 원칙/);
  assert.match(row(emo, 'D0'), /\/impeccable shape — 시안 2안/);
  assert.match(row(tool, 'D6'), /\/impeccable audit/);
  assert.doesNotMatch(row(emo, 'D6'), /impeccable/);
  assert.match(row(tool, 'D7'), /파비콘·OG/);
  assert.match(row(emo, 'D7'), /로고·브랜드 보드/);
  assert.match(row(tool, 'build 게이트 전'), /harden/);
  assert.match(row(emo, 'L5'), /polish/);
  assert.equal(row(tool, 'L5'), '');
  assert.match(tool, /impeccable 모드 Operate/);
});

test('tool-plan: Pro 는 시안 1안·스킬 명령 단계당 1개, Max 는 2안·전부', () => {
  const pro = plan({ type: 'emotional', tier: 'pro', installed: ALL }).markdown;
  const max = plan({ type: 'emotional', tier: 'max', installed: ALL }).markdown;
  assert.match(row(pro, 'D0'), /시안 1안/);
  assert.match(pro, /예산 모드: 절약/);
  assert.match(max, /예산 모드: 표준/);
  const twoSkills = { ...ROUTES.emotional, D4: [{ tool: 'impeccable', cmd: '/impeccable critique', fallback: 'x' }, { tool: 'impeccable', cmd: '/impeccable polish', fallback: 'y' }] };
  const saved = ROUTES.emotional; ROUTES.emotional = twoSkills;
  try {
    assert.doesNotMatch(row(plan({ type: 'emotional', tier: 'pro', installed: ALL }).markdown, 'D4'), /polish/);
    assert.match(row(plan({ type: 'emotional', tier: 'max', installed: ALL }).markdown, 'D4'), /polish/);
  } finally { ROUTES.emotional = saved; }
  assert.match(plan({ type: 'tool' }).markdown, /절약/, '요금제를 모르면 Pro');
});

test('tool-plan: 설치 안 된 스킬은 대체 수단, 필요한데 없는 것만 설치 안내', () => {
  const r = plan({ type: 'tool', tier: 'pro', installed: ['impeccable'] });
  assert.match(row(r.markdown, 'D0'), /\(design-direction\.md/);
  assert.match(row(r.markdown, 'D6'), /\/impeccable audit/);
  assert.deepEqual(r.missing.sort(), ['brandkit', 'frontend-design', 'playwright-mcp']);
  assert.deepEqual(plan({ type: 'native', installed: ['impeccable', 'brandkit', 'frontend-design'] }).missing, [], '네이티브는 playwright-mcp 가 필요 없음');
  assert.ok(!plan({ type: 'game', installed: [] }).needed.includes('impeccable'));
});

test('tool-plan: 섞인 서비스는 화면별로 나눈다', () => {
  const md = plan({ type: 'tool', screens: parseScreens('정산 화면=tool, 소개 페이지=landing'), installed: ALL }).markdown;
  assert.match(md, /### 도구형 — 정산 화면/);
  assert.match(md, /### 랜딩 중심 — 소개 페이지/);
  assert.match(md, /onboard/);
  assert.throws(() => plan({ type: 'blog' }), /모르는 유형/);
});

test('tool-plan: PROJECT.md 절 넣기·바꾸기 (다른 절 그대로)', () => {
  const doc = '# P\n\n## 사람 할 일\n- [ ] a\n\n## 로드맵\n- [ ] I1\n';
  const once = upsertSection(doc, '## 디자인 도구 계획\n첫판\n');
  assert.match(once, /## 디자인 도구 계획\n첫판\n\n## 로드맵/);
  const twice = upsertSection(once, '## 디자인 도구 계획\n둘째\n');
  assert.equal(twice.match(/## 디자인 도구 계획/g).length, 1);
  assert.match(twice, /둘째/);
  assert.match(twice, /## 사람 할 일\n- \[ \] a/);
});

test('tool-plan: 설치 확인은 실제 파일·설정을 본다', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  const project = mkdtempSync(join(tmpdir(), 'proj-'));
  mkdirSync(join(home, '.claude/skills/impeccable'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/impeccable/SKILL.md'), '---');
  mkdirSync(join(home, '.claude/plugins/cache/anthropic-agent-skills/example-skills/1.0/skills/frontend-design'), { recursive: true });
  writeFileSync(join(home, '.claude/plugins/cache/anthropic-agent-skills/example-skills/1.0/skills/frontend-design/SKILL.md'), '---');
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp@latest'] } } }));
  assert.deepEqual(detect({ home, project }).sort(), ['frontend-design', 'impeccable', 'playwright-mcp']);
});
