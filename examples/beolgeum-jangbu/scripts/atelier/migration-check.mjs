#!/usr/bin/env node
// Atelier 0.11.0 의 skills/build/scripts/migration-check.mjs 복사본 — 직접 고치지 말고 install-tools.mjs 를 다시 실행해 업데이트
// Atelier build — DB 변경(마이그레이션) 안전 검사. 운영 데이터를 날리거나, 배포하는 몇 초 사이 옛 코드를 깨뜨리는 변경을 잡는다.
// 원칙 (확장 → 이전 → 축소): 1) 새 칸·표를 "추가"만 하고 배포  2) 코드가 새 칸을 쓰게 바꾸고 데이터 옮기기  3) 다음 배포에서 옛 칸 삭제.
// 위험한 변경을 일부러 할 때는 그 파일에 `-- migration-check: ok <이유>` (예: 아직 운영 데이터 없음) — 이유 없이 넘기지 않는다.
// 사용: node <atelier>/skills/build/scripts/migration-check.mjs [폴더] [--json]   · 이유 없는 위험 변경이 있으면 종료 코드 1
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './lib.mjs';

export const RULES = [
  ['표 삭제', /\bDROP\s+TABLE\b/i, '데이터가 사라진다. 먼저 코드에서 안 쓰게 배포 → 백업 → 다음 배포에서 삭제'],
  ['칸 삭제', /\bDROP\s+COLUMN\b/i, '옛 코드가 그 칸을 읽는 동안 오류. 코드 먼저 → 다음 배포에서 삭제'],
  ['이름 바꾸기', /\bRENAME\s+(?:TO|COLUMN)\b|\bALTER\s+TABLE\s+\S+\s+RENAME\b/i, '옛 코드가 옛 이름을 찾다 깨진다. 새 칸 추가 → 복사 → 코드 전환 → 옛 칸 삭제'],
  ['기본값 없는 필수 칸 추가', /\bADD\s+(?:COLUMN\s+)?\S+\s+[^;,]*\bNOT\s+NULL\b(?![^;,]*\bDEFAULT\b)/i, '기존 줄이 있으면 실패하거나 옛 코드의 INSERT 가 깨진다. DEFAULT 를 주거나 NULL 허용으로 먼저'],
  ['조건 없는 삭제', /\bDELETE\s+FROM\s+[^;]+?(?:;|$)(?<!\bWHERE\b[^;]*;)/i, '모든 줄이 지워진다'],
  ['조건 없는 수정', /\bUPDATE\s+\S+\s+SET\b(?![^;]*\bWHERE\b)[^;]*;?/i, '모든 줄이 바뀐다'],
  ['표 비우기', /\bTRUNCATE\b/i, '모든 줄이 지워진다'],
];

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
export function checkSql(sql) {
  const ok = sql.match(/--\s*migration-check:\s*ok\s*(.*)/i);
  const body = stripComments(sql);
  const hits = [];
  for (const stmt of body.split(';')) {
    for (const [kind, re, fix] of RULES) {
      if (!re.test(`${stmt};`)) continue;
      if (kind === '조건 없는 삭제' && /\bWHERE\b/i.test(stmt)) continue;
      hits.push({ kind, fix, stmt: stmt.trim().replace(/\s+/g, ' ').slice(0, 90) });
    }
  }
  return { hits, ack: ok ? ok[1].trim() || '(이유 없음)' : null };
}

export function checkMigrations(root) {
  const files = listFiles(root).filter((f) => /(^|\/)migrations\/.*\.sql$/i.test(f)).sort();
  const results = files.map((f) => ({ file: f, ...checkSql(readFileSync(join(root, f), 'utf8')) }));
  // 번호 겹침 (같은 폴더에 0003_a.sql, 0003_b.sql → 적용 순서가 불확실)
  const dup = [];
  const seen = new Map();
  for (const f of files) {
    const m = f.match(/^(.*\/)(\d+)[_-]/);
    if (!m) continue;
    const k = `${m[1]}${Number(m[2])}`;
    if (seen.has(k)) dup.push([seen.get(k), f]);
    else seen.set(k, f);
  }
  const blocking = results.filter((r) => r.hits.length && (!r.ack || r.ack === '(이유 없음)'));
  return { files: results, duplicates: dup, blocking };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) ?? '.';
  if (!existsSync(root)) process.exit(2);
  const r = checkMigrations(root);
  if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`마이그레이션 ${r.files.length}개`);
    for (const f of r.files.filter((x) => x.hits.length)) {
      const tag = f.ack && f.ack !== '(이유 없음)' ? `⚠ (확인됨: ${f.ack})` : '✗';
      for (const h of f.hits) console.log(`${tag} ${f.file} — ${h.kind}: ${h.stmt}\n   → ${h.fix}`);
    }
    for (const [a, b] of r.duplicates) console.log(`✗ 번호 겹침: ${a} · ${b}`);
    if (!r.blocking.length && !r.duplicates.length) console.log('✓ 위험한 변경 없음 (또는 이유와 함께 확인됨)');
  }
  process.exit(r.blocking.length || r.duplicates.length ? 1 : 0);
}
