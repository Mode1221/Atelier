import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStories, idsIn, trace } from '../skills/spec/scripts/trace.mjs';
import { parseDeclared, checkEvents } from '../skills/spec/scripts/events-check.mjs';
import { scanText } from '../skills/guard/scripts/secret-scan.mjs';
import { checkSql, checkMigrations } from '../skills/build/scripts/migration-check.mjs';

const project = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'q-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
};

test('trace: S1 표·제목 형식에서 스토리를 읽고 Won\'t 는 뺀다', () => {
  const spec = '## S1. 스토리\n| ID | 스토리 |\n|---|---|\n| F1 | 만들기 |\n| F2 | 나중 기능 (Won\'t) |\n### F3. 공유 (Must)\n## S2. 정책\n| F9 | 정책 표 |';
  assert.deepEqual(parseStories(spec).map((s) => s.id), ['F1', 'F3']);
});

test('trace: 테스트 이름의 ID·범위·나열을 읽는다', () => {
  assert.deepEqual([...idsIn("describe('F2~F4 흐름') it(\"F6·F7 복사\") test(`F3-1 각자`) x('XF1') y('F10 자동')")].sort(), ['F10', 'F2', 'F3', 'F3-1', 'F4', 'F6', 'F7', 'XF1']); // XF1 은 다른 접두어의 ID — F1 로 읽지 않는다
  assert.ok(!idsIn("it('F1은 아님 F12')").has('F12'));
});

test('trace: 테스트 없는 기능을 잡는다', () => {
  const dir = project({ 'docs/spec.md': '## S1. 스토리\n| F1 | 가 |\n| F2 | 나 |', 'test/a.test.js': "describe('F1 가', () => {})" });
  assert.deepEqual(trace(dir).missing.map((r) => r.id), ['F2']);
});

test('events: 계획 표기(속성·묶음)를 읽고 코드와 대조한다', () => {
  assert.deepEqual([...parseDeclared('## S6. 분석 이벤트\n`landing{src}`, `item_claim|unclaim|pack`, `shared`\n## S7\n`other`')], ['landing', 'item_claim', 'item_unclaim', 'item_pack', 'shared']);
  // 표가 있으면 첫 칸만: 속성 칸·표 밖 설명의 백틱 이름은 이벤트가 아니다
  assert.deepEqual([...parseDeclared('## S6 분석 이벤트\n| 이벤트 | 속성 |\n|---|---|\n| `game_start` | `visit_days` |\n| `game_end{score}` | — |\n- 재방문은 `visit_days` 로 보냄\n')], ['game_start', 'game_end']);
  const dir = project({
    'docs/spec.md': '## S6. 분석 이벤트\n`landing{src}` `item_claim|pack` `signup_done`',
    'src/app.js': "event(c, 'landing'); event(c, `item_${a}`); track('surprise'); log({ event: 'landing' })",
    'test/x.test.js': "event(c, 'only_in_test')",
  });
  const r = checkEvents(dir);
  assert.deepEqual(r.missing, ['signup_done']);
  assert.deepEqual(r.undeclared, ['surprise']);
});

test('secret-scan: 진짜 모양은 잡고, 가짜·설정 이름은 넘긴다', () => {
  // 가짜 값도 파일에 그대로 쓰면 비밀값 검사(플러그인 디렉터리 등)에 걸린다 — 실행할 때 조각을 이어 만든다
  const j = (...p) => p.join('');
  const bad = [j('const k = "AKIA', 'IOSFODNN7EXAMPLE";'), j('token: "ghp', '_abcdefghijklmnopqrstuvwxyz0123456789"'), j('-----BEGIN PRIV', 'ATE KEY-----'), j('SUPABASE_KEY = "eyJhbGciOiJIUzI1NiJ9', '.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnopqrstuv"'), j('api_key = "q8Zr2Lm9', 'Xw4Tp7Vn1Bc6Hy3Kd"')];
  for (const line of bad) assert.equal(scanText(line).length, 1, line);
  const ok = ["const TOKEN_KEY = 'chaenggim:stats-token';", 'api_key = "your-api-key-here-please"', 'password = process.env.PASSWORD', j('token: "q8Zr2Lm9', 'Xw4Tp7Vn1Bc6Hy3Kd" // secret-scan: ignore 테스트용'), "FEEDBACK_TOKEN=auto"];
  for (const line of ok) assert.equal(scanText(line).length, 0, line);
});

test('migration-check: 위험한 변경을 잡고, 안전한 추가는 넘긴다', () => {
  const kinds = (sql) => checkSql(sql).hits.map((h) => h.kind);
  assert.deepEqual(kinds('ALTER TABLE items ADD COLUMN deleted_at TEXT;\nCREATE TABLE a (id INTEGER NOT NULL);\nCREATE INDEX i ON a(id);'), []);
  assert.deepEqual(kinds('DROP TABLE old;'), ['표 삭제']);
  assert.deepEqual(kinds('ALTER TABLE a DROP COLUMN b;'), ['칸 삭제']);
  assert.deepEqual(kinds('ALTER TABLE a RENAME COLUMN b TO c;'), ['이름 바꾸기']);
  assert.deepEqual(kinds('ALTER TABLE a ADD COLUMN c TEXT NOT NULL;'), ['기본값 없는 필수 칸 추가']);
  assert.deepEqual(kinds("ALTER TABLE a ADD COLUMN c TEXT NOT NULL DEFAULT '';"), []);
  assert.deepEqual(kinds('DELETE FROM a;'), ['조건 없는 삭제']);
  assert.deepEqual(kinds('DELETE FROM a WHERE id = 1;'), []);
  assert.deepEqual(kinds("UPDATE a SET x = 1;"), ['조건 없는 수정']);
  assert.deepEqual(kinds("UPDATE a SET x = 1 WHERE id = 2;"), []);
  assert.deepEqual(kinds('-- DROP TABLE a 는 주석이라 괜찮다\nSELECT 1;'), []);
});

test('migration-check: 이유가 있으면 확인됨, 번호 겹침은 막는다', () => {
  const dir = project({
    'migrations/0001_init.sql': 'CREATE TABLE a (id INTEGER);',
    'migrations/0002_drop.sql': '-- migration-check: ok 운영 데이터 없음 (출시 전)\nDROP TABLE a;',
    'migrations/0003_x.sql': 'ALTER TABLE a DROP COLUMN b;',
    'migrations/0003_y.sql': 'SELECT 1;',
  });
  const r = checkMigrations(dir);
  assert.deepEqual(r.blocking.map((b) => b.file), ['migrations/0003_x.sql']);
  assert.equal(r.duplicates.length, 1);
});

test('스크립트는 한글·공백이 든 폴더에서도 직접 실행된다 (Windows 한글 사용자 이름 등)', async () => {
  const { mkdtempSync, copyFileSync, readdirSync, readFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = join(mkdtempSync(join(tmpdir(), 'kr-')), '내 서비스');
  (await import('node:fs')).mkdirSync(dir);
  copyFileSync(new URL('../skills/guard/scripts/rules-kr.mjs', import.meta.url), join(dir, 'rules-kr.mjs'));
  assert.match(execFileSync('node', [join(dir, 'rules-kr.mjs'), '--list'], { encoding: 'utf8' }), /^pay\t/);
  // 같은 실수가 다시 들어오지 않게: 직접 실행 판정에 file:// 문자열 비교를 쓰지 않는다
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
  const bad = walk(new URL('../skills', import.meta.url).pathname).filter((f) => /\.m?js$/.test(f) && readFileSync(f, 'utf8').includes('=== `file://${process.argv[1]}`'));
  assert.deepEqual(bad, []);
});
