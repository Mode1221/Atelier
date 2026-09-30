// 장보기 정산 — 원 단위 정수만. 나머지 원은 id 가 작은 사람부터 1원씩 더 낸다.
export function splitAmount(amount, personIds) {
  const ids = [...personIds].sort((a, b) => a - b);
  if (!ids.length) return new Map();
  const base = Math.floor(amount / ids.length);
  const rest = amount - base * ids.length;
  return new Map(ids.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
}

// 사람별 낸 돈·부담할 돈·차액 (+ = 받을 돈, - = 보낼 돈)
export function balances(people, expenses) {
  const rows = new Map(people.map((p) => [p.id, { person: p, paid: 0, owed: 0, net: 0 }]));
  for (const e of expenses) {
    const payer = rows.get(e.paid_by);
    if (payer) payer.paid += e.amount;
    for (const [id, share] of splitAmount(e.amount, e.shares)) {
      const r = rows.get(id);
      if (r) r.owed += share;
    }
  }
  for (const r of rows.values()) r.net = r.paid - r.owed;
  return [...rows.values()];
}

// 송금 횟수를 줄이는 정산: 가장 많이 보낼 사람 → 가장 많이 받을 사람 순서로 맞춘다.
export function transfers(rows) {
  const give = rows.filter((r) => r.net < 0).map((r) => ({ id: r.person.id, left: -r.net }));
  const take = rows.filter((r) => r.net > 0).map((r) => ({ id: r.person.id, left: r.net }));
  const byLeft = (a, b) => b.left - a.left || a.id - b.id;
  const out = [];
  give.sort(byLeft);
  take.sort(byLeft);
  let i = 0;
  let j = 0;
  while (i < give.length && j < take.length) {
    const amount = Math.min(give[i].left, take[j].left);
    out.push({ from: give[i].id, to: take[j].id, amount });
    give[i].left -= amount;
    take[j].left -= amount;
    if (!give[i].left) i += 1;
    if (!take[j].left) j += 1;
  }
  return out;
}

export const won = (n) => `${n.toLocaleString('ko-KR')}원`;
