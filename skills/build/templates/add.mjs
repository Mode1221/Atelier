#!/usr/bin/env node
// 기능 템플릿을 프로젝트에 넣는다 (이미 있는 파일은 덮지 않음 — 고친 것을 지키기 위해).
//   node <atelier>/skills/build/templates/add.mjs <이름> [프로젝트 폴더=.]
//   이름: pay · ai · upload · realtime · bot · extension · desktop · iap · ads
// 넣은 뒤 할 일(코드 연결·비밀값·사람 할 일)은 각 템플릿 README / 파일 맨 위 설명에 있다.
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// 템플릿 안 경로 → 프로젝트 안 경로 (디렉터리는 통째로)
export const MAP = {
  pay: { 'toss.js': 'src/pay/toss.js', 'store.js': 'src/pay/store.js', 'pay.js': 'src/pay/pay.js', 'plans.js': 'src/pay/plans.js', 'routes.js': 'src/pay/routes.js', 'public/pay': 'public/pay', 'pay.sql': 'migrations/{next}_pay.sql', 'pay-first.mjs': 'scripts/pay-first.mjs' },
  ai: { 'ai.js': 'src/ai/ai.js', 'ai.sql': 'migrations/{next}_ai.sql' },
  upload: { 'upload.js': 'src/upload/upload.js' },
  realtime: { 'room.js': 'src/realtime/room.js', 'client.js': 'public/realtime.js' },
  bot: { 'bot.js': 'src/bot/bot.js', 'setup.mjs': 'scripts/bot-setup.mjs', 'README.md': 'docs/bot.md' },
  extension: { src: 'extension', 'ext.mjs': 'scripts/ext.mjs', 'README.md': 'docs/extension.md' },
  desktop: { dist: 'dist', 'src-tauri': 'src-tauri', '.github/workflows/desktop.yml': '.github/workflows/desktop.yml', 'README.md': 'docs/desktop.md' },
  iap: { 'purchases.js': 'src/purchases.js', 'README.md': 'docs/iap.md' },
  ads: { 'ads.js': 'public/ads.js' },
};

function nextMigration(root) {
  const dir = join(root, 'migrations');
  const nums = existsSync(dir) ? readdirSync(dir).map((f) => Number(f.split('_')[0])).filter(Number.isFinite) : [];
  return String(Math.max(0, ...nums) + 1).padStart(4, '0');
}
function copy(src, dest, out, root) {
  if (statSync(src).isDirectory()) { for (const n of readdirSync(src)) copy(join(src, n), join(dest, n), out, root); return; }
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  out.push(dest.slice(root.length + 1).split('\\').join('/'));
}
export function add(name, root = '.') {
  const map = MAP[name];
  if (!map) throw new Error(`모르는 템플릿 "${name}" — 쓸 수 있는 것: ${Object.keys(MAP).join(', ')}`);
  const out = [];
  for (const [from, to] of Object.entries(map)) {
    if (to.includes('{next}') && existsSync(join(root, 'migrations')) && readdirSync(join(root, 'migrations')).some((f) => f.endsWith(`_${name}.sql`))) continue;
    copy(join(HERE, name, from), join(root, to.replace('{next}', nextMigration(root))), out, root);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [name, root = '.'] = process.argv.slice(2);
  try {
    const out = add(name, root);
    console.log(out.length ? `${name} 템플릿을 넣었어요:\n${out.map((x) => `  + ${x}`).join('\n')}` : '이미 들어 있어요(덮지 않음).');
    console.log(`다음: ${join(HERE, name)} 의 README·파일 맨 위 설명대로 연결`);
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
