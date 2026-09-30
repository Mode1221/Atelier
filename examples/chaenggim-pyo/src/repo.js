// 저장소 어댑터 — 모든 DB 접근은 여기로만. Cloudflare D1 API (비동기, batch = 트랜잭션).
import { newId, newAdminKey, hashKey } from './security.js';
import { LIMITS } from './validate.js';
import { TEMPLATES } from './templates.js';

const nowIso = () => new Date().toISOString();

export class RepoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createRepo(db) {
  const one = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const all = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
  const run = (sql, ...a) => db.prepare(sql).bind(...a).run();
  const activePerson = (tripId, personId) => one('SELECT id, name FROM people WHERE id = ? AND trip_id = ? AND hidden_at IS NULL', personId, tripId);

  return {
    async ping() {
      return (await one('SELECT 1 AS ok'))?.ok === 1;
    },

    // 고정 창 속도 제한. true = 허용
    async hit(key, limit, windowSec) {
      const win = Math.floor(Date.now() / 1000 / windowSec);
      const r = await one(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start RETURNING count`,
        key,
        win,
      );
      return r.count <= limit;
    },
    async cleanupRateLimits() {
      await run('DELETE FROM rate_limits WHERE window_start < ?', Math.floor(Date.now() / 1000 / 3600) - 2);
    },

    // 목록 만들기 + 시작 목록 채우기를 한 트랜잭션으로
    async createTrip({ name, template, starts_on }) {
      const id = newId();
      const adminKey = newAdminKey();
      const t = TEMPLATES[template] ?? TEMPLATES.blank;
      const now = nowIso();
      const item = db.prepare('INSERT INTO items (trip_id, name, qty, kind, created_at) VALUES (?, ?, ?, ?, ?)');
      await db.batch([
        db.prepare('INSERT INTO trips (id, name, starts_on, admin_key_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, starts_on, hashKey(adminKey), now),
        ...t.shared.map(([n, q]) => item.bind(id, n, q, 'shared', now)),
        ...t.personal.map((n) => item.bind(id, n, 1, 'personal', now)),
      ]);
      return { id, adminKey };
    },

    getTrip: (id) => one('SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL', id),

    async deleteTrip(id) {
      await run('UPDATE trips SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', nowIso(), id);
    },
    // 삭제 요청 후 days 일 지난 목록 영구 삭제
    async purgeDeleted(days = 30) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return (await run('DELETE FROM trips WHERE deleted_at IS NOT NULL AND deleted_at < ?', cutoff)).meta.changes;
    },
    // 날짜가 지나고 오래(days) 손대지 않은 목록도 지운다 — 개인정보 최소 보관 (처리방침)
    async purgeStale(days = 180) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return (await run('DELETE FROM trips WHERE created_at < ? AND (starts_on IS NULL OR starts_on < ?)', cutoff, cutoff.slice(0, 10))).meta.changes;
    },

    async load(tripId) {
      const [people, items, expenses, shares] = await Promise.all([
        all('SELECT id, name, hidden_at FROM people WHERE trip_id = ? ORDER BY id', tripId),
        all('SELECT id, name, qty, kind, claimed_by, packed FROM items WHERE trip_id = ? ORDER BY id', tripId),
        all('SELECT id, paid_by, amount, memo, created_at FROM expenses WHERE trip_id = ? ORDER BY id DESC', tripId),
        all('SELECT s.expense_id, s.person_id FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?', tripId),
      ]);
      const byExpense = new Map(expenses.map((e) => [e.id, { ...e, shares: [] }]));
      for (const s of shares) byExpense.get(s.expense_id)?.shares.push(s.person_id);
      return { people, items: items.map((i) => ({ ...i, packed: i.packed === 1 })), expenses: [...byExpense.values()] };
    },

    async addPerson(tripId, name) {
      // 한도·중복 확인과 추가를 한 문장으로 (동시 요청에도 안전)
      const r = await run(
        `INSERT INTO people (trip_id, name, created_at)
         SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM people WHERE trip_id = ? AND hidden_at IS NULL) < ?
         AND NOT EXISTS (SELECT 1 FROM people WHERE trip_id = ? AND hidden_at IS NULL AND name = ?)`,
        tripId, name, nowIso(), tripId, LIMITS.maxPeople, tripId, name,
      );
      if (r.meta.changes === 0) {
        const dup = await one('SELECT id FROM people WHERE trip_id = ? AND hidden_at IS NULL AND name = ?', tripId, name);
        if (dup) throw new RepoError('duplicate', '이미 있는 이름이에요. 목록에서 골라 주세요');
        throw new RepoError('limit', `사람은 ${LIMITS.maxPeople}명까지예요`);
      }
      return { id: r.meta.last_row_id, name };
    },

    // 사람 내보내기: 맡은 준비물은 다시 "주인 없음"으로. 지출 기록은 정산을 위해 남긴다.
    async hidePerson(tripId, personId) {
      const out = await db.batch([
        db.prepare('UPDATE people SET hidden_at = ? WHERE id = ? AND trip_id = ? AND hidden_at IS NULL').bind(nowIso(), personId, tripId),
        db.prepare('UPDATE items SET claimed_by = NULL, packed = 0 WHERE trip_id = ? AND claimed_by = ?').bind(tripId, personId),
      ]);
      if (out[0].meta.changes === 0) throw new RepoError('not_found', '사람을 찾을 수 없어요');
    },

    async addItem(tripId, { name, qty, kind }) {
      const r = await run(
        'INSERT INTO items (trip_id, name, qty, kind, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM items WHERE trip_id = ?) < ?',
        tripId, name, qty, kind, nowIso(), tripId, LIMITS.maxItems,
      );
      if (r.meta.changes === 0) throw new RepoError('limit', `준비물은 ${LIMITS.maxItems}개까지예요`);
      return { id: r.meta.last_row_id, name, qty, kind, claimed_by: null, packed: false };
    },

    async deleteItem(tripId, itemId) {
      const r = await run('DELETE FROM items WHERE id = ? AND trip_id = ?', itemId, tripId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '준비물을 찾을 수 없어요');
    },

    // 찜·취소·챙김 표시. 두 사람이 동시에 찜해도 먼저 한 사람만 되게 조건부 UPDATE.
    async updateItem(tripId, itemId, { action, person_id, packed }) {
      if (!(await activePerson(tripId, person_id))) throw new RepoError('invalid', '내 이름을 먼저 골라 주세요');
      const sql = {
        claim: ['UPDATE items SET claimed_by = ?, packed = 0 WHERE id = ? AND trip_id = ? AND kind = \'shared\' AND claimed_by IS NULL', [person_id]],
        unclaim: ['UPDATE items SET claimed_by = NULL, packed = 0 WHERE id = ? AND trip_id = ? AND claimed_by = ?', []],
        pack: ['UPDATE items SET packed = ? WHERE id = ? AND trip_id = ? AND claimed_by = ?', [packed ? 1 : 0]],
      }[action];
      if (!sql) throw new RepoError('invalid', '요청이 올바르지 않아요');
      const [q, pre] = sql;
      const args = action === 'claim' ? [...pre, itemId, tripId] : [...pre, itemId, tripId, person_id];
      const r = await run(q, ...args);
      if (r.meta.changes === 0) {
        const cur = await one('SELECT i.kind, i.claimed_by, p.name AS owner FROM items i LEFT JOIN people p ON p.id = i.claimed_by WHERE i.id = ? AND i.trip_id = ?', itemId, tripId);
        if (!cur) throw new RepoError('not_found', '준비물을 찾을 수 없어요');
        if (cur.kind !== 'shared') throw new RepoError('invalid', '각자 챙길 것은 맡을 수 없어요');
        if (cur.claimed_by && cur.claimed_by !== person_id) throw new RepoError('conflict', `${cur.owner}님이 먼저 맡았어요`);
        throw new RepoError('conflict', '다른 곳에서 바뀌었어요. 새로고침해 주세요');
      }
      return one('SELECT id, name, qty, kind, claimed_by, packed FROM items WHERE id = ?', itemId);
    },

    async addExpense(tripId, { amount, paid_by, memo, shares }) {
      const ids = new Set((await all('SELECT id FROM people WHERE trip_id = ? AND hidden_at IS NULL', tripId)).map((p) => p.id));
      if (!ids.has(paid_by) || shares.some((id) => !ids.has(id))) throw new RepoError('invalid', '사람 정보가 바뀌었어요. 새로고침해 주세요');
      const { n } = await one('SELECT COUNT(*) AS n FROM expenses WHERE trip_id = ?', tripId);
      if (n >= LIMITS.maxExpenses) throw new RepoError('limit', `지출은 ${LIMITS.maxExpenses}개까지예요`);
      const last = '(SELECT MAX(id) FROM expenses WHERE trip_id = ?)';
      const out = await db.batch([
        db.prepare('INSERT INTO expenses (trip_id, paid_by, amount, memo, created_at) VALUES (?, ?, ?, ?, ?)').bind(tripId, paid_by, amount, memo, nowIso()),
        ...shares.map((pid) => db.prepare(`INSERT INTO expense_shares (expense_id, person_id) SELECT ${last}, ?`).bind(tripId, pid)),
      ]);
      return { id: out[0].meta.last_row_id };
    },

    async deleteExpense(tripId, expenseId) {
      const r = await run('DELETE FROM expenses WHERE id = ? AND trip_id = ?', expenseId, tripId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '지출을 찾을 수 없어요');
    },

    async addFeedback({ kind, message, page }) {
      await run('INSERT INTO feedback (kind, message, page, created_at) VALUES (?, ?, ?, ?)', kind, message, page, nowIso());
    },
    listFeedback(limit = 100) {
      return all('SELECT id, kind, message, page, created_at FROM feedback WHERE synced_at IS NULL ORDER BY id LIMIT ?', limit);
    },
    async ackFeedback(upTo) {
      return (await run('UPDATE feedback SET synced_at = ? WHERE synced_at IS NULL AND id <= ?', nowIso(), upTo)).meta.changes;
    },
    async purgeFeedback(days = 365) {
      await run('DELETE FROM feedback WHERE created_at < ?', new Date(Date.now() - days * 86_400_000).toISOString());
    },

    async stats() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [t, c, p, e, f] = await Promise.all([
        one('SELECT COUNT(*) AS n FROM trips WHERE deleted_at IS NULL'),
        one('SELECT COUNT(*) AS n FROM trips WHERE created_at >= ?', since),
        one('SELECT COUNT(DISTINCT trip_id) AS n FROM people WHERE created_at >= ?', since),
        one('SELECT COUNT(DISTINCT trip_id) AS n FROM expenses WHERE created_at >= ?', since),
        one('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?', since),
      ]);
      return { '전체 목록': t.n, '이번 주 새 목록': c.n, '이번 주 참여가 생긴 목록': p.n, '이번 주 정산 쓴 목록': e.n, '이번 주 피드백': f.n };
    },
  };
}
