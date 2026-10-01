#!/usr/bin/env node
// Atelier operate — 무료 한도 사용률 (Cloudflare D1·R2 + AI 비용). 70% 넘으면 경고, 90% 넘으면 위험.
//   npm run usage            # 표 출력, 위험이면 종료 코드 1 (checkup·CI 가 알림으로 바꾼다)
//   npm run usage -- --write # docs/costs.md 의 "사용량" 절을 갱신
//   --json
// 숫자는 wrangler 가 Cloudflare 에서 가져온다(로그인 필요 — 없으면 npm run doctor). 요청 수(하루 10만)는 대시보드 → Workers.
// 한도는 무료 요금제 기준(확인일 2026-10). 바뀌면 LIMITS 만 고친다: https://developers.cloudflare.com/d1/platform/pricing/
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const LIMITS = {
  workersRequests: { label: '요청 수(하루, 계정 전체)', max: 100_000 },
  d1RowsRead: { label: 'DB 읽기(행/일)', max: 5_000_000 },
  d1RowsWritten: { label: 'DB 쓰기(행/일)', max: 100_000 },
  d1Storage: { label: 'DB 용량', max: 5 * 1024 ** 3, bytes: true },
  r2Storage: { label: '파일 저장소 용량', max: 10 * 1024 ** 3, bytes: true },
};
const WARN = 0.7, DANGER = 0.9;

