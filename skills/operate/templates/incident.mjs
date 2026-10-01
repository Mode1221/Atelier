#!/usr/bin/env node
// Atelier operate — 장애 대응 (Cloudflare Workers). 지킴이 알림이 오면 이 한 줄부터.
//   npm run incident                    # 진단: 주소 → 최근 배포 → Cloudflare 상태 → DB → (원인 미상이면) 20초 오류 로그 → 판정·할 일
//   npm run incident -- --rollback      # 직전 배포로 되돌리기 (코드만 — DB 는 그대로)
//   npm run incident -- --report 요약    # 사후 분석 문서 뼈대 docs/incidents/<날짜>-<요약>.md (진단 결과 포함)
//   --url <주소> (없으면 company/*/service.json · docs/service-map.md 에서 찾음) · --json
// 원칙: 고치기 전에 멈추기(롤백·점검 모드) → 공지 → 원인. 다시 실행해도 안전.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DAY = 86_400_000;

export function findServiceUrl(root = '.') {
  const company = join(root, 'company');
  if (existsSync(company)) for (const d of readdirSync(company)) {
    try { const u = JSON.parse(readFileSync(join(company, d, 'service.json'), 'utf8')).url; if (u) return u; } catch { /* 다음 */ }
  }
  const map = join(root, 'docs', 'service-map.md');
  if (existsSync(map)) return readFileSync(map, 'utf8').match(/https:\/\/[\w.-]+\.(workers\.dev|pages\.dev)[^\s)|]*/)?.[0];
  return undefined;
}
const d1Names = (toml) => toml.split(/^\[\[d1_databases\]\]\s*$/m).slice(1).map((b) => b.split(/^\[/m)[0].match(/^database_name\s*=\s*"([^"]+)"/m)?.[1]).filter(Boolean);
// wrangler deployments list --json → 가장 최근 배포 시각
export function latestDeploy(out) {
  try {
    const arr = JSON.parse(out);
    const times = (Array.isArray(arr) ? arr : arr.items ?? []).map((d) => Date.parse(d.created_on ?? d.createdOn ?? d.metadata?.created_on)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  } catch { return null; }
}
// wrangler tail --format json 줄들 → 오류 요약 (같은 메시지는 묶음)
export function summarizeTail(out) {
  const errs = {};
  for (const line of String(out).split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const msgs = [...(e.exceptions ?? []).map((x) => `${x.name}: ${x.message}`), ...(e.logs ?? []).filter((l) => l.level === 'error').map((l) => [].concat(l.message).join(' '))];
    if (!msgs.length && e.outcome && e.outcome !== 'ok') msgs.push(`요청 실패 (${e.outcome})`);
    for (const m of msgs) errs[m] = (errs[m] ?? 0) + 1;
  }
  return Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count }));
}

export async function diagnose({ url, run, fetchImpl = fetch, toml = '', now = Date.now() }) {
  const r = { url, at: new Date(now).toISOString() };
  const t0 = Date.now();
  try { const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) }); r.up = res.ok; r.http = res.status; } catch (e) { r.up = false; r.http = e.name === 'TimeoutError' ? '10초 응답 없음' : `연결 실패 (${e.message})`; }
  r.ms = Date.now() - t0;
  const dep = await run(['deployments', 'list', '--json'], { quiet: true });
  r.lastDeploy = latestDeploy(dep.out);
  r.recentDeploy = r.lastDeploy != null && now - r.lastDeploy < DAY;
  try { const s = await (await fetchImpl('https://www.cloudflarestatus.com/api/v2/status.json', { signal: AbortSignal.timeout(8_000) })).json(); r.cloudflare = { indicator: s.status?.indicator, text: s.status?.description }; } catch { r.cloudflare = { indicator: 'unknown', text: '확인 못 함' }; }
  r.db = [];
  for (const name of d1Names(toml)) { const q = await run(['d1', 'execute', name, '--remote', '--command', 'SELECT 1', '--json'], { quiet: true }); r.db.push({ name, ok: q.code === 0, out: q.code ? q.out.slice(-400) : '' }); }
  if (!r.up || r.db.some((d) => !d.ok)) r.errors = summarizeTail((await run(['tail', '--format', 'json'], { quiet: true, timeoutMs: 20_000 })).out);
  r.verdict = verdict(r);
  return r;
}

