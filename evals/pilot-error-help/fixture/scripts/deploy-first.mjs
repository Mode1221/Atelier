#!/usr/bin/env node
// Atelier build — 첫 배포를 명령 한 줄로 (Cloudflare Workers + D1).
// 로그인 확인 → D1 만들기(있으면 재사용) → wrangler.toml 에 database_id 기록 → 원격 마이그레이션 → 배포 → 비밀값 → 주소 출력.
// 비밀값: .dev.vars.example 의 이름들. 값이 `auto` 면 무작위로 만들어 .atelier/secrets.json(커밋 안 됨)에 두고, 비어 있으면 물어본다.
// 여러 번 실행해도 안전하다: 있는 DB 는 다시 쓰고, 이미 적힌 ID 는 그대로 두고, 적용된 마이그레이션은 건너뛴다.
//
// 사용: npm run deploy:first   (package.json: "deploy:first": "node scripts/deploy-first.mjs")
// 사람 몫: Cloudflare 가입(무료, 카드 없이) + 이 명령 한 줄. 처음이면 브라우저가 열려 로그인·workers.dev 주소를 묻는다.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';

// wrangler.toml 의 [[d1_databases]] 블록들 → [{ binding, name, id }]
export function d1Blocks(toml) {
  return toml.split(/^\[\[d1_databases\]\]\s*$/m).slice(1).map((b) => {
    const body = b.split(/^\[/m)[0];
    const get = (k) => body.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
    return { binding: get('binding'), name: get('database_name'), id: get('database_id') };
  });
}

// database_name 이 name 인 블록의 database_id 를 id 로 바꾼다 (줄 끝 주석은 지운다)
export function setDatabaseId(toml, name, id) {
  const parts = toml.split(/(^\[\[d1_databases\]\]\s*$)/m);
  for (let i = 2; i < parts.length; i += 2) {
    if (d1Blocks(`[[d1_databases]]\n${parts[i]}`)[0]?.name !== name) continue;
    parts[i] = /^database_id\s*=/m.test(parts[i])
      ? parts[i].replace(/^database_id\s*=.*$/m, `database_id = "${id}"`)
      : parts[i].replace(/^(database_name\s*=.*)$/m, `$1\ndatabase_id = "${id}"`);
  }
  return parts.join('');
}

// wrangler.toml 의 [[r2_buckets]] → bucket_name 목록 (파일 올리기 템플릿이 쓴다)
export const r2Buckets = (toml) => toml.split(/^\[\[r2_buckets\]\]\s*$/m).slice(1).map((b) => b.split(/^\[/m)[0].match(/^bucket_name\s*=\s*"([^"]+)"/m)?.[1]).filter(Boolean);
// `wrangler r2 bucket list` 출력에서 이름들
export const r2Names = (out) => [...String(out).matchAll(/^name:\s*(\S+)/gm)].map((m) => m[1]);
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s ?? '');
export const findDb = (listJson, name) => JSON.parse(listJson || '[]').find((d) => d.name === name);
// .dev.vars.example → [{ name, auto }] (주석·빈 줄 무시)
export function secretSpecs(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [name, ...v] = l.split('='); return { name: name.trim(), auto: v.join('=').trim() === 'auto' }; })
    .filter((x) => /^[A-Z][A-Z0-9_]*$/.test(x.name));
}
export const SECRETS_FILE = '.atelier/secrets.json';
export function loadSecrets(file = SECRETS_FILE) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } }
// 저장하면서 프로젝트 .gitignore 에 .atelier/ 를 넣는다 (비밀값이 커밋되지 않게)
export function saveSecrets(data, file = SECRETS_FILE) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  const ignore = join(dirname(file), '..', '.gitignore');
  const gi = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  if (!/^\/?\.atelier\/?$/m.test(gi)) appendFileSync(ignore, `${gi && !gi.endsWith('\n') ? '\n' : ''}.atelier/\n`);
}
// 화면에 보이지 않게 한 줄 입력받기
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (v) => { rl.close(); process.stdout.write('\n'); resolve(v.trim()); });
  });
}

export const findUrl = (out) => out.match(/https:\/\/[\w.-]+\.workers\.dev\b/)?.[0] ?? out.match(/https:\/\/\S+/)?.[0];

// wrangler 를 실행한다. stdin 은 그대로 넘겨 로그인·주소 등록 질문에 답할 수 있게 하고, 출력은 보여 주면서 모은다.
function wrangler(args, { quiet = false, env = {}, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', ...args], { stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...env }, shell: process.platform === 'win32' });
    if (input !== undefined) p.stdin.end(input);
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); }); // 오류도 모아서 아래 풀이(doctor)에 쓴다
    p.on('close', (code) => resolve({ code, out }));
  });
}

// 실패 메시지 풀이 — 같은 폴더에 doctor.mjs 가 있으면 쓴다 (없어도 동작)
async function explainFailure(out) {
  try { const { formatExplain } = await import('./doctor.mjs'); return `\n${formatExplain(out)}`; } catch { return ''; }
}

