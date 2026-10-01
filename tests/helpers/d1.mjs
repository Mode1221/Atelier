// 테스트용 D1 흉내 (node:sqlite) — prepare().bind().first/all/run, meta.changes
import { DatabaseSync } from 'node:sqlite';
export function fakeD1(sql = '') {
  const db = new DatabaseSync(':memory:');
  if (sql) db.exec(sql);
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    first: async () => db.prepare(q).get(...args) ?? null,
    all: async () => ({ results: db.prepare(q).all(...args) }),
    run: async () => { const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (q) => stmt(q), exec: (q) => db.exec(q), raw: db };
}
