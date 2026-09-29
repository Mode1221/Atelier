// DB 백업 — 서버가 하루 1회 실행하고, scripts/backup.js 로 수동 실행도 가능.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PATTERN = /^app-\d{8}-\d{4}\.db$/;
const list = (dir) => {
  try {
    return readdirSync(dir).filter((f) => PATTERN.test(f)).sort();
  } catch {
    return [];
  }
};

export function runBackup({ dbPath, dir, keep = 14 }) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const out = join(dir, `app-${stamp}.db`);
  rmSync(out, { force: true });
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); // 실행 중에도 일관된 사본
  db.close();
  const check = new DatabaseSync(out, { readOnly: true });
  const ok = check.prepare('PRAGMA integrity_check').get().integrity_check;
  check.close();
  if (ok !== 'ok') throw new Error(`백업 무결성 검사 실패: ${ok}`);
  for (const f of list(dir).slice(0, -keep)) rmSync(join(dir, f));
  return out;
}

// 가장 최근 백업의 나이(시간). 없으면 Infinity
export function lastBackupAgeHours(dir) {
  const last = list(dir).at(-1);
  return last ? (Date.now() - statSync(join(dir, last)).mtimeMs) / 3_600_000 : Infinity;
}