const blocks = (toml, kind, key) => toml.split(new RegExp(`^\\[\\[${kind}\\]\\]\\s*$`, 'm')).slice(1).map((b) => b.split(/^\[/m)[0].match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]).filter(Boolean);
// wrangler d1 info --json 의 키 이름이 버전마다 조금 달라서 모양으로 찾는다
const pick = (o, re) => { for (const [k, v] of Object.entries(o ?? {})) if (re.test(k) && Number.isFinite(Number(v))) return Number(v); return 0; };
export function parseD1Info(out) {
  let o; try { o = JSON.parse(out); } catch { return null; }
  if (Array.isArray(o)) o = o[0];
  return { rowsRead: pick(o, /rows_read/i), rowsWritten: pick(o, /rows_written/i), bytes: pick(o, /(file|database)_size/i) };
}
// wrangler r2 bucket info 출력 → 바이트 ("bucket_size: 1.5 GB" / "Bucket Size: 120 MB" / JSON)
export function parseR2Size(out) {
  try { const o = JSON.parse(out); const v = pick(o, /size/i); if (v) return v; } catch { /* 텍스트 */ }
  const m = String(out).match(/size[^\d]*([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  return m ? Number(m[1]) * 1024 ** ['B', 'KB', 'MB', 'GB', 'TB'].indexOf(m[2].toUpperCase()) : 0;
}
const human = (n, bytes) => (bytes ? (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GB` : `${Math.round(n / 1024 ** 2)}MB`) : n.toLocaleString('ko-KR'));

// Workers 요청 수 (지난 24시간, 계정 전체) — Cloudflare GraphQL. 토큰 권한: Account Analytics 읽기
export async function workersRequests({ token, account, fetchImpl = fetch, now = Date.now() }) {
  const query = `query($a: String!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $a }) { workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $from, datetime_leq: $to }) { sum { requests errors } } } } }`;
  const r = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { a: account, from: new Date(now - 86_400_000).toISOString(), to: new Date(now).toISOString() } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors?.length) return null;
  const rows = j.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  return rows.reduce((t, x) => ({ requests: t.requests + (x.sum?.requests ?? 0), errors: t.errors + (x.sum?.errors ?? 0) }), { requests: 0, errors: 0 });
}

export async function collect({ run, toml, env = {}, fetchImpl = fetch }) {
  const rows = [];
  let read = 0, written = 0, bytes = 0;
  for (const name of blocks(toml, 'd1_databases', 'database_name')) {
    const info = parseD1Info((await run(['d1', 'info', name, '--json'])).out);
    if (!info) { rows.push({ key: 'error', label: `DB ${name}`, note: '정보를 못 가져왔어요 (npm run doctor)' }); continue; }
    read += info.rowsRead; written += info.rowsWritten; bytes += info.bytes;
  }
  const add = (key, used) => { const l = LIMITS[key]; const ratio = used / l.max; rows.push({ key, label: l.label, used, max: l.max, ratio, level: ratio >= DANGER ? 'danger' : ratio >= WARN ? 'warn' : 'ok', text: `${human(used, l.bytes)} / ${human(l.max, l.bytes)}` }); };
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
    const w = await workersRequests({ token: env.CLOUDFLARE_API_TOKEN, account: env.CLOUDFLARE_ACCOUNT_ID, fetchImpl }).catch(() => null);
    if (w) { add('workersRequests', w.requests); if (w.errors) rows.push({ key: 'errors', label: '오류 응답(24시간)', text: `${w.errors.toLocaleString('ko-KR')}건`, level: w.requests && w.errors / w.requests > 0.05 ? 'warn' : 'ok' }); }
    else rows.push({ key: 'error', label: '요청 수', note: '가져오지 못했어요 (토큰에 Account Analytics 읽기 권한 필요)' });
  }
  if (blocks(toml, 'd1_databases', 'database_name').length) { add('d1RowsRead', read); add('d1RowsWritten', written); add('d1Storage', bytes); }
  const buckets = blocks(toml, 'r2_buckets', 'bucket_name');
  if (buckets.length) { let r2 = 0; for (const b of buckets) r2 += parseR2Size((await run(['r2', 'bucket', 'info', b, '--json'])).out); add('r2Storage', r2); }
  // AI 템플릿을 쓰면 오늘·이번 달 비용 (ai_usage 표, customer='*' 가 하루 합계)
  const db = blocks(toml, 'd1_databases', 'database_name')[0];
  if (db) {
    const q = await run(['d1', 'execute', db, '--remote', '--json', '--command', "SELECT SUM(CASE WHEN day = date('now','+9 hours') THEN cost_micro_usd END) AS today, SUM(cost_micro_usd) AS month FROM ai_usage WHERE customer = '*' AND day >= strftime('%Y-%m-01', 'now', '+9 hours')"]);
    try { const r = JSON.parse(q.out)[0]?.results?.[0]; if (q.code === 0 && r) rows.push({ key: 'ai', label: 'AI 비용', text: `오늘 $${((r.today ?? 0) / 1e6).toFixed(2)} · 이번 달 $${((r.month ?? 0) / 1e6).toFixed(2)}`, level: 'ok' }); } catch { /* ai 템플릿 없음 */ }
  }
  return rows;
}

const ICON = { ok: '✅', warn: '🟡', danger: '🔴' };
export function format(rows) {
  const lines = rows.map((r) => `${ICON[r.level] ?? '⚠️'} ${r.label}: ${r.text ?? r.note}${r.ratio != null ? ` (${Math.round(r.ratio * 100)}%)` : ''}`);
  const bad = rows.filter((r) => r.level === 'warn' || r.level === 'danger');
  if (bad.length) lines.push('', '할 일: 70% 넘은 항목부터 — 캐시·호출 줄이기를 AI 에게 맡기고(operate O5 절감 순서), 유료 전환은 대표 결정.');
  if (!rows.some((r) => r.key === 'workersRequests')) lines.push('', '요청 수(무료 하루 10만)는 Cloudflare 대시보드 → Workers 에서 (CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID 가 있으면 여기에도 나와요).');
  return lines.join('\n');
}

export function writeCosts(md, rows, date) {
  const table = ['## 사용량 (npm run usage)', `확인: ${date}`, '', '| 항목 | 사용 / 무료 한도 | 상태 |', '|---|---|---|', ...rows.map((r) => `| ${r.label} | ${r.text ?? r.note} | ${ICON[r.level] ?? '⚠️'} |`), ''].join('\n');
  return /^## 사용량 \(npm run usage\)/m.test(md) ? md.replace(/^## 사용량 \(npm run usage\)[\s\S]*?(?=^## |(?![\s\S]))/m, `${table}\n`) : `${md.trimEnd()}\n\n${table}`;
}

function wrangler(args) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['wrangler', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, shell: process.platform === 'win32' });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', () => {});
    p.on('close', (code) => resolve({ code, out }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const toml = existsSync('wrangler.toml') ? readFileSync('wrangler.toml', 'utf8') : '';
  const rows = await collect({ run: wrangler, toml, env: process.env });
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 2)); else console.log(format(rows));
  if (args.includes('--write')) { const f = 'docs/costs.md'; writeFileSync(f, writeCosts(existsSync(f) ? readFileSync(f, 'utf8') : '# 비용\n', rows, new Date().toISOString().slice(0, 10))); console.log(`\n${f} 갱신`); }
  process.exit(rows.some((r) => r.level === 'danger') ? 1 : 0);
}
