#!/usr/bin/env node
// Atelier 0.28.0 의 skills/build/scripts/quality-gate.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier 품질 게이트 — 사람의 성실함 대신 자동으로 확인하는 5가지를 한 번에 (CI·push 전·게이트 판정 때).
//   1. 증거 검사 (pilot gate-check)   2. 요구사항 추적 (spec trace)   3. 분석 이벤트 계획 (spec events-check)
//   4. DB 변경 안전 (build migration-check)   5. 비밀값 유출 (guard secret-scan)
// 해당 파일이 없는 검사는 건너뛴다 (예: 명세 없는 프로젝트). 사용: node <atelier>/skills/build/scripts/quality-gate.mjs [폴더]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check as gateCheck } from './gate-check.mjs';
import { trace } from './trace.mjs';
import { checkEvents } from './events-check.mjs';
import { checkMigrations } from './migration-check.mjs';
import { scan } from './secret-scan.mjs';
import { pathToFileURL } from 'node:url';

export function runGate(root) {
  const out = [];
  const add = (name, skipped, problems, fix) => out.push({ name, skipped, problems, fix });
  const project = join(root, 'PROJECT.md');
  if (existsSync(project)) {
    const r = gateCheck(root, readFileSync(project, 'utf8'));
    add('증거 검사', false, r.problems.map((p) => `${p.id} 완료 표시인데 결과물 없음 (${p.expected.join(' 또는 ')})`), 'node skills/pilot/scripts/gate-check.mjs');
  } else add('증거 검사', 'PROJECT.md 없음', []);
  const hasSpec = existsSync(join(root, 'docs/spec.md'));
  if (hasSpec) {
    const t = trace(root);
    add('요구사항 추적', t.error ?? false, (t.missing ?? []).map((m) => `${m.id} ${m.title.slice(0, 30)} — 테스트 없음`), '테스트 이름에 기능 ID (예: describe(\'F3 …\'))');
    const e = checkEvents(root);
    add('분석 이벤트 계획', e.error ?? false, [...(e.missing ?? []).map((n) => `계획에만: ${n}`), ...(e.undeclared ?? []).map((n) => `코드에만: ${n}`)], 'docs/spec.md S6 표와 코드 맞추기');
  } else {
    add('요구사항 추적', 'docs/spec.md 없음', []);
    add('분석 이벤트 계획', 'docs/spec.md 없음', []);
  }
  const m = checkMigrations(root);
  add('DB 변경 안전', m.files.length ? false : '마이그레이션 없음', [...m.blocking.flatMap((b) => b.hits.map((h) => `${b.file}: ${h.kind}`)), ...m.duplicates.map(([a, b]) => `번호 겹침 ${a} · ${b}`)], '확장→이전→축소, 일부러면 파일에 -- migration-check: ok <이유>');
  const s = scan(root);
  add('비밀값 유출', false, s.map((h) => `${h.file}${h.line ? `:${h.line}` : ''} ${h.kind}`), '값 지우고, 올라간 적 있으면 키 폐기·재발급');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] ?? '.';
  const res = runGate(root);
  let fail = 0;
  for (const r of res) {
    if (r.skipped) console.log(`– ${r.name}: 건너뜀 (${r.skipped})`);
    else if (!r.problems.length) console.log(`✓ ${r.name}`);
    else {
      fail += 1;
      console.log(`✗ ${r.name} (${r.problems.length})`);
      for (const p of r.problems.slice(0, 10)) console.log(`   · ${p}`);
      console.log(`   → ${r.fix}`);
    }
  }
  console.log(fail ? `\n품질 게이트 실패 ${fail}개` : '\n✓ 품질 게이트 통과');
  process.exit(fail ? 1 : 0);
}
