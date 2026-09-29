// 벌금 계산 — 순수 함수.
export const STATUSES = ['present', 'late', 'absent'];

export function entryFine(entry, rules) {
  let fine = 0;
  if (entry.status === 'late') fine += rules.fine_late;
  if (entry.status === 'absent') fine += rules.fine_absent;
  if (entry.homework_missed) fine += rules.fine_homework;
  return fine;
}

// sessions: [{ fine_late, fine_absent, fine_homework, entries: [{ member_id, status, homework_missed }] }]
// payments: [{ member_id, amount }]
export function summarize(members, sessions, payments) {
  const rows = new Map(members.map((m) => [m.id, { member: m, fined: 0, paid: 0 }]));
  for (const s of sessions) {
    for (const e of s.entries) {
      const r = rows.get(e.member_id);
      if (r) r.fined += entryFine(e, s);
    }
  }
  for (const p of payments) {
    const r = rows.get(p.member_id);
    if (r) r.paid += p.amount;
  }
  return [...rows.values()].map((r) => ({ ...r, balance: r.fined - r.paid }));
}

export const won = (n) => `${n.toLocaleString('ko-KR')}원`;

export function kakaoSummary(groupName, summary) {
  const lines = summary
    .filter((r) => !r.member.hidden_at || r.balance !== 0)
    .map((r) => {
      if (r.balance > 0) return `${r.member.name} ${won(r.balance)} 미납`;
      if (r.balance < 0) return `${r.member.name} ${won(-r.balance)} 선납`;
      return `${r.member.name} 완납`;
    });
  const total = summary.reduce((a, r) => a + Math.max(r.balance, 0), 0);
  return [`[${groupName}] 벌금 정산`, ...lines, `미납 합계 ${won(total)}`].join('\n');
}
