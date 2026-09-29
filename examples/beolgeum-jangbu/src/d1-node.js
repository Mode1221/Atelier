// 테스트·로컬용: node:sqlite 위에 Cloudflare D1 과 같은 모양의 API 를 흉내 낸다.
// 운영(Cloudflare)에서는 진짜 D1 바인딩(env.DB)을 쓴다.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

class Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.sql, args);
  }
  _exec() {
    const s = this.db.prepare(this.sql);
    return /^\s*(select|with)|returning/i.test(this.sql) ? { rows: s.all(...this.args) } : { info: s.run(...this.args) };
  }
  async all() {
    const r = this._exec();
    return { results: r.rows ?? [], meta: { changes: Number(r.info?.changes ?? 0) } };
  }
  async first(col) {
    const row = this.db.prepare(this.sql).get(...this.args) ?? null;
    return col && row ? row[col] : row;
  }
  runSync() {
    const r = this._exec();
    return { results: r.rows ?? [], meta: { changes: Number(r.info?.changes ?? r.rows?.length ?? 0), last_row_id: Number(r.info?.lastInsertRowid ?? 0) } };
  }
  async run() {
    return this.runSync();
  }
}

export function openD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  return {
    prepare: (sql) => new Stmt(db, sql),
    // D1 의 batch 는 한 트랜잭션. 중간에 await 가 끼면 동시 요청이 같은 연결에서 섞이므로 동기로 실행한다.
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(s.runSync());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      db.exec(sql);
    },
    close: () => db.close(),
  };
}
