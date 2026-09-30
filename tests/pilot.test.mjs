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