export async function deployFirst({ run = wrangler, file = 'wrangler.toml', log = console.log, ask = askHidden, secretsFile = SECRETS_FILE, varsExample = '.dev.vars.example', explain = explainFailure } = {}) {
  const must = async (args, opts, what) => {
    const r = await run(args, opts);
    if (r.code !== 0) throw new Error(`${what} 실패 (다시 실행해도 안전해요)${await explain(r.out ?? '')}`);
    return r;
  };

  log('1/6 Cloudflare 로그인 확인');
  const who = await run(['whoami'], { quiet: true });
  if (who.code !== 0 || /not authenticated|wrangler login/i.test(who.out)) {
    log('   로그인이 필요해요 — 브라우저가 열리면 Cloudflare 계정으로 허용을 눌러 주세요');
    await must(['login'], {}, '로그인');
  }

  let toml = readFileSync(file, 'utf8');
  for (const db of d1Blocks(toml)) {
    log(`2/6 데이터베이스 "${db.name}" 준비`);
    let found = findDb((await must(['d1', 'list', '--json'], { quiet: true }, 'DB 목록 조회')).out, db.name);
    if (!found) {
      await must(['d1', 'create', db.name], { input: '' }, 'DB 만들기'); // input: wrangler.toml 에 넣을지 묻지 않게 (ID 는 아래에서 직접 기록)
      found = findDb((await must(['d1', 'list', '--json'], { quiet: true }, 'DB 목록 조회')).out, db.name);
    } else log('   이미 있어요 — 그대로 씁니다');
    if (!isUuid(found?.uuid)) throw new Error(`DB "${db.name}" 의 ID 를 찾지 못했어요`);
    log(`3/6 wrangler.toml 에 DB ID 기록`);
    if (db.id !== found.uuid) writeFileSync(file, (toml = setDatabaseId(toml, db.name, found.uuid)));
    log('4/6 마이그레이션 적용 (운영 DB)');
    // CI=1: "진행할까요?" 질문 없이 적용 — 이미 적용된 파일은 wrangler 가 건너뛴다
    await must(['d1', 'migrations', 'apply', db.binding ?? db.name, '--remote'], { env: { CI: '1' } }, '마이그레이션');
  }

  const buckets = r2Buckets(toml);
  if (buckets.length) {
    log('   파일 저장소(R2) 준비');
    const have = r2Names((await run(['r2', 'bucket', 'list'], { quiet: true })).out);
    for (const b of buckets) {
      if (have.includes(b)) { log(`   ${b}: 이미 있어요`); continue; }
      const r = await run(['r2', 'bucket', 'create', b], { quiet: true });
      if (r.code !== 0 && /(enable|purchas|subscri).*R2|R2.*(enable|purchas|subscri)/i.test(r.out)) throw new Error('R2 를 처음 쓰려면 Cloudflare 대시보드 → R2 에서 한 번 "사용 시작"(무료, 카드 등록이 필요할 수 있음)을 눌러 주세요 — 그다음 다시 실행');
      if (r.code !== 0) throw new Error(`파일 저장소 ${b} 만들기 실패 — 위 메시지를 확인하고 다시 실행하세요`);
      log(`   ${b}: 만들었어요`);
    }
  }
  log('5/6 배포');
  const url = findUrl((await must(['deploy'], {}, '배포')).out);

  const specs = existsSync(varsExample) ? secretSpecs(readFileSync(varsExample, 'utf8')) : [];
  if (specs.length) {
    log('6/6 비밀값 확인');
    let have;
    try { have = JSON.parse((await must(['secret', 'list', '--format', 'json'], { quiet: true }, '비밀값 목록 조회')).out).map((x) => x.name); } catch { have = []; }
    const local = loadSecrets(secretsFile);
    for (const { name, auto } of specs) {
      // auto 값인데 이 컴퓨터에 사본이 없으면 새로 만들어 덮어쓴다 (예: 의견 가져오기에 필요)
      if (have.includes(name) && !(auto && !local[name])) { log(`   ${name}: 이미 있어요`); continue; }
      let value = local[name];
      if (!value && auto) value = randomBytes(32).toString('hex');
      if (!value) value = await ask(`   ${name} 값을 붙여 넣어 주세요 (화면에 안 보여요, 없으면 엔터): `);
      if (!value) { log(`   ${name}: 건너뜀 — 나중에 다시 실행하면 물어봐요`); continue; }
      await must(['secret', 'put', name], { input: value, quiet: true }, `${name} 저장`);
      if (auto) { local[name] = value; saveSecrets(local, secretsFile); }
      log(`   ${name}: 저장했어요`);
    }
  }
  log(url ? `\n✅ 서비스 주소: ${url}` : '\n✅ 배포 완료 — 주소는 위 wrangler 출력에 있어요');
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deployFirst().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
