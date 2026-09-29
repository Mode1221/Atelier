// 운영자용 관리 도구 (B7) — Cloudflare D1 에 wrangler 로 SQL 을 실행한다. 실행 기록은 data/admin-audit.log.
// 사용: node scripts/admin.mjs <find|delete|restore|purge|stats> [모임ID]   (기본 운영 DB, --local 이면 로컬)
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const local = args.includes('--local');
const [cmd, arg] = args.filter((a) => a !== '--local');
const id = (arg ?? '').replace(/[^\w-]/g, ''); // SQL 에 넣기 전에 ID 문자만 남긴다
const SQL = {
  find: `SELECT id, name, created_at, deleted_at, (SELECT COUNT(*) FROM members WHERE group_id = '${id}') AS members, (SELECT COUNT(*) FROM sessions WHERE group_id = '${id}') AS sessions FROM groups WHERE id = '${id}'`,
  delete: `UPDATE groups SET deleted_at = datetime('now') WHERE id = '${id}' AND deleted_at IS NULL`,
  restore: `UPDATE groups SET deleted_at = NULL WHERE id = '${id}'`,
  purge: `DELETE FROM groups WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`,
  stats: `SELECT (SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL) AS groups, (SELECT COUNT(DISTINCT group_id) FROM sessions WHERE created_at >= datetime('now', '-7 days')) AS weekly_active_groups`,
};
if (!SQL[cmd] || (['find', 'delete', 'restore'].includes(cmd) && !id)) {
  console.log('사용: node scripts/admin.mjs <find|delete|restore|purge|stats> [모임ID] [--local]');
  process.exit(1);
}
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--command', SQL[cmd]], { stdio: 'inherit' });
mkdirSync('data', { recursive: true });
appendFileSync('data/admin-audit.log', `${JSON.stringify({ t: new Date().toISOString(), action: cmd, id: id || null, by: process.env.USER ?? 'unknown' })}\n`);
