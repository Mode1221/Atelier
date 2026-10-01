#!/usr/bin/env node
// Atelier 0.26.2 의 skills/pilot/scripts/gate-check.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier pilot — 체크박스와 실제 산출물이 맞는지 확인한다 (PROJECT.md 에 [x] 인데 증거 파일이 없으면 알림).
// "했다"는 말이 아니라 파일로 확인 — 테스트는 통과했는데 화면을 한 번도 안 본 경우 같은 빈틈을 잡는다.
// 사용 (프로젝트 폴더에서): node <atelier>/skills/pilot/scripts/gate-check.mjs [PROJECT.md] [--json]
// 종료 코드: 증거 없는 완료 항목이 있으면 1
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// 항목 ID → 증거 (하나라도 맞으면 통과). 문자열 = 파일 패턴(* 는 한 단계, ** 는 여러 단계), { file, has } = 파일에 글자 포함
export const EVIDENCE = {
  I1: ['docs/idea.md'], I2: ['docs/idea.md'], I3: ['docs/idea.md'], I5: ['docs/idea.md'], I6: ['docs/idea.md'],
  I7: [{ file: 'docs/idea.md', has: '상표' }],
  S1: ['docs/spec.md'], S2: ['docs/spec.md'], S3: ['docs/spec.md', 'docs/architecture.md'], S4: ['docs/architecture.md', 'docs/spec.md'],
  S5: ['docs/spec.md'], S6: ['docs/spec.md'], S7: ['docs/spec.md'], S8: [{ file: 'docs/spec.md', has: '한 장 요약' }],
  D0: ['docs/design.md'], D1: ['docs/design.md'], D2: ['docs/design.md'], D3: ['**/tokens.css', 'design/tokens.*'],
  D4: ['design/shots/*.png', 'design/shots/*.jpg', 'design/shots/**/*.png'], D6: ['docs/design.md'],
  D7: ['**/favicon.*', '**/og.png', '**/icon.png'],
  B1: ['.gitignore'], B2: ['migrations/*', '**/migrations/*', 'supabase/migrations/*', 'prisma/schema.prisma', { file: 'docs/spec.md', has: '기기 저장' }], // 서버 DB 없는 앱은 spec 에 저장 방식(기기 저장·스키마 버전)을 적은 것으로
  B10: ['test/*', 'tests/*', 'e2e/*', '**/*.test.*', '**/*.spec.*'], B12: ['.github/workflows/*', 'scripts/deploy-first.mjs', 'eas.json'],
  B13: ['docs/build.md'], B14: ['docs/service-map.md'],
  G1: ['docs/guard.md'], G3: ['docs/guard.md'], G4: ['legal/*privacy*', 'legal/*개인정보*'], G5: ['THIRD_PARTY_NOTICES.md', 'NOTICE*'],
  G7: ['docs/rules.md'], G8: [{ file: 'docs/service-map.md', has: '2단계' }],
  L1: ['docs/usertest/*/summary.md', 'docs/usertest/*.md'], L3: ['docs/launch.md'], L4: ['docs/share/posts.json', 'docs/launch.md'],
  L5: ['docs/launch.md'], L7: [{ file: 'docs/launch.md', has: '회고' }],
  O2: ['docs/runbook.md', 'docs/operations.md'], O3: ['docs/operations.md', 'scripts/backup.mjs'], O4: ['docs/operations.md', 'docs/support.md'],
  O5: ['docs/costs.md', 'docs/operations.md'], O7: ['CHANGELOG.md'], O9: [{ file: 'docs/operations.md', has: '종료' }],
  R1: ['docs/growth.md'],
};

const SKIP = new Set(['node_modules', '.git', '.wrangler', 'data', 'test-results', 'playwright-report', 'dist', 'build', '.next']);
function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(relative(root, p).split('\\').join('/'));
    }
  };
  walk(root);
  return out;
}
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// PROJECT.md 로드맵 줄: "- [x] B14 서비스 지도 — 메모" / "- [ ] B6 알림 — 나중 (빠른 길)" (빠른 길로 미룬 항목은 할 일로 세지 않는다)
export function parseRoadmap(text) {
  const items = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*- \[( |x|X)\] ([A-Z]\d+)\b(.*)$/);
    if (!m) continue;
    const rest = m[3];
    items.push({ id: m[2], done: m[1] !== ' ', na: /N\/A|건너뜀/.test(rest), later: m[1] === ' ' && /나중 \(빠른 길\)/.test(rest), waiting: /사람 대기/.test(rest), text: rest.trim() });
  }
  return items;
}

export function check(root, projectText) {
  const files = listFiles(root);
  const has = (ev) => {
    if (typeof ev === 'string') {
      const re = globToRegExp(ev);
      return files.some((f) => re.test(f));
    }
    const p = join(root, ev.file);
    return existsSync(p) && readFileSync(p, 'utf8').includes(ev.has);
  };
  const items = parseRoadmap(projectText);
  const rows = items.map((it) => {
    const rules = EVIDENCE[it.id];
    if (!it.done || it.na || !rules) return { ...it, status: it.na ? 'na' : it.done ? 'done' : it.later ? 'later' : 'todo' };
    return { ...it, status: rules.some(has) ? 'done' : 'no-evidence', expected: rules.map((r) => (typeof r === 'string' ? r : `${r.file} 에 "${r.has}"`)) };
  });
  return { rows, problems: rows.filter((r) => r.status === 'no-evidence') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) ?? 'PROJECT.md';
  if (!existsSync(file)) {
    console.error(`✗ ${file} 이 없어요 — 프로젝트 폴더에서 실행하거나 경로를 알려 주세요`);
    process.exit(2);
  }
  const root = join(file, '..');
  const { rows, problems } = check(root, readFileSync(file, 'utf8'));
  if (args.includes('--json')) console.log(JSON.stringify({ rows, problems }, null, 2));
  else {
    const n = (s) => rows.filter((r) => r.status === s).length;
    console.log(`완료 ${n('done')} · 할 일 ${n('todo')} · 나중 ${n('later')} · 해당 없음 ${n('na')} · 증거 없는 완료 ${problems.length}`);
    for (const p of problems) console.log(`✗ ${p.id} 완료로 표시됐지만 증거가 없어요 — 있어야 할 것: ${p.expected.join(' 또는 ')}`);
    if (!problems.length) console.log('✓ 완료 표시와 산출물이 맞아요');
  }
  process.exit(problems.length ? 1 : 0);
}
