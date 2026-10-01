import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { QUESTIONS, RULES, detect, judge, render } from '../skills/guard/scripts/rules-kr.mjs';

const SCRIPT = new URL('../skills/guard/scripts/rules-kr.mjs', import.meta.url).pathname;

test('규칙은 있는 질문만 쓰고, 법령 링크·종류가 있다', () => {
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const r of RULES) {
    for (const w of r.when) assert.ok(ids.has(w), `${r.id}: ${w}`);
    assert.match(r.link, /^https:\/\//);
    assert.ok(['금지', '신고', '화면', '약관', '처리방침', '확인'].includes(r.kind), r.id);
  }
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length, 'id 중복 없음');
});

test('판정: 예/아니요/모름', () => {
  const all = Object.fromEntries(QUESTIONS.map((q) => [q.id, false]));
  const r = judge({ ...all, pay: true, market: true, sub: undefined });
  const ids = r.sure.map((x) => x.id);
  assert.ok(ids.includes('mailorder') && ids.includes('escrow') && ids.includes('broker'));
  assert.ok(!ids.includes('subnotice'));
  assert.deepEqual(r.ask.map((q) => q.id), ['sub']);
  assert.match(render(r), /\| 금지 \| 거래 대금을 직접 맡지 않기/);
  assert.match(render(r), /대표에게 물을 것[\s\S]*자동으로/);
});

test('문서에서 추정 → --yes 로 확정 → docs/rules.md', () => {
  assert.equal(detect('동네 중고 거래 앱, 내 주변 매물 지도').market, true);
  assert.equal(detect('할 일 목록').market, false);
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/idea.md'), '초등학생 숙제 기록 앱. 친구와 채팅.');
  const asked = JSON.parse(execFileSync('node', [SCRIPT, root, '--json'], { encoding: 'utf8' }));
  assert.ok(asked.ask.includes('kids') && asked.ask.includes('ugc'));
  const out = execFileSync('node', [SCRIPT, root, '--yes', 'kids,ugc', '--write'], { encoding: 'utf8' });
  assert.match(out, /docs\/rules\.md 저장/);
  const md = readFileSync(join(root, 'docs/rules.md'), 'utf8');
  assert.match(md, /만 14세 미만 법정대리인 동의/);
  assert.match(md, /신고 버튼/);
  assert.throws(() => execFileSync('node', [SCRIPT, root, '--yes', 'nope'], { stdio: 'pipe' }));
});

test('업종 패턴: 규제 id·템플릿 이름이 실제로 있다', async () => {
  const { MAP } = await import('../skills/build/templates/add.mjs');
  const md = readFileSync(new URL('../skills/spec/references/domain-patterns.md', import.meta.url), 'utf8');
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const line of md.split('\n')) {
    const words = (s) => s.replace(/\([^)]*\)/g, '').split(/[·,]/).map((w) => w.trim().split(/\s/)[0]).filter((w) => /^[a-z_]+$/.test(w));
    if (line.startsWith('- 규제 id:')) for (const w of words(line.slice(line.indexOf(':') + 1))) assert.ok(ids.has(w), `규제 id ${w}`);
    if (line.startsWith('- 템플릿:')) for (const w of words(line.slice(line.indexOf(':') + 1))) assert.ok(MAP[w], `템플릿 ${w}`);
  }
});
