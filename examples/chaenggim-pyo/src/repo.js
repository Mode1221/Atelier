// 저장소 어댑터 — 모든 DB 접근은 여기로만. Cloudflare D1 API (비동기, batch = 트랜잭션).
import { newId, newAdminKey, hashKey } from './security.js';
import { LIMITS } from './validate.js';
import { TEMPLATES } from './templates.js';

const nowIso = () => new Date().toISOString();
const expenseLabel = ({ amount, memo }) => `${memo ? `${memo} ` : ''}${amount.toLocaleString('ko-KR')}원`;

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
  // 변경 뒤에 함께 실행: 목록 "바뀜" 표시 + 변경 기록. by = 한 사람(이 목록의 참여자일 때만 이름이 남는다)
  const note = (tripId, by, action, target, ref = {}) => {
    const now = nowIso();
    return [
      db.prepare('UPDATE trips SET updated_at = ? WHERE id = ?').bind(now, tripId),
      db.prepare(
        'INSERT INTO activity (trip_id, who, action, target, ref_kind, ref_id, created_at) VALUES (?, (SELECT name FROM people WHERE id = ? AND trip_id = ?), ?, ?, ?, ?, ?)',
      ).bind(tripId, by ?? null, tripId, action, target, ref.kind ?? null, ref.id ?? null, now),
    ];
  };
  const record = (...a) => db.batch(note(...a));

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
        db.prepare('INSERT INTO trips (id, name, starts_on, admin_key_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, name, starts_on, hashKey(adminKey), now, now),
        ...t.shared.map(([n, q]) => item.bind(id, n, q, 'shared', now)),
        ...t.personal.map((n) => item.bind(id, n, 1, 'personal', now)),
      ]);
      return { id, adminKey };
    },

    getTrip: (id) => one('SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL', id),

    async updateTrip(tripId, { name, starts_on }, by) {
      const before = await one('SELECT name, starts_on FROM trips WHERE id = ?', tripId);
      await run('UPDATE trips SET name = ?, starts_on = ? WHERE id = ?', name, starts_on, tripId);
      const what = [before.name !== name && `이름 → ${name}`, before.starts_on !== starts_on && `날짜 → ${starts_on ?? '없음'}`].filter(Boolean).join(', ');
      if (what) await record(tripId, by, 'trip_edit', what);
    },

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

    // 되살리기 기간(days)이 지난 지운 준비물·지출과 오래된 변경 기록 정리
    async purgeSoftDeleted(days = 7) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const out = await db.batch([
        db.prepare('DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cutoff),
        db.prepare('DELETE FROM expenses WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cutoff),
        db.prepare('DELETE FROM activity WHERE created_at < ?').bind(old),
      ]);
      return out[0].meta.changes + out[1].meta.changes;
    },

    async load(tripId) {
      const [people, items, expenses, shares, activity] = await Promise.all([
        all('SELECT id, name, hidden_at FROM people WHERE trip_id = ? ORDER BY id', tripId),
        all('SELECT id, name, qty, kind, claimed_by, packed FROM items WHERE trip_id = ? AND deleted_at IS NULL ORDER BY id', tripId),
        all('SELECT id, paid_by, amount, memo, created_at FROM expenses WHERE trip_id = ? AND deleted_at IS NULL ORDER BY id DESC', tripId),
        all('SELECT s.expense_id, s.person_id FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ? AND e.deleted_at IS NULL', tripId),
        // 최근 변경 20개. 지운 것이 아직 지워진 상태면 되살릴 수 있다
        all(
          `SELECT a.id, a.who, a.action, a.target, a.ref_kind, a.ref_id, a.created_at,
             CASE WHEN a.action IN ('item_delete','expense_delete') AND COALESCE(
               (SELECT deleted_at FROM items i WHERE a.ref_kind = 'item' AND i.id = a.ref_id AND i.trip_id = a.trip_id),
               (SELECT deleted_at FROM expenses e WHERE a.ref_kind = 'expense' AND e.id = a.ref_id AND e.trip_id = a.trip_id)) IS NOT NULL
             THEN 1 ELSE 0 END AS restorable
           FROM activity a WHERE a.trip_id = ? ORDER BY a.id DESC LIMIT 20`,
          tripId,
        ),
      ]);
      const byExpense = new Map(expenses.map((e) => [e.id, { ...e, shares: [] }]));
      for (const s of shares) byExpense.get(s.expense_id)?.shares.push(s.person_id);
      return {
        people,
        items: items.map((i) => ({ ...i, packed: i.packed === 1 })),
        expenses: [...byExpense.values()],
        activity: activity.map((a) => ({ ...a, restorable: a.restorable === 1 })),
      };
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
      const id = r.meta.last_row_id;
      await record(tripId, id, 'join', name);
      return { id, name };
    },

    // 사람 내보내기: 맡은 준비물은 다시 "주인 없음"으로. 지출 기록은 정산을 위해 남긴다.
    async hidePerson(tripId, personId) {
      const out = await db.batch([
        db.prepare('UPDATE people SET hidden_at = ? WHERE id = ? AND trip_id = ? AND hidden_at IS NULL').bind(nowIso(), personId, tripId),
        db.prepare('UPDATE items SET claimed_by = NULL, packed = 0 WHERE trip_id = ? AND claimed_by = ?').bind(tripId, personId),
      ]);
      if (out[0].meta.changes === 0) throw new RepoError('not_found', '사람을 찾을 수 없어요');
      const p = await one('SELECT name FROM people WHERE id = ?', personId);
      await record(tripId, null, 'person_hide', p.name);
    },

    async addItem(tripId, { name, qty, kind }, by) {
      // 지운 것(되살리기 대기)까지 합쳐 한도의 2배를 넘지 않게 — 지우고 넣기를 반복하는 도배 방지
      const r = await run(
        `INSERT INTO items (trip_id, name, qty, kind, created_at) SELECT ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM items WHERE trip_id = ? AND deleted_at IS NULL) < ? AND (SELECT COUNT(*) FROM items WHERE trip_id = ?) < ?`,
        tripId, name, qty, kind, nowIso(), tripId, LIMITS.maxItems, tripId, LIMITS.maxItems * 2,
      );
      if (r.meta.changes === 0) throw new RepoError('limit', `준비물은 ${LIMITS.maxItems}개까지예요`);
      const id = r.meta.last_row_id;
      await record(tripId, by, 'item_add', name, { kind: 'item', id });
      return { id, name, qty, kind, claimed_by: null, packed: false };
    },

    // 지우기 = 표시만 (7일 동안 "최근 변경"에서 되살리기)
    async deleteItem(tripId, itemId, by) {
      const item = await one('SELECT name FROM items WHERE id = ? AND trip_id = ? AND deleted_at IS NULL', itemId, tripId);
      if (!item) throw new RepoError('not_found', '준비물을 찾을 수 없어요');
      await db.batch([db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').bind(nowIso(), itemId), ...note(tripId, by, 'item_delete', item.name, { kind: 'item', id: itemId })]);
    },
    async restoreItem(tripId, itemId, by) {
      const item = await one('SELECT name FROM items WHERE id = ? AND trip_id = ? AND deleted_at IS NOT NULL', itemId, tripId);
      if (!item) throw new RepoError('not_found', '되살릴 준비물이 없어요 (이미 되살렸거나 7일이 지났어요)');
      const { n } = await one('SELECT COUNT(*) AS n FROM items WHERE trip_id = ? AND deleted_at IS NULL', tripId);
      if (n >= LIMITS.maxItems) throw new RepoError('limit', `준비물은 ${LIMITS.maxItems}개까지예요`);
      await db.batch([db.prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').bind(itemId), ...note(tripId, by, 'item_restore', item.name, { kind: 'item', id: itemId })]);
    },
    async editItem(tripId, itemId, { name, qty }, by) {
      const item = await one('SELECT name, qty FROM items WHERE id = ? AND trip_id = ? AND deleted_at IS NULL', itemId, tripId);
      if (!item) throw new RepoError('not_found', '준비물을 찾을 수 없어요');
      if (item.name === name && item.qty === qty) return;
      const what = item.name === name ? `${name} 수량 ${item.qty} → ${qty}` : `${item.name} → ${name}${qty > 1 ? ` ×${qty}` : ''}`;
      await db.batch([db.prepare('UPDATE items SET name = ?, qty = ? WHERE id = ?').bind(name, qty, itemId), ...note(tripId, by, 'item_edit', what, { kind: 'item', id: itemId })]);
    },

    // 찜·취소·챙김 표시. 두 사람이 동시에 찜해도 먼저 한 사람만 되게 조건부 UPDATE.
    async updateItem(tripId, itemId, { action, person_id, packed }) {
      if (!(await activePerson(tripId, person_id))) throw new RepoError('invalid', '내 이름을 먼저 골라 주세요');
      const sql = {
        claim: ['UPDATE items SET claimed_by = ?, packed = 0 WHERE id = ? AND trip_id = ? AND deleted_at IS NULL AND kind = \'shared\' AND claimed_by IS NULL', [person_id]],
        unclaim: ['UPDATE items SET claimed_by = NULL, packed = 0 WHERE id = ? AND trip_id = ? AND deleted_at IS NULL AND claimed_by = ?', []],
        pack: ['UPDATE items SET packed = ? WHERE id = ? AND trip_id = ? AND deleted_at IS NULL AND claimed_by = ?', [packed ? 1 : 0]],
      }[action];
      if (!sql) throw new RepoError('invalid', '요청이 올바르지 않아요');
      const [q, pre] = sql;
      const args = action === 'claim' ? [...pre, itemId, tripId] : [...pre, itemId, tripId, person_id];
      const r = await run(q, ...args);
      if (r.meta.changes === 0) {
        const cur = await one('SELECT i.kind, i.claimed_by, p.name AS owner FROM items i LEFT JOIN people p ON p.id = i.claimed_by WHERE i.id = ? AND i.trip_id = ? AND i.deleted_at IS NULL', itemId, tripId);
        if (!cur) throw new RepoError('not_found', '준비물을 찾을 수 없어요');
        if (cur.kind !== 'shared') throw new RepoError('invalid', '각자 챙길 것은 맡을 수 없어요');
        if (cur.claimed_by && cur.claimed_by !== person_id) throw new RepoError('conflict', `${cur.owner}님이 먼저 맡았어요`);
        throw new RepoError('conflict', '다른 곳에서 바뀌었어요. 새로고침해 주세요');
      }
      const item = await one('SELECT id, name, qty, kind, claimed_by, packed FROM items WHERE id = ?', itemId);
      const act = action === 'pack' ? (packed ? 'item_pack' : 'item_unpack') : `item_${action}`;
      await record(tripId, person_id, act, item.name, { kind: 'item', id: itemId });
      return item;
    },

    async addExpense(tripId, { amount, paid_by, memo, shares }, by = paid_by) {
      const ids = new Set((await all('SELECT id FROM people WHERE trip_id = ? AND hidden_at IS NULL', tripId)).map((p) => p.id));
      if (!ids.has(paid_by) || shares.some((id) => !ids.has(id))) throw new RepoError('invalid', '사람 정보가 바뀌었어요. 새로고침해 주세요');
      const { n, total } = await one('SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL) AS n, COUNT(*) AS total FROM expenses WHERE trip_id = ?', tripId);
      if (n >= LIMITS.maxExpenses || total >= LIMITS.maxExpenses * 2) throw new RepoError('limit', `지출은 ${LIMITS.maxExpenses}개까지예요`);
      const last = '(SELECT MAX(id) FROM expenses WHERE trip_id = ?)';
      const out = await db.batch([
        db.prepare('INSERT INTO expenses (trip_id, paid_by, amount, memo, created_at) VALUES (?, ?, ?, ?, ?)').bind(tripId, paid_by, amount, memo, nowIso()),
        ...shares.map((pid) => db.prepare(`INSERT INTO expense_shares (expense_id, person_id) SELECT ${last}, ?`).bind(tripId, pid)),
      ]);
      const id = out[0].meta.last_row_id;
      await record(tripId, by, 'expense_add', expenseLabel({ amount, memo }), { kind: 'expense', id });
      return { id };
    },

    async deleteExpense(tripId, expenseId, by) {
      const e = await one('SELECT amount, memo FROM expenses WHERE id = ? AND trip_id = ? AND deleted_at IS NULL', expenseId, tripId);
      if (!e) throw new RepoError('not_found', '지출을 찾을 수 없어요');
      await db.batch([db.prepare('UPDATE expenses SET deleted_at = ? WHERE id = ?').bind(nowIso(), expenseId), ...note(tripId, by, 'expense_delete', expenseLabel(e), { kind: 'expense', id: expenseId })]);
    },
    async restoreExpense(tripId, expenseId, by) {
      const e = await one('SELECT amount, memo FROM expenses WHERE id = ? AND trip_id = ? AND deleted_at IS NOT NULL', expenseId, tripId);
      if (!e) throw new RepoError('not_found', '되살릴 지출이 없어요 (이미 되살렸거나 7일이 지났어요)');
      await db.batch([db.prepare('UPDATE expenses SET deleted_at = NULL WHERE id = ?').bind(expenseId), ...note(tripId, by, 'expense_restore', expenseLabel(e), { kind: 'expense', id: expenseId })]);
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
      const [t, c, p, g, e, f] = await Promise.all([
        one('SELECT COUNT(*) AS n FROM trips WHERE deleted_at IS NULL'),
        one('SELECT COUNT(*) AS n FROM trips WHERE created_at >= ? AND deleted_at IS NULL', since),
        one('SELECT COUNT(DISTINCT p.trip_id) AS n FROM people p JOIN trips t ON t.id = p.trip_id WHERE p.created_at >= ? AND t.deleted_at IS NULL', since),
        one('SELECT COUNT(*) AS n FROM (SELECT p.trip_id FROM people p JOIN trips t ON t.id = p.trip_id WHERE p.created_at >= ? AND t.deleted_at IS NULL GROUP BY p.trip_id HAVING COUNT(*) >= 2)', since),
        one('SELECT COUNT(DISTINCT e.trip_id) AS n FROM expenses e JOIN trips t ON t.id = e.trip_id WHERE e.created_at >= ? AND t.deleted_at IS NULL', since),
        one('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?', since),
      ]);
      return { '전체 목록': t.n, '이번 주 새 목록': c.n, '이번 주 참여가 생긴 목록': p.n, '이번 주 2명 이상 함께 쓴 목록': g.n, '이번 주 정산 쓴 목록': e.n, '이번 주 피드백': f.n };
    },

    async recordVisit(date, vid, src) {
      const stmts = [
        db.prepare('INSERT OR IGNORE INTO visits (date, vid) VALUES (?, ?)').bind(date, vid),
        db.prepare("INSERT INTO daily_counts (date, key, n) VALUES (?, 'views', 1) ON CONFLICT(date, key) DO UPDATE SET n = n + 1").bind(date),
      ];
      if (src) stmts.push(db.prepare('INSERT INTO daily_counts (date, key, n) VALUES (?, ?, 1) ON CONFLICT(date, key) DO UPDATE SET n = n + 1').bind(date, `src:${src}`));
      await db.batch(stmts);
    },
    async purgeVisits(days = 30) {
      const cut = new Date(Date.now() + 9 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
      await db.batch([db.prepare('DELETE FROM visits WHERE date < ?').bind(cut), db.prepare('DELETE FROM daily_counts WHERE date < ?').bind(cut)]);
    },

    // 운영 대시보드용 공개 통계 — 집계 숫자만 (개인정보·목록 내용 없음). 날짜는 한국 시간.
    async publicStats(days = 14) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const sinceDate = new Date(Date.now() + 9 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
      const kst = (col) => `date(${col}, '+9 hours')`;
      const byDay = async (sql) => Object.fromEntries((await all(sql, since)).map((r) => [r.date, r.n]));
      const [visitors, counts, created, joined, items, expenses, daily] = await Promise.all([
        all('SELECT date, COUNT(*) AS n FROM visits WHERE date >= ? GROUP BY date', sinceDate),
        all('SELECT date, key, n FROM daily_counts WHERE date >= ?', sinceDate),
        byDay(`SELECT ${kst('created_at')} AS date, COUNT(*) AS n FROM trips WHERE created_at >= ? AND deleted_at IS NULL GROUP BY 1`),
        byDay(`SELECT ${kst('x.created_at')} AS date, COUNT(*) AS n FROM people x JOIN trips t ON t.id = x.trip_id WHERE x.created_at >= ? AND t.deleted_at IS NULL GROUP BY 1`),
        byDay(`SELECT ${kst('x.created_at')} AS date, COUNT(*) AS n FROM items x JOIN trips t ON t.id = x.trip_id WHERE x.created_at >= ? AND t.deleted_at IS NULL GROUP BY 1`),
        byDay(`SELECT ${kst('x.created_at')} AS date, COUNT(*) AS n FROM expenses x JOIN trips t ON t.id = x.trip_id WHERE x.created_at >= ? AND t.deleted_at IS NULL GROUP BY 1`),
        this.daily(days),
      ]);
      const vis = Object.fromEntries(visitors.map((r) => [r.date, r.n]));
      const views = {}, sources = {};
      for (const r of counts) {
        if (r.key === 'views') views[r.date] = r.n;
        else if (r.key.startsWith('src:')) sources[r.key.slice(4)] = (sources[r.key.slice(4)] ?? 0) + r.n;
      }
      const together = Object.fromEntries(daily.map((r) => [r.date, r.together]));
      const settled = Object.fromEntries(daily.map((r) => [r.date, r.settled]));
      const dates = [];
      for (let i = days - 1; i >= 0; i--) dates.push(new Date(Date.now() + 9 * 3_600_000 - i * 86_400_000).toISOString().slice(0, 10));
      return {
        at: new Date().toISOString(),
        // 대시보드가 이 이름 그대로 보여 준다 (서비스마다 다른 기능 이름을 본부가 몰라도 되게)
        series: { visitors: '방문자', views: '페이지 열람', created: '목록 만들기', joined: '참여(이름 추가)', items: '준비물 추가', expenses: '정산 기록' },
        days: dates.map((date) => ({
          date, visitors: vis[date] ?? 0, views: views[date] ?? 0, created: created[date] ?? 0, joined: joined[date] ?? 0,
          items: items[date] ?? 0, expenses: expenses[date] ?? 0, together: together[date] ?? 0, settled: settled[date] ?? 0,
        })),
        sources,
        totals: await this.stats(),
      };
    },

    // 날짜별 (한국 시간) — 만든 목록 / 그중 2명 이상 참여 / 그중 정산까지 쓴 목록
    async daily(days = 14) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const rows = await all(
        `SELECT date(t.created_at, '+9 hours') AS date, COUNT(*) AS created,
           SUM(CASE WHEN (SELECT COUNT(*) FROM people p WHERE p.trip_id = t.id) >= 2 THEN 1 ELSE 0 END) AS together,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM expenses e WHERE e.trip_id = t.id) THEN 1 ELSE 0 END) AS settled
         FROM trips t WHERE t.created_at >= ? AND t.deleted_at IS NULL GROUP BY date(t.created_at, '+9 hours') ORDER BY date`,
        since,
      );
      return rows;
    },
  };
}
