// 대시보드 자체 저장소 — 모든 DB 접근은 여기로만.
import { encrypt, decrypt, hashPassword, verifyPassword, newToken, sha256 } from './crypto.js';

const now = () => new Date().toISOString();
const SESSION_DAYS = 14;

export function createStore(db, key) {
  const get = (k, fallback = null) => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
    return r ? JSON.parse(r.value) : fallback;
  };
  const set = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

  return {
    get,
    set,
    audit(action, detail) {
      db.prepare('INSERT INTO audit (at, action, detail) VALUES (?, ?, ?)').run(now(), action, detail == null ? null : JSON.stringify(detail));
    },
    recentAudit(limit = 30) {
      return db.prepare('SELECT at, action, detail FROM audit ORDER BY id DESC LIMIT ?').all(limit);
    },

    // --- 대표 계정 (1명)
    hasOwner: () => !!db.prepare('SELECT 1 FROM owner WHERE id = 1').get(),
    setOwnerPassword(password) {
      const { salt, hash } = hashPassword(password);
      db.prepare('INSERT INTO owner (id, password_hash, salt, created_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt').run(hash, salt, now());
      db.prepare('DELETE FROM sessions').run(); // 비밀번호가 바뀌면 모든 기기 로그아웃
    },
    checkPassword(password) {
      const o = db.prepare('SELECT password_hash, salt FROM owner WHERE id = 1').get();
      return !!o && verifyPassword(password, o.salt, o.password_hash);
    },
    createSession() {
      const token = newToken();
      const exp = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
      db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').run(sha256(token), exp);
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
      return token;
    },
    validSession(token) {
      if (!token) return false;
      const r = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
      return !!r && r.expires_at > now();
    },
    endSession(token) {
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    },

    // --- 외부 서비스 비밀값 (암호화 저장)
    saveSecret(service, values) {
      const e = encrypt(key, values);
      db.prepare('INSERT INTO secrets (service, iv, tag, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(service) DO UPDATE SET iv = excluded.iv, tag = excluded.tag, data = excluded.data, updated_at = excluded.updated_at').run(service, e.iv, e.tag, e.data, now());
    },
    getSecret(service) {
      const r = db.prepare('SELECT iv, tag, data FROM secrets WHERE service = ?').get(service);
      if (!r) return null;
      try {
        return decrypt(key, r);
      } catch {
        return null; // 키가 바뀌어 복호화 불가 → 연결 안 된 것으로
      }
    },
    deleteSecret(service) {
      db.prepare('DELETE FROM secrets WHERE service = ?').run(service);
    },
    connectedServices() {
      return db.prepare('SELECT service, updated_at FROM secrets').all();
    },

    // --- 부서 실행 기록 (워크플로가 보고)
    addRun({ dept, status, cost_usd, url }) {
      db.prepare('INSERT INTO runs (dept, status, cost_usd, url, at) VALUES (?, ?, ?, ?, ?)').run(dept, status, cost_usd, url ?? null, now());
    },
    lastRuns(limit = 50) {
      return db.prepare('SELECT dept, status, cost_usd, url, at FROM runs ORDER BY id DESC LIMIT ?').all(limit);
    },
    monthSpend() {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      const rows = db.prepare('SELECT dept, SUM(cost_usd) AS usd, COUNT(*) AS n FROM runs WHERE at >= ? GROUP BY dept').all(start.toISOString());
      return Object.fromEntries(rows.map((r) => [r.dept, { usd: r.usd, runs: r.n }]));
    },
    lastRunByDept() {
      const rows = db.prepare('SELECT dept, status, at, url FROM runs WHERE id IN (SELECT MAX(id) FROM runs GROUP BY dept)').all();
      return Object.fromEntries(rows.map((r) => [r.dept, r]));
    },
  };
}
