#!/usr/bin/env node
// 푸시 전 로컬 검증 (Windows·Mac·Linux 공통) — CI 와 같은 순서로 npm 스크립트를 차례로 돌리고 처음 실패에서 멈춘다.
//   npm run check            ·  E2E 빼고: npm run check -- --fast
// 순서는 STEPS 만 고친다. package.json 에 없는 스크립트는 건너뛴다.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const STEPS = ['legal', 'quality', 'lint', 'test', 'test:e2e'];
export function plan(pkg, { fast = false } = {}) {
  const have = Object.keys(pkg.scripts ?? {});
  return STEPS.filter((s) => have.includes(s) && !(fast && s === 'test:e2e'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const steps = plan(pkg, { fast: process.argv.includes('--fast') });
  const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status;
  for (const s of steps) {
    console.log(`\n▶ ${s}`);
    if (run('npm', ['run', s]) !== 0) { console.error(`\n✗ ${s} 실패 — 출력을 AI 에게 보여 주거나 npm run doctor -- --explain`); process.exit(1); }
  }
  if (run('npm', ['audit', '--omit=dev', '--audit-level=high']) !== 0) { console.error('\n✗ 의존성 보안 문제 — AI 에게 "npm audit 고쳐 줘"'); process.exit(1); }
  console.log('\n✓ 모든 검사 통과');
}
