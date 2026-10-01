#!/usr/bin/env node
// Atelier operate — GitHub 없이 코드·데이터 백업 (명령 한 줄).
// 1) 바뀐 파일을 git 에 기록(처음이면 git 시작) 2) 코드 전체를 파일 하나(.bundle)로 묶어 백업 폴더에 복사
// 3) 운영 DB(Cloudflare D1)가 있으면 .sql 로 내보내기 4) 오래된 백업 정리(최근 14개).
// 백업 폴더는 구글 드라이브·OneDrive·iCloud·Dropbox 처럼 **클라우드와 동기화되는 폴더**를 권한다 → 컴퓨터가 고장 나도 남는다.
// 비밀값(.atelier/, .dev.vars, .env)은 .gitignore 로 빠진다.
// 사용 (프로젝트 폴더에서): npm run backup [-- --to <폴더> [--remember]]  (--to 는 처음 정할 때만 기억, 이후엔 --remember 로 바꿈)     복구: git clone <백업.bundle> 새폴더
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const KEEP = 14;
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// 클라우드 동기화 폴더 후보 (있는 것만)
export function syncedFolders(home = homedir()) {
  const c = [
    join(home, 'Google Drive', 'My Drive'), join(home, 'Google Drive'), join(home, '내 드라이브'),
    join(home, 'OneDrive'), join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), join(home, 'Dropbox'),
  ];
  try { for (const d of readdirSync(join(home, 'Library', 'CloudStorage'))) c.push(join(home, 'Library', 'CloudStorage', d)); } catch { /* 맥이 아니면 없음 */ }
  return c.filter((p) => existsSync(p));
}

export function ensureRepo(root, now = new Date()) {
  if (!existsSync(join(root, '.git'))) {
    git(root, ['init', '-q']);
    const gi = join(root, '.gitignore');
    const base = ['node_modules/', '.wrangler/', '.atelier/', '.dev.vars', '.env', 'data/'];
    const cur = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    const add = base.filter((l) => !cur.split(/\r?\n/).includes(l));
    if (add.length) writeFileSync(gi, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`);
  }
  git(root, ['add', '-A']);
  if (!git(root, ['status', '--porcelain'])) return false;
  // 이름·이메일이 설정 안 된 컴퓨터에서도 기록되게 (이 저장소에서만)
  const who = ['-c', 'user.name=Atelier backup', '-c', 'user.email=backup@atelier.local'];
  const hasName = spawnSync('git', ['config', 'user.name'], { cwd: root }).status === 0;
  git(root, [...(hasName ? [] : who), 'commit', '-q', '-m', `backup: ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`]);
  return true;
}

export function prune(dir, project, keep = KEEP) {
  const mine = (ext) => readdirSync(dir).filter((f) => f.startsWith(`${project}-`) && f.endsWith(ext)).sort();
  const removed = [];
  for (const ext of ['.bundle', '.sql']) for (const f of mine(ext).slice(0, -keep)) { rmSync(join(dir, f)); removed.push(f); }
  return removed;
}

export function backup({ root = process.cwd(), to, remember = false, now = new Date(), exportDb = defaultExportDb, log = console.log } = {}) {
  const cfgFile = join(root, '.atelier', 'backup.json');
  const cfg = readJson(cfgFile) ?? {};
  const dest = to || cfg.dir;
  if (!dest) {
    const found = syncedFolders();
    throw new Error(`백업할 폴더를 정해 주세요: npm run backup -- --to <폴더>\n${found.length ? `  클라우드와 동기화되는 폴더를 찾았어요 (추천):\n${found.map((f) => `   ${join(f, 'Atelier 백업')}`).join('\n')}` : '  구글 드라이브·OneDrive·iCloud 같은 동기화 폴더를 권해요 (컴퓨터가 고장 나도 남음)'}`);
  }
  // 처음 정할 때만 기억한다. 이미 정한 폴더가 있으면 --to 는 이번 한 번만(시험 백업이 사람이 고른 폴더를 덮지 않게), 바꾸려면 --remember
  if (to && to !== cfg.dir && (!cfg.dir || remember)) { mkdirSync(join(root, '.atelier'), { recursive: true }); writeFileSync(cfgFile, `${JSON.stringify({ ...cfg, dir: to }, null, 2)}\n`); }
  mkdirSync(dest, { recursive: true });

  const project = basename(root).replace(/[^\w.-]+/g, '_') || 'project';
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  log('1/3 바뀐 파일 기록');
  const committed = ensureRepo(root, now);
  log(committed ? '   새로 기록했어요' : '   바뀐 게 없어요');
  log('2/3 코드 묶어 복사');
  const bundle = join(dest, `${project}-${stamp}.bundle`);
  git(root, ['bundle', 'create', '-q', bundle, '--all']);
  git(root, ['bundle', 'verify', '-q', bundle]);
  log('3/3 운영 데이터');
  const db = exportDb(root, join(dest, `${project}-${stamp}.sql`), log);
  const removed = prune(dest, project);
  log(`\n✅ 백업: ${bundle}${db ? `\n   데이터: ${db}` : ''}${removed.length ? `\n   오래된 백업 ${removed.length}개 정리 (최근 ${KEEP}개 보관)` : ''}\n복구: git clone "${bundle}" 새폴더`);
  return { bundle, db, committed, removed };
}

// wrangler.toml 에 D1 이 있으면 운영 DB 를 .sql 로 (로그인 안 돼 있으면 건너뜀 — 백업은 계속)
function defaultExportDb(root, out, log) {
  const toml = existsSync(join(root, 'wrangler.toml')) ? readFileSync(join(root, 'wrangler.toml'), 'utf8') : '';
  const name = toml.match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
  if (!name) { log('   DB 없음 — 건너뜀'); return null; }
  const r = spawnSync('npx', ['wrangler', 'd1', 'export', name, '--remote', '--output', out], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (r.status !== 0) { log('   운영 DB 를 내보내지 못했어요 (Cloudflare 로그인 필요할 수 있음 — npm run deploy:first 를 한 번 실행) — 코드 백업은 됐어요'); return null; }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--to');
  try { backup({ to: i >= 0 ? a[i + 1] : undefined, remember: a.includes('--remember') }); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
