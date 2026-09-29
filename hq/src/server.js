import { serve } from '@hono/node-server';
import { join, dirname } from 'node:path';
import { openDb } from './db.js';
import { loadKey } from './crypto.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3100);
const dbPath = process.env.DB_PATH ?? './data/hq.db';
const db = openDb(dbPath);
const key = loadKey({ keyFile: process.env.HQ_SECRET ? undefined : join(dirname(dbPath), 'secret.key') });
const { app } = createApp({ db, key });
const server = serve({ fetch: app.fetch, port }, () => console.log(JSON.stringify({ t: new Date().toISOString(), event: 'hq_started', port })));
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
