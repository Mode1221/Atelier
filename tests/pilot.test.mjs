import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVIDENCE, check, globToRegExp, parseRoadmap } from '../skills/pilot/scripts/gate-check.mjs';

const TEMPLATE = readFileSync(new URL('../skills/pilot/templates/PROJECT.md', import.meta.url), 'utf8');

test('gate-check: 로드맵 줄 읽기 (완료·N/A·사람 대기)', () => {
  const items = parseRoadmap('- [x] I1 문제\n- [ ] B5 결제 — N/A (무료)\n- [ ] I4 수요 — 사람 대기 (인터뷰)\n- [x] B12 배포\n아무 줄');
  assert.deepEqual(items.map((i) => [i.id, i.done, i.na, i.waiting]), [['I1', true, false, false], ['B5', false, true, false], ['I4', false, false, true], ['B12', true, false, false]]);
});

test('gate-check: 빠른 길로 미룬 항목은 할 일이 아니라 나중 — 템플릿은 필수만 할 일로 남는다', () => {
  const [a, b] = parseRoadmap('- [ ] B6 알림 — 나중 (빠른 길)\n- [ ] B4 핵심 기능');
  assert.equal(a.later, true);
  assert.equal(b.later, false);
  const rows = check(new URL('../skills/pilot/templates/', import.meta.url).pathname, TEMPLATE).rows;
  const later = rows.filter((r) => r.status === 'later').map((r) => r.id);
  for (const id of ['I3', 'I4', 'D5', 'B6', 'B7', 'G2', 'O9']) assert.ok(later.includes(id), id);
  for (const id of ['I1', 'I7', 'S1', 'S6', 'D4', 'B4', 'B9', 'B12', 'G1', 'G4', 'L1', 'L5', 'O1', 'O3', 'R1']) assert.ok(!later.includes(id), id);
});

test('gate-check: 파일 패턴', () => {
  assert.ok(globToRegExp('**/tokens.css').test('public/static/tokens.css'));
  assert.ok(globToRegExp('**/tokens.css').test('tokens.css'));
  assert.ok(globToRegExp('design/shots/*.png').test('design/shots/a.png'));
  assert.ok(!globToRegExp('design/shots/*.png').test('design/shots/x/a.png'));
  assert.ok(globToRegExp('legal/*privacy*').test('legal/privacy-policy.md'));
  assert.ok(!globToRegExp('docs/idea.md').test('docs/ideaXmd'));
});

test('gate-check: 완료 표시인데 증거가 없으면 잡는다, 있으면 통과', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const project = '- [x] I1 문제\n- [x] I7 이름\n- [x] D4 시안\n- [x] B14 지도\n- [ ] B5 결제 — N/A (무료)\n- [x] X9 모르는 항목';
  let r = check(dir, project);
  assert.deepEqual(r.problems.map((p) => p.id), ['I1', 'I7', 'D4', 'B14']);
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'design/shots'), { recursive: true });
  writeFileSync(join(dir, 'docs/idea.md'), '# 아이디어\n## 이름·상표\nKIPRIS 검색 결과 없음');
  writeFileSync(join(dir, 'design/shots/home.png'), '');
  writeFileSync(join(dir, 'docs/service-map.md'), '# 지도');
  r = check(dir, project);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.find((x) => x.id === 'B5').status, 'na');
});

test('gate-check: node_modules 안 파일은 증거로 치지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  mkdirSync(join(dir, 'node_modules/x'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/x/tokens.css'), '');
  assert.deepEqual(check(dir, '- [x] D3 토큰').problems.map((p) => p.id), ['D3']);
});

test('PROJECT.md 템플릿: 세부 단계 ID 가 겹치지 않고, 증거 규칙의 ID 는 모두 템플릿에 있다', () => {
  const ids = parseRoadmap(TEMPLATE).map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, '중복 ID');
  for (const id of Object.keys(EVIDENCE)) assert.ok(ids.includes(id), `템플릿에 ${id} 없음`);
  for (const id of ['I7', 'S8', 'B14', 'B15', 'G8', 'O9']) assert.ok(ids.includes(id), id);
});

