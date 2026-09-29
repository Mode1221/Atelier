// 운영자용 관리 도구 (B7). 모든 실행은 data/admin-audit.log 에 기록된다.
// 사용: node scripts/admin.js <find|delete|restore|purge|stats> [인자]
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDb } from '../src/db.js';
import { createRepo } from '../src/repo.js';

const dbPath = process.env.DB_PATH ?? './data/app.db';
const db = openDb(dbPath);
const repo = createRepo(db);
const [cmd, arg] = process.argv.slice(2);
const audit = (action, detail) =>
  appendFileSync(join(dirname(dbPath), 'admin-audit.log'), `${JSON.stringify({ t: new Date().toISOString(), action, detail, by: process.env.USER ?? 'unknown' })}\n`);

const count = (sql, ...p) => db.prepare(sql).get(...p).n;
switch (cmd) {
  case 'find': {
    const g = db.prepare('SELECT id, name, created_at, deleted_at FROM groups WHERE id = ?').get(arg);
    if (!g) { console.log('없음'); break; }
    console.log({ ...g, members: count('SELECT COUNT(*) n FROM members WHERE group_id = ?', arg), sessions: count('SELECT COUNT(*) n FROM sessions WHERE group_id = ?', arg) });
    audit('find', arg);
    break;
  }
  case 'delete': // 신고·요청 처리: 즉시 비공개, 30일 뒤 영구 삭제
    repo.deleteGroup(arg);
    audit('delete', arg);
    console.log('삭제 처리됨 (30일 후 영구 삭제)');
    break;
  case 'restore':
    db.prepare('UPDATE groups SET deleted_at = NULL WHERE id = ?').run(arg);
    audit('restore', arg);
    console.log('복구됨');
    break;
  case 'purge': {
    const n = repo.purgeDeleted(Number(arg ?? 30));
    audit('purge', { days: Number(arg ?? 30), n });
    console.log(`영구 삭제 ${n}개`);
    break;
  }
  case 'stats': {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    console.log({
      groups: count('SELECT COUNT(*) n FROM groups WHERE deleted_at IS NULL'),
      groups_created_7d: count('SELECT COUNT(*) n FROM groups WHERE created_at >= ?', since),
      weekly_active_groups: count('SELECT COUNT(DISTINCT group_id) n FROM sessions WHERE updated_at >= ?', since),
      sessions_7d: count('SELECT COUNT(*) n FROM sessions WHERE created_at >= ?', since),
    });
    break;
  }
  default:
    console.log('사용: node scripts/admin.js <find|delete|restore|purge|stats> [인자]');
    process.exitCode = 1;
}
db.close();
