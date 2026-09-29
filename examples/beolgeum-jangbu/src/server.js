import { serve } from '@hono/node-server';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { runBackup } from './backup.js';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? './data/app.db';
const db = openDb(dbPath);
const backupDir = process.env.BACKUP_DIR;
const { app, repo } = createApp({ db, backupDir });

// 삭제 후 30일 지난 모임 영구 삭제 — 하루 1회
const purge = () => {
  const n = repo.purgeDeleted(30);
  if (n) console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', event: 'groups_purged', count: n }));
};
purge();
setInterval(purge, 86_400_000).unref();

// 백업 — BACKUP_DIR 가 있으면 시작 시 1회 + 24시간마다 (O3)
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
const backup = () => {
  try {
    log({ level: 'info', event: 'backup_done', file: runBackup({ dbPath, dir: backupDir }) });
  } catch (e) {
    log({ level: 'error', event: 'backup_failed', error: e.message });
  }
};
if (backupDir) {
  setTimeout(backup, 60_000).unref();
  setInterval(backup, 86_400_000).unref();
}

const server = serve({ fetch: app.fetch, port }, () =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', event: 'server_started', port })),
);
const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