test('예시 프로젝트: 완료 표시와 산출물이 맞다', () => {
  for (const ex of ['beolgeum-jangbu', 'chaenggim-pyo']) {
    const root = new URL(`../examples/${ex}/`, import.meta.url).pathname;
    const { problems } = check(root, readFileSync(join(root, 'PROJECT.md'), 'utf8'));
    assert.deepEqual(problems.map((p) => p.id), [], ex);
  }
});

test('install-tools: 복사본은 같은 폴더 import 로 바뀌고, 예시 프로젝트 복사본은 원본과 같다', async () => {
  const { vendor, install } = await import('../skills/pilot/scripts/install-tools.mjs');
  const out = vendor('build/scripts/quality-gate.mjs', "#!/usr/bin/env node\nimport { a } from '../../pilot/scripts/gate-check.mjs';\nimport { b } from './migration-check.mjs';\n");
  assert.match(out, /^#!\/usr\/bin\/env node\n\/\/ Atelier .* 복사본/);
  assert.ok(out.includes("from './gate-check.mjs'") && out.includes("from './migration-check.mjs'"));
  assert.ok(!out.includes('eslint-disable'));
  assert.ok(vendor('usertest/scripts/walk.mjs', 'const x = document.body;').includes('/* eslint-disable */'));
  for (const ex of ['beolgeum-jangbu', 'chaenggim-pyo']) {
    const root = new URL(`../examples/${ex}/`, import.meta.url).pathname;
    const { results } = install(root, { check: true });
    assert.deepEqual(results.filter((r) => r.status !== '같음').map((r) => r.file), [], `${ex}: node skills/pilot/scripts/install-tools.mjs examples/${ex} 로 갱신`);
  }
});

test('progress: PROJECT.md → 진행 화면 (나중·해당 없음은 빼고 셈, 지금 단계 표시)', async () => {
  const { parse, render } = await import('../skills/pilot/scripts/progress.mjs');
  const md = `# 테스트\n\n## 개요\n- 한 줄 설명: 예시 <b>\n\n## 현재 단계\n- 단계: 2 기획\n- 다음 할 일: S3\n\n## 사람 할 일\n- [ ] 가입하기\n- [x] 끝난 일\n\n## 로드맵\n### 1 아이디어 — idea\n- [x] I1 문제\n- [ ] I3 — 나중 (빠른 길)\n### 2 기획 — spec\n- [x] S1 기능\n- [ ] S2 N/A (계정 없음)\n- [ ] S3 데이터\n- [ ] S4 화면 — 사람 대기 (결정)\n\n## 결정 기록\n`;
  const m = parse(md);
  assert.deepEqual([m.done, m.total, m.later], [2, 4, 1]);
  assert.deepEqual(m.stages.map((s) => s.status), ['done', 'current']);
  assert.equal(m.stages[1].items.find((i) => i.id === 'S4').state, 'waiting');
  const html = render(m, { now: new Date('2026-10-01') });
  assert.match(html, /50%/);
  assert.match(html, /예시 &lt;b&gt;/);
  assert.match(html, /가입하기/);
  assert.doesNotMatch(html, /끝난 일/);
});

test('progress: 예시 프로젝트도 읽힌다', async () => {
  const { parse } = await import('../skills/pilot/scripts/progress.mjs');
  for (const ex of ['chaenggim-pyo', 'beolgeum-jangbu']) {
    const m = parse(readFileSync(new URL(`../examples/${ex}/PROJECT.md`, import.meta.url), 'utf8'));
    assert.equal(m.stages.length, 8, ex);
    assert.ok(m.total > 40 && m.done > 0, ex);
  }
});
