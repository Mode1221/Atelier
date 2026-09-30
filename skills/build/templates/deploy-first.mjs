#!/usr/bin/env node
// Atelier build — 첫 배포를 명령 한 줄로 (Cloudflare Workers + D1).
// 로그인 확인 → D1 만들기(있으면 재사용) → wrangler.toml 에 database_id 기록 → 원격 마이그레이션 → 배포 → 주소 출력.
// 여러 번 실행해도 안전하다: 있는 DB 는 다시 쓰고, 이미 적힌 ID 는 그대로 두고, 적용된 마이그레이션은 건너뛴다.
//
// 사용: npm run deploy:first   (package.json: "deploy:first": "node scripts/deploy-first.mjs")
// 사람 몫: Cloudflare 가입(무료, 카드 없이) + 이 명령 한 줄. 처음이면 브라우저가 열려 로그인·workers.dev 주소를 묻는다.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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

export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s ?? '');
export const findDb = (listJson, name) => JSON.parse(listJson || '[]').find((d) => d.name === name);
export const findUrl = (out) => out.match(/https:\/\/[\w.-]+\.workers\.dev\b/)?.[0] ?? out.match(/https:\/\/\S+/)?.[0];

// wrangler 를 실행한다. stdin 은 그대로 넘겨 로그인·주소 등록 질문에 답할 수 있게 하고, 출력은 보여 주면서 모은다.
function wrangler(args, { quiet = false, env = {} } = {}) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', ...args], { stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...env }, shell: process.platform === 'win32' });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (!quiet) process.stdout.write(d); });
    p.on('close', (code) => resolve({ code, out }));
  });
}

export async function deployFirst({ run = wrangler, file = 'wrangler.toml', log = console.log } = {}) {
  const must = async (args, opts, what) => {
    const r = await run(args, opts);
    if (r.code !== 0) throw new Error(`${what} 실패 — 위 메시지를 확인하고 다시 실행하세요 (다시 실행해도 안전해요)`);
    return r;
  };

  log('1/5 Cloudflare 로그인 확인');
  const who = await run(['whoami'], { quiet: true });
  if (who.code !== 0 || /not authenticated|wrangler login/i.test(who.out)) {
    log('   로그인이 필요해요 — 브라우저가 열리면 Cloudflare 계정으로 허용을 눌러 주세요');
    await must(['login'], {}, '로그인');
  }

  let toml = readFileSync(file, 'utf8');
  for (const db of d1Blocks(toml)) {
    log(`2/5 데이터베이스 "${db.name}" 준비`);
    let found = findDb((await must(['d1', 'list', '--json'], { quiet: true }, 'DB 목록 조회')).out, db.name);
    if (!found) {
      await must(['d1', 'create', db.name], {}, 'DB 만들기');
      found = findDb((await must(['d1', 'list', '--json'], { quiet: true }, 'DB 목록 조회')).out, db.name);
    } else log('   이미 있어요 — 그대로 씁니다');
    if (!isUuid(found?.uuid)) throw new Error(`DB "${db.name}" 의 ID 를 찾지 못했어요`);
    log(`3/5 wrangler.toml 에 DB ID 기록`);
    if (db.id !== found.uuid) writeFileSync(file, (toml = setDatabaseId(toml, db.name, found.uuid)));
    log('4/5 마이그레이션 적용 (운영 DB)');
    // CI=1: "진행할까요?" 질문 없이 적용 — 이미 적용된 파일은 wrangler 가 건너뛴다
    await must(['d1', 'migrations', 'apply', db.binding ?? db.name, '--remote'], { env: { CI: '1' } }, '마이그레이션');
  }

  log('5/5 배포');
  const url = findUrl((await must(['deploy'], {}, '배포')).out);
  log(url ? `\n✅ 서비스 주소: ${url}` : '\n✅ 배포 완료 — 주소는 위 wrangler 출력에 있어요');
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deployFirst().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
}
