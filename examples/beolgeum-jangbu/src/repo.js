// 저장소 어댑터 — 모든 DB 접근은 여기로만 (ADR-001). Cloudflare D1 API (비동기, batch = 트랜잭션).
import { newId, newAdminKey, hashKey } from './security.js';
import { LIMITS } from './validate.js';
import { STATUSES } from './fines.js';

const nowIso = () => new Date().toISOString();
// 수정 충돌 확인용 버전 값 — 같은 밀리초에 두 번 저장돼도 겹치지 않게
const version = () => `${nowIso()}~${Math.random().toString(36).slice(2, 8)}`;

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

    async createGroup({ name, fine_late, fine_absent, fine_homework }) {
      const id = newId();
      const adminKey = newAdminKey();
      await run(
        'INSERT INTO groups (id, name, admin_key_hash, fine_late, fine_absent, fine_homework, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, name, hashKey(adminKey), fine_late, fine_absent, fine_homework, nowIso(),
      );
      return { id, adminKey };
    },

    getGroup: (id) => one('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL', id),

    async deleteGroup(id) {
      await run('UPDATE groups SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', nowIso(), id);
    },

    // 삭제 요청 후 days 일 지난 모임을 영구 삭제 (spec S2 보존 정책)
    async purgeDeleted(days = 30) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return (await run('DELETE FROM groups WHERE deleted_at IS NOT NULL AND deleted_at < ?', cutoff)).meta.changes;
    },

    listMembers: (groupId) => all('SELECT id, name, hidden_at FROM members WHERE group_id = ? ORDER BY id', groupId),

    async addMember(groupId, name) {
      // 한도·중복 확인과 추가를 한 문장으로 (동시 요청에도 안전)
      const r = await run(
        `INSERT INTO members (group_id, name, created_at)
         SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM members WHERE group_id = ? AND hidden_at IS NULL) < ?
         AND NOT EXISTS (SELECT 1 FROM members WHERE group_id = ? AND hidden_at IS NULL AND name = ?)`,
        groupId, name, nowIso(), groupId, LIMITS.maxMembers, groupId, name,
      );
      if (r.meta.changes === 0) {
        const dup = await one('SELECT 1 AS x FROM members WHERE group_id = ? AND hidden_at IS NULL AND name = ?', groupId, name);
        if (dup) throw new RepoError('duplicate', '이미 있는 이름이에요');
        throw new RepoError('limit', `멤버는 ${LIMITS.maxMembers}명까지예요`);
      }
      return { id: r.meta.last_row_id, name, hidden_at: null };
    },

    async hideMember(groupId, memberId) {
      const r = await run('UPDATE members SET hidden_at = ? WHERE id = ? AND group_id = ? AND hidden_at IS NULL', nowIso(), memberId, groupId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '멤버를 찾을 수 없어요');
    },

    async listSessions(groupId) {
      const [sessions, entries] = await Promise.all([
        all('SELECT * FROM sessions WHERE group_id = ? ORDER BY date DESC, id DESC', groupId),
        all('SELECT a.session_id, a.member_id, a.status, a.homework_missed FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.group_id = ?', groupId),
      ]);
      const bySession = new Map(sessions.map((s) => [s.id, { ...s, entries: [] }]));
      for (const e of entries) bySession.get(e.session_id)?.entries.push(e);
      return [...bySession.values()];
    },

    async saveSession(groupId, { sessionId, date, entries, expectedUpdatedAt }) {
      const members = new Set((await all('SELECT id FROM members WHERE group_id = ? AND hidden_at IS NULL', groupId)).map((m) => m.id));
      for (const e of entries) {
        if (!members.has(e.member_id)) throw new RepoError('invalid', '멤버 정보가 바뀌었어요. 새로고침해 주세요');
        if (!STATUSES.includes(e.status)) throw new RepoError('invalid', '출결 상태가 올바르지 않아요');
      }
      const ts = version();
      const ins = (sidSql, sidArgs) =>
        entries.map((e) =>
          db.prepare(`INSERT INTO attendance (session_id, member_id, status, homework_missed) SELECT ${sidSql}, ?, ?, ?`).bind(...sidArgs, e.member_id, e.status, e.homework_missed ? 1 : 0),
        );

      if (sessionId == null) {
        const { n } = await one('SELECT COUNT(*) AS n FROM sessions WHERE group_id = ?', groupId);
        if (n >= LIMITS.maxSessions) throw new RepoError('limit', `회차는 ${LIMITS.maxSessions}개까지예요`);
        // 회차 생성 + 출결을 한 트랜잭션(batch)으로. 방금 만든 회차는 이 모임의 가장 큰 id.
        const out = await db.batch([
          db.prepare(
            'INSERT INTO sessions (group_id, date, fine_late, fine_absent, fine_homework, created_at, updated_at) SELECT id, ?, fine_late, fine_absent, fine_homework, ?, ? FROM groups WHERE id = ?',
          ).bind(date, nowIso(), ts, groupId),
          ...ins('(SELECT MAX(id) FROM sessions WHERE group_id = ?)', [groupId]),
        ]);
        return { id: out[0].meta.last_row_id, updated_at: ts };
      }

      // 수정: 버전이 맞을 때만 갱신하고, 이어지는 문장은 갱신이 일어났을 때만 효과가 있게 조건을 건다
      const cond = '(SELECT 1 FROM sessions WHERE id = ? AND updated_at = ?)';
      const out = await db.batch([
        db.prepare('UPDATE sessions SET date = ?, updated_at = ? WHERE id = ? AND group_id = ? AND (? IS NULL OR updated_at = ?)').bind(date, ts, sessionId, groupId, expectedUpdatedAt ?? null, expectedUpdatedAt ?? null),
        db.prepare(`DELETE FROM attendance WHERE session_id = ? AND EXISTS ${cond}`).bind(sessionId, sessionId, ts),
        ...entries.map((e) =>
          db.prepare(`INSERT INTO attendance (session_id, member_id, status, homework_missed) SELECT ?, ?, ?, ? WHERE EXISTS ${cond}`).bind(sessionId, e.member_id, e.status, e.homework_missed ? 1 : 0, sessionId, ts),
        ),
      ]);
      if (out[0].meta.changes === 0) {
        const exists = await one('SELECT 1 AS x FROM sessions WHERE id = ? AND group_id = ?', sessionId, groupId);
        if (!exists) throw new RepoError('not_found', '회차를 찾을 수 없어요');
        throw new RepoError('conflict', '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 저장해 주세요');
      }
      return { id: sessionId, updated_at: ts };
    },

    async deleteSession(groupId, sessionId) {
      const r = await run('DELETE FROM sessions WHERE id = ? AND group_id = ?', sessionId, groupId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '회차를 찾을 수 없어요');
    },

    listPayments: (groupId) =>
      all('SELECT p.id, p.member_id, p.amount, p.paid_at FROM payments p JOIN members m ON m.id = p.member_id WHERE m.group_id = ? ORDER BY p.paid_at DESC', groupId),

    async addPayment(groupId, memberId, amount) {
      const r = await run('INSERT INTO payments (member_id, amount, paid_at) SELECT id, ?, ? FROM members WHERE id = ? AND group_id = ?', amount, nowIso(), memberId, groupId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '멤버를 찾을 수 없어요');
      return { id: r.meta.last_row_id };
    },

    async deletePayment(groupId, paymentId) {
      const r = await run('DELETE FROM payments WHERE id = ? AND member_id IN (SELECT id FROM members WHERE group_id = ?)', paymentId, groupId);
      if (r.meta.changes === 0) throw new RepoError('not_found', '납부 기록을 찾을 수 없어요');
    },

    async stats() {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [g, c, a, s] = await Promise.all([
        one('SELECT COUNT(*) AS n FROM groups WHERE deleted_at IS NULL'),
        one('SELECT COUNT(*) AS n FROM groups WHERE created_at >= ?', since),
        one('SELECT COUNT(DISTINCT group_id) AS n FROM sessions WHERE created_at >= ?', since),
        one('SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?', since),
      ]);
      return { '전체 모임': g.n, '이번 주 새 모임': c.n, '주간 기록 모임': a.n, '이번 주 회차': s.n };
    },
  };
}
