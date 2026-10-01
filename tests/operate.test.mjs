import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as inc from '../skills/operate/templates/incident.mjs';
import * as usage from '../skills/operate/templates/usage.mjs';

const TOML = 'name = "x"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "x-db"\ndatabase_id = "1"\n';
const fakeFetch = ({ up = true, cf = 'none' } = {}) => async (url) => (url.includes('cloudflarestatus') ? { ok: true, json: async () => ({ status: { indicator: cf, description: cf === 'none' ? 'All Systems Operational' : 'Partial outage' } }) } : { ok: up, status: up ? 200 : 500 });
const fakeRun = ({ deployAgoH = 48, dbOk = true, tail = '' } = {}) => async (args) => {
  if (args[0] === 'deployments') return { code: 0, out: JSON.stringify([{ created_on: new Date(Date.now() - deployAgoH * 3_600_000).toISOString() }]) };
  if (args[0] === 'd1') return dbOk ? { code: 0, out: '[]' } : { code: 1, out: 'D1_ERROR: database not found' };
  if (args[0] === 'tail') return { code: 0, out: tail };
  if (args[0] === 'rollback') return { code: 0, out: 'ok' };
  return { code: 0, out: '' };
};

test('incident: 판정 — 정상 / 배포 탓 / Cloudflare 장애 / DB / 원인 미상', async () => {
  const d = (o, f) => inc.diagnose({ url: 'https://x.workers.dev', run: fakeRun(o), fetchImpl: fakeFetch(f), toml: TOML });
  assert.equal((await d({}, {})).verdict.level, 'ok');
  assert.equal((await d({ deployAgoH: 2 }, { up: false })).verdict.level, 'deploy');
  assert.equal((await d({ deployAgoH: 2 }, { up: false, cf: 'major' })).verdict.level, 'external');
  assert.equal((await d({ dbOk: false }, {})).verdict.level, 'db');
  const tail = [JSON.stringify({ outcome: 'exception', exceptions: [{ name: 'TypeError', message: 'x is undefined' }] }), JSON.stringify({ outcome: 'exception', exceptions: [{ name: 'TypeError', message: 'x is undefined' }] }), 'not json'].join('\n');
  const r = await d({ tail }, { up: false });
  assert.equal(r.verdict.level, 'unknown');
  assert.deepEqual(r.errors, [{ message: 'TypeError: x is undefined', count: 2 }]);
  assert.match(inc.format(r), /2회 TypeError/);
});

test('incident: 주소 찾기·되돌리기·사후 분석 뼈대', async () => {
  const root = mkdtempSync(join(tmpdir(), 'inc-'));
  mkdirSync(join(root, 'company', 's'), { recursive: true });
  writeFileSync(join(root, 'company', 's', 'service.json'), JSON.stringify({ url: 'https://s.workers.dev' }));
  writeFileSync(join(root, 'wrangler.toml'), TOML);
  assert.equal(inc.findServiceUrl(root), 'https://s.workers.dev');
  const out = [];
  assert.equal(await inc.main(['--rollback'], { run: fakeRun(), root, log: (l) => out.push(l) }), 0);
  assert.match(out.join('\n'), /되돌렸어요/);
  const code = await inc.main(['--report', '배포 후 500'], { run: fakeRun({ deployAgoH: 1 }), fetchImpl: fakeFetch({ up: false }), root, log: () => {} });
  assert.equal(code, 1);
  const [f] = readdirSync(join(root, 'docs', 'incidents'));
  assert.match(f, /배포-후-500\.md$/);
  assert.match(readFileSync(join(root, 'docs', 'incidents', f), 'utf8'), /최근 배포 뒤에 멈췄어요/);
});

test('usage: D1·R2·AI 사용률과 경고, costs.md 갱신', async () => {
  const toml = `${TOML}[[r2_buckets]]\nbinding = "FILES"\nbucket_name = "x-files"\n`;
  const run = async (args) => {
    if (args[1] === 'info' && args[0] === 'd1') return { code: 0, out: JSON.stringify({ rows_read_24h: 4_000_000, rows_written_24h: 95_000, database_size: 50 * 1024 ** 2 }) };
    if (args[0] === 'r2') return { code: 0, out: 'name: x-files\nbucket_size: 1.5 GB\nobject_count: 3' };
    if (args[1] === 'execute') return { code: 0, out: JSON.stringify([{ results: [{ today: 120000, month: 3400000 }] }]) };
    return { code: 1, out: '' };
  };
  const rows = await usage.collect({ run, toml });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.d1RowsRead.level, 'warn');
  assert.equal(by.d1RowsWritten.level, 'danger');
  assert.equal(by.r2Storage.level, 'ok');
  assert.match(by.ai.text, /오늘 \$0\.12 · 이번 달 \$3\.40/);
  assert.match(usage.format(rows), /할 일: 70%/);
  const md = usage.writeCosts('# 비용\n\n## 기타\n내용\n', rows, '2026-10-01');
  assert.match(md, /## 사용량 \(npm run usage\)[\s\S]*DB 쓰기/);
  const again = usage.writeCosts(md, rows.slice(0, 1), '2026-10-02');
  assert.equal((again.match(/## 사용량/g) ?? []).length, 1);
  assert.match(again, /## 기타\n내용/);
  assert.equal(usage.parseR2Size('Bucket Size: 120 MB'), 120 * 1024 ** 2);
});
