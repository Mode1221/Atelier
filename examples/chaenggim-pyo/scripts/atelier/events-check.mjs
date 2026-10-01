#!/usr/bin/env node
// Atelier 0.28.0 의 skills/spec/scripts/events-check.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier spec — 분석 이벤트 추적 계획 검증: docs/spec.md S6 에 정의한 이벤트와 코드가 실제로 보내는 이벤트를 대조한다.
// 계획에만 있고 코드에 없으면 → 출시 뒤 그 숫자가 영영 비어 있다. 코드에만 있으면 → 아무도 모르는 숫자가 쌓인다.
// S6 표기: 백틱 안 이벤트 이름, 속성은 {…} (예: `landing{src}`), 같은 접두어 묶음은 `item_claim|unclaim|pack`
// 사용: node <atelier>/skills/spec/scripts/events-check.mjs [프로젝트 폴더] [--emit '정규식(이름을 첫 괄호로)'] [--json]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles, isCode, isTest } from './lib.mjs';
import { pathToFileURL } from 'node:url';

export function parseDeclared(spec) {
  const sec = spec.split(/\n(?=##\s)/).find((s) => /^##\s*S6\b|^##\s.*(분석 이벤트|이벤트 설계)/m.test(s.split('\n')[0]));
  if (!sec) return null;
  const names = new Set();
  // 표가 있으면 이벤트는 표의 첫 칸에서만 읽는다 (속성 칸·설명 줄의 `visit_days` 같은 이름을 이벤트로 오인하지 않게)
  const rows = sec.split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l)).map((l) => l.split('|')[1] ?? '');
  const text = rows.some((c) => c.includes('`')) ? rows.join('\n') : sec;
  for (const m of text.matchAll(/`([a-z][a-z0-9_]*(?:\|[a-z0-9_]+)*)(?:\{[^}`]*\})?`/g)) {
    const [first, ...rest] = m[1].split('|');
    names.add(first);
    const prefix = first.includes('_') ? first.slice(0, first.lastIndexOf('_') + 1) : '';
    for (const r of rest) names.add(r.includes('_') ? r : prefix + r);
  }
  return names;
}

// 흔한 전송 방식: event(c,'x') · track('x') · capture('x') · logEvent('x') · gtag('event','x') · fetch('/api/events/x') · 로그 { event: 'x' }
export const EMIT = [
  /\b(?:event|track|capture|logEvent|trackEvent)\s*\(\s*(?:[\w.]+\s*,\s*)?['"`]([a-z][a-z0-9_]*)(\$\{)?/g,
  /gtag\(\s*['"]event['"]\s*,\s*['"]([a-z][a-z0-9_]*)/g,
  /\/api\/events\/([a-z][a-z0-9_]*)/g,
  /\bevent:\s*['"`]([a-z][a-z0-9_]*)(\$\{)?/g, // 구조화 로그 { event: 'x' }
];

export function checkEvents(root, { emit = EMIT } = {}) {
  const specPath = join(root, 'docs/spec.md');
  if (!existsSync(specPath)) return { error: 'docs/spec.md 가 없어요' };
  const declared = parseDeclared(readFileSync(specPath, 'utf8'));
  if (!declared) return { error: 'docs/spec.md 에 S6 분석 이벤트 절이 없어요' };
  const emitted = new Set();
  const dynamic = new Set(); // `item_${action}` 같은 동적 이름의 접두어
  for (const f of listFiles(root).filter((x) => isCode(x) && !isTest(x))) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const re of emit) for (const m of text.matchAll(new RegExp(re.source, 'g'))) (m[2] ? dynamic : emitted).add(m[1]);
  }
  const coveredByDynamic = (n) => [...dynamic].some((p) => n.startsWith(p));
  const missing = [...declared].filter((n) => !emitted.has(n) && !coveredByDynamic(n));
  const undeclared = [...emitted].filter((n) => !declared.has(n));
  return { declared: [...declared], emitted: [...emitted], dynamic: [...dynamic], missing, undeclared };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--emit');
  const root = args.find((a, j) => !a.startsWith('--') && args[j - 1] !== '--emit') ?? '.';
  const r = checkEvents(root, i >= 0 ? { emit: [new RegExp(args[i + 1], 'g')] } : undefined);
  if (r.error) {
    console.error(`✗ ${r.error}`);
    process.exit(2);
  }
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`계획 ${r.declared.length}개 · 코드 ${r.emitted.length}개${r.dynamic.length ? ` (+동적 ${r.dynamic.map((d) => `${d}*`).join(', ')})` : ''}`);
    for (const n of r.missing) console.log(`✗ 계획에만 있음: ${n} — 코드가 보내지 않아요 (출시 뒤 이 숫자는 비어 있게 됨)`);
    for (const n of r.undeclared) console.log(`✗ 코드에만 있음: ${n} — docs/spec.md S6 에 뜻·속성을 적으세요`);
    if (!r.missing.length && !r.undeclared.length) console.log('✓ 추적 계획과 코드가 맞아요');
  }
  process.exit(r.missing.length || r.undeclared.length ? 1 : 0);
}
