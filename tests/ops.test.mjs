// operate 스킬: 서비스 지킴이 (skills/operate/templates/watchdog)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../skills/operate/templates/watchdog/worker.js';
import { setupWatchdog, watchdogToml } from '../skills/operate/templates/watchdog/setup.mjs';

function kv() { const m = new Map(); let writes = 0; return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { writes++; m.set(k, v); }, writes: () => writes }; }

test('watchdog: 2번 연속 실패하면 한 번만 알리고, 살아나면 복구 알림, 정상일 땐 저장하지 않음', async () => {
  const STATE = kv();
  const env = { HEALTH_URL: 'https://svc.test/health', SERVICE_NAME: '벌금장부', NTFY_TOPIC: 'atelier-abc', STATE };
  const sent = [];
  let up = true;
  const fetchImpl = async (url, init) => {
    if (url.startsWith('https://ntfy.sh/')) { sent.push({ url, title: decodeURIComponent(init.headers.Title), body: init.body }); return new Response('ok'); }
    if (!up) throw new Error('connection refused');
    return new Response('ok');
  };
  await check(env, fetchImpl);
  assert.equal(STATE.writes(), 0);
  up = false;
  assert.equal((await check(env, fetchImpl)).alerted, null);
  assert.equal((await check(env, fetchImpl)).alerted, 'down');
  assert.equal((await check(env, fetchImpl)).alerted, null, '계속 죽어 있으면 다시 알리지 않음');
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /벌금장부 응답 없음/);
  assert.equal(sent[0].url, 'https://ntfy.sh/atelier-abc');
  up = true;
  assert.equal((await check(env, fetchImpl)).alerted, 'recovered');
  assert.match(sent[1].title, /복구/);
  const w = STATE.writes();
  await check(env, fetchImpl);
  assert.equal(STATE.writes(), w);
});

test('watchdog setup: 주소 확인 → 주제 생성·보관 → KV 재사용 → 배포·비밀값 → 시험 알림, 다시 돌려도 같은 주제', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wd-'));
  const dir = join(root, 'ops/watchdog');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'company/beolgeum'), { recursive: true });
  writeFileSync(join(root, 'company/beolgeum/service.json'), JSON.stringify({ name: '벌금장부', url: 'https://b.dev/' }));
  const calls = []; const puts = {};
  let kvs = [];
  const run = async (args, opts = {}) => {
    calls.push(args.slice(0, 3).join(' '));
    if (args[0] === 'whoami') return { code: 0, out: 'logged in' };
    if (args[1] === 'namespace' && args[2] === 'list') return { code: 0, out: JSON.stringify(kvs) };
    if (args[1] === 'namespace' && args[2] === 'create') { kvs = [{ id: 'kv123', title: args[3] }]; return { code: 0, out: '' }; }
    if (args[0] === 'secret') puts[args[2]] = opts.input;
    return { code: 0, out: '' };
  };
  const ntfy = [];
  const fetchImpl = async (url, init) => { if (url.startsWith('https://ntfy.sh/')) ntfy.push(url); return new Response('ok', { status: url.endsWith('/health') ? 200 : 200 }); };
  const r = await setupWatchdog({ root, dir, run, fetchImpl, log: () => {} });
  assert.equal(r.healthUrl, 'https://b.dev/health');
  assert.match(r.topic, /^atelier-[0-9a-f]{24}$/);
  assert.equal(puts.NTFY_TOPIC, r.topic);
  assert.ok(r.sent && ntfy.length === 1);
  const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
  assert.match(toml, /id = "kv123"/);
  assert.match(toml, /crons = \["\*\/5 \* \* \* \*"\]/);
  assert.ok(!toml.includes(r.topic), '주제는 설정 파일이 아니라 비밀값으로');
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\.atelier\/$/m);
  assert.ok(calls.includes('kv namespace create'));
  calls.length = 0;
  const again = await setupWatchdog({ root, dir, run, fetchImpl, log: () => {} });
  assert.equal(again.topic, r.topic);
  assert.ok(!calls.includes('kv namespace create'), '있는 저장소는 다시 쓴다');
  assert.match(watchdogToml({ name: 'x', healthUrl: 'u', serviceName: 'a"b', kvId: 'k' }), /SERVICE_NAME = "ab"/, '이름의 따옴표가 설정을 깨지 않음');
});

test('watchdog setup: 주소가 없으면 쉬운 말로 멈춘다', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wd-'));
  await assert.rejects(setupWatchdog({ root, dir: root, run: async () => ({ code: 0, out: '' }), fetchImpl: async () => new Response(''), log: () => {} }), /서비스 주소/);
});

import { backup, prune } from '../skills/operate/templates/backup.mjs';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

test('backup: git 이 없던 폴더도 기록을 시작하고, 묶음 파일로 복구되며, 비밀값은 빠진다', () => {
  const root = mkdtempSync(join(tmpdir(), 'bk-'));
  const dest = mkdtempSync(join(tmpdir(), 'bk-dest-'));
  writeFileSync(join(root, 'index.js'), 'console.log(1)\n');
  mkdirSync(join(root, '.atelier'));
  writeFileSync(join(root, '.atelier/secrets.json'), '{"FEEDBACK_TOKEN":"secret"}');
  writeFileSync(join(root, '.dev.vars'), 'X=1');
  const r = backup({ root, to: dest, now: new Date('2026-09-30T01:02:00Z'), exportDb: () => null, log: () => {} });
  assert.equal(r.committed, true);
  assert.match(r.bundle, /-20260930-0102\.bundle$/);
  const restored = join(mkdtempSync(join(tmpdir(), 'bk-r-')), 'app');
  execFileSync('git', ['clone', '-q', r.bundle, restored]);
  assert.equal(readFileSync(join(restored, 'index.js'), 'utf8'), 'console.log(1)\n');
  assert.ok(!readdirSync(restored).includes('.atelier') && !readdirSync(restored).includes('.dev.vars'));
  // 두 번째부터는 저장한 폴더를 쓰고, 바뀐 게 없으면 기록하지 않는다
  const again = backup({ root, now: new Date('2026-09-30T02:00:00Z'), exportDb: () => null, log: () => {} });
  assert.equal(again.committed, false);
  assert.ok(again.bundle.startsWith(dest));
});

test('backup: 폴더를 안 정했으면 멈추고 안내, 오래된 백업은 최근 N개만 남긴다', () => {
  const root = mkdtempSync(join(tmpdir(), 'bk-'));
  assert.throws(() => backup({ root, exportDb: () => null, log: () => {} }), /백업할 폴더/);
  const dest = mkdtempSync(join(tmpdir(), 'bk-dest-'));
  for (let i = 10; i < 20; i++) writeFileSync(join(dest, `app-202609${i}-0000.bundle`), '');
  writeFileSync(join(dest, 'other-20260901-0000.bundle'), '');
  assert.equal(prune(dest, 'app', 3).length, 7);
  assert.deepEqual(readdirSync(dest).sort(), ['app-20260917-0000.bundle', 'app-20260918-0000.bundle', 'app-20260919-0000.bundle', 'other-20260901-0000.bundle']);
});
