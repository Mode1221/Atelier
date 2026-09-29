// 저장소 어댑터 — 모든 DB 접근은 여기로만 (ADR-001).
import { newId, newAdminKey, hashKey } from './security.js';
import { LIMITS } from './validate.js';
import { STATUSES } from './fines.js';

const nowIso = () => new Date().toISOString();

export class RepoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createRepo(db) {
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  const repo = {
    ping() {
      return db.prepare('SELECT 1 AS ok').get().ok === 1;
    },

    createGroup({ name, fine_late, fine_absent, fine_homework }) {
      const id = newId();
      const adminKey = newAdminKey();
      db.prepare(
        'INSERT INTO groups (id, name, admin_key_hash, fine_late, fine_absent, fine_homework, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, name, hashKey(adminKey), fine_late, fine_absent, fine_homework, nowIso());
      return { id, adminKey };
    },

    getGroup(id) {
      return db.prepare('SELECT * FROM groups WHERE id = ? AND deleted_at IS NULL').get(id) ?? null;
    },

    deleteGroup(id) {
      db.prepare('UPDATE groups SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(nowIso(), id);
    },

    // 삭제 요청 후 days 일 지난 모임을 영구 삭제 (spec S2 보존 정책)
    purgeDeleted(days = 30) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return Number(db.prepare('DELETE FROM groups WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff).changes);
    },

    listMembers(groupId) {
      return db.prepare('SELECT id, name, hidden_at FROM members WHERE group_id = ? ORDER BY id').all(groupId);
    },

    addMember(groupId, name) {
      return tx(() => {
        const active = db.prepare('SELECT name FROM members WHERE group_id = ? AND hidden_at IS NULL').all(groupId);
        if (active.some((m) => m.name === name)) throw new RepoError('duplicate', '이미 있는 이름이에요');
        if (active.length >= LIMITS.maxMembers) throw new RepoError('limit', `멤버는 ${LIMITS.maxMembers}명까지예요`);
        const r = db.prepare('INSERT INTO members (group_id, name, created_at) VALUES (?, ?, ?)').run(groupId, name, nowIso());
        return { id: Number(r.lastInsertRowid), name, hidden_at: null };
      });
    },

    hideMember(groupId, memberId) {
      const r = db
        .prepare('UPDATE members SET hidden_at = ? WHERE id = ? AND group_id = ? AND hidden_at IS NULL')
        .run(nowIso(), memberId, groupId);
      if (r.changes === 0) throw new RepoError('not_found', '멤버를 찾을 수 없어요');
    },

    listSessions(groupId) {
      const sessions = db
        .prepare('SELECT * FROM sessions WHERE group_id = ? ORDER BY date DESC, id DESC')
        .all(groupId);
      const entries = db
        .prepare(
          'SELECT a.session_id, a.member_id, a.status, a.homework_missed FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.group_id = ?',
        )
        .all(groupId);
      const bySession = new Map(sessions.map((s) => [s.id, { ...s, entries: [] }]));
      for (const e of entries) bySession.get(e.session_id)?.entries.push(e);
      return [...bySession.values()];
    },

    getSession(groupId, sessionId) {
      return this.listSessions(groupId).find((s) => s.id === sessionId) ?? null;
    },

    saveSession(groupId, { sessionId, date, entries, expectedUpdatedAt }) {
      return tx(() => {
        const members = new Set(
          db.prepare('SELECT id FROM members WHERE group_id = ? AND hidden_at IS NULL').all(groupId).map((m) => m.id),
        );
        for (const e of entries) {
          if (!members.has(e.member_id)) throw new RepoError('invalid', '멤버 정보가 바뀌었어요. 새로고침해 주세요');
          if (!STATUSES.includes(e.status)) throw new RepoError('invalid', '출결 상태가 올바르지 않아요');
        }
        const ts = nowIso();
        let id = sessionId;
        if (id == null) {
          const count = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE group_id = ?').get(groupId).n;
          if (count >= LIMITS.maxSessions) throw new RepoError('limit', `회차는 ${LIMITS.maxSessions}개까지예요`);
          const g = db.prepare('SELECT fine_late, fine_absent, fine_homework FROM groups WHERE id = ?').get(groupId);
          id = Number(
            db
              .prepare(
                'INSERT INTO sessions (group_id, date, fine_late, fine_absent, fine_homework, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              )
              .run(groupId, date, g.fine_late, g.fine_absent, g.fine_homework, ts, ts).lastInsertRowid,
          );
        } else {
          const cur = db.prepare('SELECT updated_at FROM sessions WHERE id = ? AND group_id = ?').get(id, groupId);
          if (!cur) throw new RepoError('not_found', '회차를 찾을 수 없어요');
          if (expectedUpdatedAt && cur.updated_at !== expectedUpdatedAt)
            throw new RepoError('conflict', '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 저장해 주세요');
          db.prepare('UPDATE sessions SET date = ?, updated_at = ? WHERE id = ?').run(date, ts, id);
          db.prepare('DELETE FROM attendance WHERE session_id = ?').run(id);
        }
        const ins = db.prepare('INSERT INTO attendance (session_id, member_id, status, homework_missed) VALUES (?, ?, ?, ?)');
        for (const e of entries) ins.run(id, e.member_id, e.status, e.homework_missed ? 1 : 0);
        return { id, updated_at: ts };
      });
    },

    deleteSession(groupId, sessionId) {
      const r = db.prepare('DELETE FROM sessions WHERE id = ? AND group_id = ?').run(sessionId, groupId);
      if (r.changes === 0) throw new RepoError('not_found', '회차를 찾을 수 없어요');
    },

    listPayments(groupId) {
      return db
        .prepare(
          'SELECT p.id, p.member_id, p.amount, p.paid_at FROM payments p JOIN members m ON m.id = p.member_id WHERE m.group_id = ? ORDER BY p.paid_at DESC',
        )
        .all(groupId);
    },

    addPayment(groupId, memberId, amount) {
      const m = db.prepare('SELECT id FROM members WHERE id = ? AND group_id = ?').get(memberId, groupId);
      if (!m) throw new RepoError('not_found', '멤버를 찾을 수 없어요');
      const r = db.prepare('INSERT INTO payments (member_id, amount, paid_at) VALUES (?, ?, ?)').run(memberId, amount, nowIso());
      return { id: Number(r.lastInsertRowid) };
    },

    deletePayment(groupId, paymentId) {
      const r = db
        .prepare('DELETE FROM payments WHERE id = ? AND member_id IN (SELECT id FROM members WHERE group_id = ?)')
        .run(paymentId, groupId);
      if (r.changes === 0) throw new RepoError('not_found', '납부 기록을 찾을 수 없어요');
    },
  };
  return repo;
}