export function verdict(r) {
  const dbBad = r.db.filter((d) => !d.ok);
  if (r.up && !dbBad.length) return { level: 'ok', title: '지금은 정상이에요', todo: ['잠깐 끊겼다 돌아왔을 수 있어요 — 지킴이 알림이 다시 오면 다시 실행', '자주 반복되면 "느려요/끊겨요" 의견과 함께 AI 에게 원인 조사 맡기기'] };
  if (['minor', 'major', 'critical'].includes(r.cloudflare.indicator)) return { level: 'external', title: `Cloudflare 쪽 장애일 가능성 (${r.cloudflare.text})`, todo: ['우리가 고칠 일은 없어요 — https://www.cloudflarestatus.com 에서 복구 확인', '사용자에게 공지: "호스팅 업체 장애로 접속이 어렵습니다. 복구되는 대로 알려 드릴게요."', '복구 후 npm run incident 로 확인'] };
  if (!r.up && r.recentDeploy) return { level: 'deploy', title: '최근 배포 뒤에 멈췄어요 — 배포 탓일 가능성이 커요', todo: ['먼저 되돌리기: npm run incident -- --rollback (코드만 직전으로, DB 그대로)', '되돌린 뒤 정상인지 확인 → AI 에게 "마지막 배포에서 뭐가 깨졌는지 찾아 고쳐 줘"', '마이그레이션이 같이 나갔다면 되돌리기 전에 AI 에게 확인(DB 구조가 바뀌었으면 코드만 되돌리면 안 맞을 수 있음)'] };
  if (dbBad.length) return { level: 'db', title: `DB(${dbBad.map((d) => d.name).join(', ')}) 응답이 없어요`, todo: ['아래 메시지를 AI 에게 보여 주고 원인 확인 (npm run doctor -- --explain 로 먼저 풀어 볼 수 있음)', 'Cloudflare 대시보드 → D1 에서 DB 가 있는지·한도 초과인지', '데이터가 망가졌으면 쓰기를 멈추고 백업 복구(operate O3)'] };
  return { level: 'unknown', title: '서비스가 응답하지 않는데 원인이 바로 안 보여요', todo: ['아래 오류 로그를 AI 에게 보여 주고 "장애 원인 찾아 줘"', '1시간 넘게 못 고치면 사용자 공지 + 직전 배포로 되돌리기 고려(--rollback)'] };
}

export function format(r) {
  const age = r.lastDeploy ? `${Math.round((Date.parse(r.at) - r.lastDeploy) / 3_600_000)}시간 전` : '확인 못 함';
  const lines = [
    `${r.up ? '✅' : '🔴'} 주소 ${r.url} — ${r.up ? `정상 (${r.http}, ${r.ms}ms)` : `응답 없음 (${r.http})`}`,
    `• 마지막 배포: ${age}`,
    `• Cloudflare: ${r.cloudflare.text}`,
    ...r.db.map((d) => `• DB ${d.name}: ${d.ok ? '정상' : '응답 없음'}`),
    ...(r.errors?.length ? ['• 최근 오류:', ...r.errors.map((e) => `   ${e.count}회 ${e.message}`)] : []),
    '', `판정: ${r.verdict.title}`, ...r.verdict.todo.map((t, i) => ` ${i + 1}. ${t}`),
  ];
  return lines.join('\n');
}

export function reportDoc(r, summary) {
  return `# 사후 분석 — ${summary}

> 비난 없는 기록. 목적은 재발 방지. 48시간 안에 채운다 (operate O2).

| 항목 | 내용 |
|---|---|
| 발생(추정) | |
| 인지 | ${r.at} (npm run incident) |
| 완화 | |
| 해결 | |
| 영향 | 사용자 수·기간·데이터 |

## 진단 당시
\`\`\`
${format(r)}
\`\`\`

## 원인 ("왜"를 5번)
1.

## 잘된 것 / 안된 것
-

## 재발 방지 (자동으로 잡히게)
- [ ] 테스트 또는 지킴이·점검 항목 추가:
- [ ] 런북(docs/runbook.md) 갱신:
`;
}

function wrangler(args, { quiet = false, timeoutMs, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, shell: process.platform === 'win32' });
    p.stdin.end(input ?? '');
    let out = '';
    const take = (d) => { out += d; if (!quiet) process.stdout.write(d); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    const timer = timeoutMs ? setTimeout(() => p.kill('SIGINT'), timeoutMs) : null;
    p.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: timer ? 0 : code, out }); });
  });
}

export async function main(args = process.argv.slice(2), { run = wrangler, fetchImpl = fetch, root = '.', log = console.log } = {}) {
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--rollback')) {
    log('직전 배포로 되돌립니다 (코드만, DB 그대로)…');
    const r = await run(['rollback', '--message', 'atelier incident rollback'], { input: 'y\n' });
    if (r.code !== 0) { log('되돌리기 실패 — 위 메시지를 AI 에게 보여 주세요 (npm run doctor -- --explain)'); return 1; }
    log('✅ 되돌렸어요. 1분 뒤 npm run incident 로 정상인지 확인하세요.');
    return 0;
  }
  const url = opt('--url') ?? findServiceUrl(root);
  if (!url) { log('서비스 주소를 못 찾았어요 — npm run incident -- --url https://...'); return 2; }
  const toml = existsSync(join(root, 'wrangler.toml')) ? readFileSync(join(root, 'wrangler.toml'), 'utf8') : '';
  log('진단 중… (최대 40초)');
  const r = await diagnose({ url, run, fetchImpl, toml });
  if (args.includes('--json')) log(JSON.stringify(r, null, 2)); else log(format(r));
  const summary = opt('--report');
  if (summary) {
    const dir = join(root, 'docs', 'incidents');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${r.at.slice(0, 10)}-${summary.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.md`);
    if (!existsSync(file)) writeFileSync(file, reportDoc(r, summary));
    log(`\n사후 분석 뼈대: ${file}`);
  }
  return r.verdict.level === 'ok' ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((c) => process.exit(c));
