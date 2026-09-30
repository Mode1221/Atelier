#!/usr/bin/env node
// Atelier operate — 서비스 지킴이 설치 (명령 한 줄, GitHub 없음, 무료).
// 서비스 주소 확인 → 알림 주제 만들기 → 상태 저장소(KV) → 지킴이 Worker 배포(5분마다 확인) → 시험 알림 → 휴대폰 연결 안내.
// 다시 실행해도 안전하다 (같은 주제·저장소를 다시 쓴다).
// 사용 (프로젝트 폴더에서): npm run watch:setup   ("watch:setup": "node ops/watchdog/setup.mjs")
//   서비스 주소는 company/<서비스>/service.json 의 url, 없으면 --url https://…
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

export function findService(root, given) {
  const dir = join(root, 'company');
  const ids = given ? [given] : existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'service.json'))) : [];
  if (ids.length !== 1) return null;
  return { id: ids[0], ...readJson(join(dir, ids[0], 'service.json')) };
}

export function watchdogToml({ name, healthUrl, serviceName, kvId, main = 'worker.js' }) {
  return `# Atelier 서비스 지킴이 — setup.mjs 가 만든 파일 (다시 실행하면 덮어씀)
name = "${name}"
main = "${main}"
compatibility_date = "2026-09-01"

[vars]
HEALTH_URL = "${healthUrl}"
SERVICE_NAME = "${serviceName.replace(/"/g, '')}"

[[kv_namespaces]]
binding = "STATE"
id = "${kvId}"

[triggers]
crons = ["*/5 * * * *"]
`;
}

function wrangler(args, { quiet = false, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', ...args], { stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'inherit'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, shell: process.platform === 'win32' });
    if (input !== undefined) p.stdin.end(input);
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d); });
    p.on('close', (code) => resolve({ code, out }));
  });
}

export async function setupWatchdog({ root = process.cwd(), dir = HERE, service, url, run = wrangler, fetchImpl = fetch, log = console.log } = {}) {
  const must = async (args, opts, what) => {
    const r = await run(args, opts);
    if (r.code !== 0) throw new Error(`${what} 실패 — 위 메시지를 확인하고 다시 실행하세요 (다시 실행해도 안전해요)`);
    return r;
  };
  const svc = findService(root, service);
  const base = (url || svc?.url || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('서비스 주소(https://…)를 모르겠어요 — company/<서비스>/service.json 의 url 을 채우거나 --url 로 알려 주세요');
  const serviceName = svc?.name || new URL(base).hostname;

  log('1/5 서비스 주소 확인');
  let healthUrl = `${base}/health`;
  const h = await fetchImpl(healthUrl).catch(() => null);
  if (!h?.ok) healthUrl = `${base}/`;
  log(`   확인할 주소: ${healthUrl}`);

  log('2/5 알림 주제 준비');
  const secretsFile = join(root, '.atelier', 'secrets.json');
  const secrets = readJson(secretsFile) ?? {};
  if (!secrets.NTFY_TOPIC) {
    secrets.NTFY_TOPIC = `atelier-${randomBytes(12).toString('hex')}`; // 추측할 수 없는 이름 = 이 주제를 아는 사람만 알림을 봄
    mkdirSync(dirname(secretsFile), { recursive: true });
    writeFileSync(secretsFile, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    const gi = join(root, '.gitignore');
    const text = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
    if (!/^\/?\.atelier\/?$/m.test(text)) appendFileSync(gi, `${text && !text.endsWith('\n') ? '\n' : ''}.atelier/\n`);
  }

  log('3/5 Cloudflare 로그인·상태 저장소');
  const who = await run(['whoami'], { quiet: true });
  if (who.code !== 0 || /not authenticated|wrangler login/i.test(who.out)) await must(['login'], {}, '로그인');
  const name = `${(svc?.id || new URL(base).hostname.split('.')[0]).replace(/[^a-z0-9-]/g, '-')}-watchdog`.slice(0, 60);
  const title = `${name}-state`;
  const findKv = (out) => { try { return JSON.parse(out).find((n) => n.title === title || n.title.endsWith(title))?.id; } catch { return undefined; } };
  let kvId = findKv((await must(['kv', 'namespace', 'list'], { quiet: true }, '저장소 목록')).out);
  if (!kvId) {
    await must(['kv', 'namespace', 'create', title], { quiet: true, input: '' }, '저장소 만들기'); // input: 설정 파일에 넣을지 묻지 않게
    kvId = findKv((await must(['kv', 'namespace', 'list'], { quiet: true }, '저장소 목록')).out);
  }
  if (!kvId) throw new Error('상태 저장소 ID 를 찾지 못했어요');

  log('4/5 지킴이 배포 (5분마다 확인)');
  const config = join(dir, 'wrangler.toml');
  writeFileSync(config, watchdogToml({ name, healthUrl, serviceName, kvId }));
  const rel = relative(root, config) || config;
  await must(['deploy', '--config', rel], {}, '지킴이 배포');
  await must(['secret', 'put', 'NTFY_TOPIC', '--config', rel], { input: secrets.NTFY_TOPIC, quiet: true }, '알림 주제 저장');

  log('5/5 시험 알림 보내기');
  const sent = await fetchImpl(`https://ntfy.sh/${secrets.NTFY_TOPIC}`, { method: 'POST', body: `${serviceName} 지킴이가 연결됐어요. 서비스가 10분 넘게 응답하지 않으면 여기로 알려 드려요.`, headers: { Title: encodeURIComponent('✅ Atelier 알림 연결'), Tags: 'white_check_mark' } }).then((r) => r.ok).catch(() => false);
  const link = `https://ntfy.sh/${secrets.NTFY_TOPIC}`;
  log(`\n✅ 지킴이 설치 완료 — 컴퓨터가 꺼져 있어도 5분마다 ${healthUrl} 를 확인해요.
휴대폰으로 알림 받기 (한 번만):
  1. 휴대폰에 "ntfy" 앱 설치 (무료, 가입 없음 — App Store / Play 스토어)
  2. 앱에서 + → 주제 이름에 ${secrets.NTFY_TOPIC} 입력 → 구독
     (또는 휴대폰 브라우저로 ${link} 열기)
${sent ? '  3. 방금 보낸 "Atelier 알림 연결" 이 보이면 끝' : '  3. 시험 알림을 못 보냈어요 — 인터넷 연결을 확인하고 다시 실행해 주세요'}
주제 이름은 비밀번호처럼 다른 사람에게 알려 주지 마세요 (.atelier/secrets.json 에 저장됨).`);
  return { healthUrl, topic: secrets.NTFY_TOPIC, name, sent };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--url');
  const url = i >= 0 ? a[i + 1] : undefined;
  const service = a.find((x, j) => !x.startsWith('--') && a[j - 1] !== '--url');
  setupWatchdog({ service, url }).catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
