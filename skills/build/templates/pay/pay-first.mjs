#!/usr/bin/env node
// 결제 붙이기 — 사람 몫은 "토스페이먼츠 가입 + 테스트 키 2개를 .dev.vars 에 붙여 넣기" 뿐.
//   node pay-first.mjs install   : 템플릿을 프로젝트에 복사(src/pay, public/pay, migrations, package.json 스크립트)
//   node pay-first.mjs           : 키 확인 → 관리자 토큰 생성 → 로컬 DB 에 결제 테이블 → 안내
//   node pay-first.mjs --deploy  : 위 + 운영에 비밀값(wrangler secret)·결제 테이블 반영
// 키는 채팅에 붙여 넣지 않는다. 테스트 키(test_ck_·test_sk_)는 가입 즉시 쓸 수 있고 실제 돈이 나가지 않는다.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const say = (s) => console.log(s);

export function readVars(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}
export function setVar(file, key, value) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  writeFileSync(file, next);
}
// 키 모양 확인: 테스트·실서비스 구분, 클라이언트·시크릿 뒤바뀜
export function checkKeys(v) {
  const c = v.TOSS_CLIENT_KEY ?? '', s = v.TOSS_SECRET_KEY ?? '';
  const problems = [];
  if (!c) problems.push('TOSS_CLIENT_KEY 가 비어 있어요');
  if (!s) problems.push('TOSS_SECRET_KEY 가 비어 있어요');
  if (c && /_sk_/.test(c)) problems.push('TOSS_CLIENT_KEY 자리에 시크릿 키(…_sk_…)를 넣었어요 — 서로 바꿔 주세요');
  if (s && /_ck_|_gck_/.test(s)) problems.push('TOSS_SECRET_KEY 자리에 클라이언트 키(…_ck_…)를 넣었어요 — 서로 바꿔 주세요');
  const live = /^live_/.test(c) || /^live_/.test(s);
  return { ok: problems.length === 0, problems, live };
}

// 시크릿 키를 토스 서버에 실제로 확인 — 없는 주문을 조회해서 "없음"(404)이면 키가 맞고, 401 이면 틀림. 돈은 안 움직인다.
export async function verifySecret(secret, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`https://api.tosspayments.com/v1/payments/orders/atelier-keycheck-${Date.now()}`, { headers: { authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 401 || r.status === 403) return { ok: false, why: '토스가 시크릿 키를 거절했어요 — 개발자센터에서 다시 복사(앞뒤 공백·다른 상점 키 확인)' };
    return { ok: true };
  } catch { return { ok: null, why: '인터넷 문제로 키를 확인하지 못했어요 — 결제 시험 때 다시 확인돼요' }; }
}

// 템플릿 복사 (이미 있는 파일은 덮지 않는다 — 고친 plans.js 를 지키기 위해)
export function install(root) {
  const copied = [];
  const put = (src, dest) => { if (existsSync(dest)) return; mkdirSync(dirname(dest), { recursive: true }); copyFileSync(src, dest); copied.push(dest.slice(root.length + 1)); };
  for (const f of ['toss.js', 'store.js', 'pay.js', 'plans.js', 'routes.js']) put(join(HERE, f), join(root, 'src', 'pay', f));
  for (const f of ['checkout.html', 'pricing.html', 'pay.css']) put(join(HERE, 'public', 'pay', f), join(root, 'public', 'pay', f));
  put(join(HERE, 'pay-first.mjs'), join(root, 'scripts', 'pay-first.mjs'));
  const mig = join(root, 'migrations');
  if (!existsSync(mig) || !readdirSync(mig).some((f) => f.endsWith('_pay.sql'))) {
    const nums = existsSync(mig) ? readdirSync(mig).map((f) => Number(f.split('_')[0])).filter(Number.isFinite) : [];
    put(join(HERE, 'pay.sql'), join(mig, `${String(Math.max(0, ...nums) + 1).padStart(4, '0')}_pay.sql`));
  }
  const pkgFile = join(root, 'package.json');
  if (existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    pkg.scripts ??= {};
    if (!pkg.scripts['pay:first']) { pkg.scripts['pay:first'] = 'node scripts/pay-first.mjs'; writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`); copied.push('package.json (pay:first)'); }
  }
  return copied;
}

function wrangler(args, input) {
  return execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { input, stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'] });
}

async function main(argv) {
  const root = process.cwd();
  if (argv[0] === 'install') {
    const c = install(root);
    say(c.length ? `결제 템플릿을 넣었어요:\n${c.map((x) => `  + ${x}`).join('\n')}` : '이미 들어 있어요.');
    say('\n다음: src 의 앱에 mountPay(app, { customerOf }) 를 붙이고(템플릿 routes.js 맨 위 설명), npm run pay:first');
    return;
  }
  const varsFile = join(root, '.dev.vars');
  let v = readVars(varsFile);
  for (const k of ['TOSS_CLIENT_KEY', 'TOSS_SECRET_KEY']) if (!(k in v)) setVar(varsFile, k, '');
  v = readVars(varsFile);
  const k = checkKeys(v);
  if (!k.ok) {
    say('결제 키가 필요해요 (사람 할 일, 5분):');
    say('  1. https://developers.tosspayments.com 가입 (사업자 없어도 테스트 키는 바로 나와요)');
    say('  2. 개발자센터 → API 키 → "결제위젯 연동 키"의 클라이언트 키·시크릿 키(테스트)를 복사');
    say(`  3. 이 폴더의 .dev.vars 파일에 붙여 넣기: TOSS_CLIENT_KEY=… / TOSS_SECRET_KEY=…  (채팅창에 붙여 넣지 마세요)`);
    for (const p of k.problems) say(`  ✗ ${p}`);
    process.exitCode = 1;
    return;
  }
  if (!v.PAY_ADMIN_TOKEN) setVar(varsFile, 'PAY_ADMIN_TOKEN', randomBytes(24).toString('hex'));
  const online = await verifySecret(v.TOSS_SECRET_KEY);
  if (online.ok === false) { say(`✗ ${online.why}`); process.exitCode = 1; return; }
  if (online.ok === null) say(`  (${online.why})`);
  say(`✓ 결제 키 확인 (${k.live ? '실서비스 키 — 진짜 돈이 나가요' : '테스트 키 — 실제 돈은 나가지 않아요'})`);
  try { wrangler(['d1', 'migrations', 'apply', 'DB', '--local']); } catch { say('  (로컬 DB 반영은 npm run dev 가 해요)'); }
  if (argv.includes('--deploy')) {
    for (const key of ['TOSS_CLIENT_KEY', 'TOSS_SECRET_KEY', 'PAY_ADMIN_TOKEN']) wrangler(['secret', 'put', key], readVars(varsFile)[key]);
    wrangler(['d1', 'migrations', 'apply', 'DB', '--remote']);
    say('✓ 운영에 결제 키·테이블을 넣었어요. 토스 개발자센터 → 웹훅에 https://<서비스 주소>/api/pay/webhook 를 등록하세요 (PAYMENT_STATUS_CHANGED).');
  }
  say('\n시험: npm run dev → http://localhost:8787/pay/checkout.html?product=credits_100');
  say('  테스트 결제는 실제 카드로 해도 돈이 빠져나가지 않아요(토스 테스트 환경). 실패를 보려면 결제창을 닫아 보세요.');
  if (!k.live) say('\n실제로 돈을 받으려면(사람 할 일): 사업자등록 → 통신판매업 신고 → 토스페이먼츠 "전자결제 신청"(가맹 심사) → 실서비스 키로 바꾸고 npm run pay:first -- --deploy');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
