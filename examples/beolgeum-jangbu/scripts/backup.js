// 사용: node scripts/backup.js         → 백업 1회 (backups/app-YYYYMMDD-HHMM.db, 14개 보관)
//       node scripts/backup.js --check → 가장 최근 백업이 26시간 이내가 아니면 종료 코드 1
import { runBackup, lastBackupAgeHours } from '../src/backup.js';

const dbPath = process.env.DB_PATH ?? './data/app.db';
const dir = process.env.BACKUP_DIR ?? './backups';
if (process.argv.includes('--check')) {
  const h = lastBackupAgeHours(dir);
  console.log(Number.isFinite(h) ? `최근 백업 ${h.toFixed(1)}시간 전` : '백업 없음');
  process.exit(h <= 26 ? 0 : 1);
}
console.log(`백업 완료: ${runBackup({ dbPath, dir, keep: Number(process.env.BACKUP_KEEP ?? 14) })}`);
