#!/usr/bin/env node
// Atelier 0.11.0 의 skills/spec/scripts/trace.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier spec — 요구사항 추적: 명세의 기능(스토리) ID 마다 그 ID 를 이름에 단 테스트가 있는지 확인한다.
// 규칙: docs/spec.md S1 표의 첫 칸 ID(F1, F2, S3 …) → 테스트 이름에 그 ID 를 쓴다 (예: describe('F3 준비물 맡기', …)).
// 사용: node <atelier>/skills/spec/scripts/trace.mjs [프로젝트 폴더] [--json]   · 테스트 없는 스토리가 있으면 종료 코드 1
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles, isTest } from './lib.mjs';

// S1 절의 스토리 ID 와 제목. 표 "| F1 | 총무로서 … |" 또는 제목 "### F1. 모임 만들기 (Must)". "(나중)"·"Won't"·"N/A" 는 제외
export function parseStories(spec) {
  const out = [];
  let inS1 = false;
  for (const line of spec.split('\n')) {
    if (/^##\s/.test(line)) inS1 = /S1\b|스토리/.test(line);
    if (!inS1) continue;
    const m = line.match(/^\|\s*([A-Z]{1,3}\d+(?:-\d+)?)\s*\|\s*([^|]+)\|/) ?? line.match(/^###\s+([A-Z]{1,3}\d+(?:-\d+)?)[.)]?\s+(.+)$/);
    if (m && !/N\/A|Won't|나중/.test(line)) out.push({ id: m[1], title: m[2].trim() });
  }
  return out;
}

// 테스트 글에 나온 ID 모음. 범위 "F2~F4" 도 펼친다
export function idsIn(text) {
  const ids = new Set();
  for (const m of text.matchAll(/['"`]\s*([A-Z]{1,3})(\d+)\s*~\s*(?:[A-Z]{1,3})?(\d+)/g)) for (let n = +m[2]; n <= +m[3] && n - +m[2] < 50; n++) ids.add(`${m[1]}${n}`);
  for (const m of text.matchAll(/['"`]\s*((?:[A-Z]{1,3}\d+(?:-\d+)?)(?:\s*[,·/]\s*[A-Z]{1,3}\d+(?:-\d+)?)*)(?![\d-])/g))
    for (const id of m[1].split(/\s*[,·/]\s*/)) ids.add(id);
  return ids;
}

export function trace(root) {
  const specPath = join(root, 'docs/spec.md');
  if (!existsSync(specPath)) return { error: 'docs/spec.md 가 없어요' };
  const stories = parseStories(readFileSync(specPath, 'utf8'));
  const tests = listFiles(root).filter(isTest).map((f) => ({ f, ids: idsIn(readFileSync(join(root, f), 'utf8')) }));
  const rows = stories.map((s) => ({ ...s, files: tests.filter((t) => t.ids.has(s.id)).map((t) => t.f) }));
  return { rows, missing: rows.filter((r) => !r.files.length) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const r = trace(root);
  if (r.error) {
    console.error(`✗ ${r.error}`);
    process.exit(2);
  }
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    for (const row of r.rows) console.log(`${row.files.length ? '✓' : '✗'} ${row.id} ${row.title.slice(0, 40)} — ${row.files.length ? row.files.join(', ') : '테스트 없음'}`);
    console.log(r.missing.length ? `\n테스트 없는 기능 ${r.missing.length}개 — 테스트 이름에 ID 를 넣어 연결하세요 (예: describe('${r.missing[0].id} …'))` : `\n✓ 기능 ${r.rows.length}개 모두 테스트와 연결됨`);
  }
  process.exit(r.missing.length ? 1 : 0);
}
