#!/usr/bin/env node
// Atelier — 검사 도구를 프로젝트에 복사한다 (CI 에는 플러그인 폴더가 없으므로 프로젝트 안에 있어야 돈다).
// 복사 위치: <프로젝트>/scripts/atelier/  ·  package.json 에 "quality"(품질 게이트) 스크립트 추가
// 플러그인을 업데이트한 뒤 다시 실행하면 최신 도구로 바뀐다 (다시 실행해도 안전).
// 사용 (프로젝트 폴더에서): node <atelier>/skills/pilot/scripts/install-tools.mjs [프로젝트 폴더] [--check]
//   --check: 복사본이 플러그인 원본과 같은지만 확인 (다르면 종료 코드 1)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// 복사할 도구: [원본 (skills/ 기준), 설명]
export const TOOLS = [
  ['spec/scripts/lib.mjs', '공통'],
  ['pilot/scripts/gate-check.mjs', '증거 검사'],
  ['spec/scripts/trace.mjs', '요구사항 추적'],
  ['spec/scripts/events-check.mjs', '분석 이벤트 계획'],
  ['build/scripts/migration-check.mjs', 'DB 변경 안전'],
  ['guard/scripts/secret-scan.mjs', '비밀값 유출'],
  ['build/scripts/quality-gate.mjs', '품질 게이트 (위 5개)'],
  ['usertest/scripts/walk.mjs', 'AI 대리 사용성 테스트 실행기'],
  ['operate/scripts/repo-traffic.mjs', '저장소 방문 통계 (GitHub Traffic 모으기)'],
];

const version = () => {
  try {
    return JSON.parse(readFileSync(join(SKILLS, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return '?';
  }
};

// 원본의 상대 경로 import 를 같은 폴더(./이름.mjs)로 바꾸고, 머리에 출처를 단다
export function vendor(src, text) {
  const body = text.replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+\.mjs)'/g, "from './$1'");
  const lines = body.split('\n');
  const at = lines[0].startsWith('#!') ? 1 : 0;
  const head = [`// Atelier ${version()} 의 skills/${src} 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트`];
  // 브라우저 안에서 도는 코드(document·window)가 섞인 파일만 린터 제외 — 나머지는 흔한 규칙을 통과한다
  if (/\bdocument\.|\bwindow\./.test(body)) head.push('/* eslint-disable */');
  lines.splice(at, 0, ...head);
  return lines.join('\n');
}

export function install(root, { check = false } = {}) {
  const dir = join(root, 'scripts', 'atelier');
  const results = [];
  for (const [src, what] of TOOLS) {
    const want = vendor(src, readFileSync(join(SKILLS, src), 'utf8'));
    const dest = join(dir, src.split('/').pop());
    const cur = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    const strip = (t) => t.replace(/^\/\/ Atelier .* 복사본.*$/m, ''); // 버전 줄만 다른 건 같은 것으로
    const same = cur !== null && strip(cur) === strip(want);
    if (!check && !same) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(dest, want);
    }
    results.push({ file: `scripts/atelier/${src.split('/').pop()}`, what, status: same ? '같음' : check ? (cur === null ? '없음' : '다름') : cur === null ? '추가' : '업데이트' });
  }
  const pkgPath = join(root, 'package.json');
  let script = null;
  if (!check && existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts ??= {};
    if (pkg.scripts.quality !== 'node scripts/atelier/quality-gate.mjs') {
      pkg.scripts.quality = 'node scripts/atelier/quality-gate.mjs';
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
      script = 'quality';
    }
  }
  return { results, script };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('사용: node install-tools.mjs [프로젝트 폴더=.] [--check]\n  검사 도구를 <프로젝트>/scripts/atelier/ 에 복사하고 package.json 에 "quality" 를 넣는다. --check 는 바꾸지 않고 낡았는지만 본다.');
    process.exit(0);
  }
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  const check = args.includes('--check');
  const { results, script } = install(root, { check });
  for (const r of results) console.log(`${r.status === '같음' ? '✓' : check ? '✗' : '+'} ${r.file} — ${r.what} (${r.status})`);
  if (check) process.exit(results.every((r) => r.status === '같음') ? 0 : 1);
  if (script) console.log('\npackage.json 에 "quality" 추가 → npm run quality');
  console.log(`\nCI 에 넣기 (GitHub Actions, 테스트 전에):\n      - name: 품질 게이트\n        run: npm run quality\n사용성 테스트 실행기: node scripts/atelier/walk.mjs docs/usertest/plan.json <출력 폴더>`);
}
