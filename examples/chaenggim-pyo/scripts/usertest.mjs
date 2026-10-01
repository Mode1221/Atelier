#!/usr/bin/env node
// AI 대리 사용성 테스트 실행기 (Windows·Mac·Linux 공통) — 로컬 workerd + 빈 D1 로 띄워 docs/usertest/plan.json 을 걷는다.
//   npm run usertest [-- 출력 폴더]   (기본 docs/usertest/<오늘>)   ·  PORT=8787 로 고정 가능
// 필요: scripts/free-port.mjs, scripts/atelier/walk.mjs (install-tools 가 넣음), 서버의 /health
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, testPort } from './free-port.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const npx = (args, opts = {}) => spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: win, ...opts });

const port = process.env.PORT ? Number(process.env.PORT) : await freePort();
if (process.env.PORT) await testPort(port); // 쓰이는 중이면 이유와 함께 멈춘다
const inspector = await freePort();
const out = process.argv[2] ?? `docs/usertest/${new Date().toISOString().slice(0, 10)}`;
rmSync(join(root, 'data/usertest'), { recursive: true, force: true });
if (npx(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', 'data/usertest'], { stdio: 'ignore', env: { ...process.env, CI: '1' } }).status !== 0) { console.error('✗ 로컬 DB 준비 실패 — npm run doctor'); process.exit(1); }
const server = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', 'data/usertest'], { cwd: root, stdio: 'ignore', shell: win, detached: !win, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
// 끌 때는 프로세스 그룹째 (npx → wrangler → workerd 가 남지 않게)
const stop = () => { try { win ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']) : process.kill(-server.pid, 'SIGTERM'); } catch { /* 이미 끝남 */ } };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
if (!up) { console.error(`✗ 테스트 서버가 포트 ${port} 에서 뜨지 않았어요 — npm run doctor`); process.exit(1); }
const r = spawnSync(process.execPath, [join(root, 'scripts/atelier/walk.mjs'), 'docs/usertest/plan.json', out], { cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}` } });
process.exit(r.status ?? 1);
