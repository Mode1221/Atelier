import { describe, it, expect } from 'vitest';
import { splitAmount, balances, transfers } from '../src/settle.js';

const P = [{ id: 1, name: '민수' }, { id: 2, name: '지영' }, { id: 3, name: '하늘' }];

describe('정산 계산', () => {
  it('나누어떨어지지 않으면 id 가 작은 사람부터 1원씩 더', () => {
    expect([...splitAmount(10_000, [3, 1, 2])]).toEqual([[1, 3334], [2, 3333], [3, 3333]]);
    expect([...splitAmount(100, [])]).toEqual([]);
  });
  it('합계가 항상 0 (돈이 새거나 생기지 않는다)', () => {
    const rows = balances(P, [
      { paid_by: 1, amount: 90_001, shares: [1, 2, 3] },
      { paid_by: 2, amount: 12_345, shares: [2, 3] },
    ]);
    expect(rows.reduce((a, r) => a + r.net, 0)).toBe(0);
  });
  it('한 명이 다 냈으면 나머지가 그 사람에게 보낸다', () => {
    const t = transfers(balances(P, [{ paid_by: 1, amount: 90_000, shares: [1, 2, 3] }]));
    expect(t).toEqual([{ from: 2, to: 1, amount: 30_000 }, { from: 3, to: 1, amount: 30_000 }]);
  });
  it('서로 낸 돈이 있으면 상계해서 송금 횟수를 줄인다', () => {
    const t = transfers(
      balances(P, [
        { paid_by: 1, amount: 60_000, shares: [1, 2, 3] },
        { paid_by: 2, amount: 30_000, shares: [1, 2, 3] },
      ]),
    );
    // 1인 부담 30,000: 민수 +30,000 / 지영 0 / 하늘 -30,000
    expect(t).toEqual([{ from: 3, to: 1, amount: 30_000 }]);
  });
  it('나눠 낼 사람에서 빠진 사람은 부담이 없다', () => {
    const rows = balances(P, [{ paid_by: 1, amount: 20_000, shares: [1, 2] }]);
    expect(rows.find((r) => r.person.id === 3).owed).toBe(0);
    expect(transfers(rows)).toEqual([{ from: 2, to: 1, amount: 10_000 }]);
  });
  it('무작위 입력에서도 송금 후 모두 0이 되고 송금 수는 사람 수 - 1 이하', () => {
    for (let n = 0; n < 200; n++) {
      const people = Array.from({ length: 2 + (n % 8) }, (_, i) => ({ id: i + 1 }));
      const ids = people.map((p) => p.id);
      const expenses = Array.from({ length: 1 + (n % 5) }, (_, k) => ({
        paid_by: ids[(n + k) % ids.length],
        amount: 1 + ((n * 7919 + k * 104729) % 300_000),
        shares: ids.filter((id) => (id + k + n) % 3 !== 0).concat(ids[0]),
      }));
      const rows = balances(people, expenses.map((e) => ({ ...e, shares: [...new Set(e.shares)] })));
      const t = transfers(rows);
      const net = new Map(rows.map((r) => [r.person.id, r.net]));
      for (const m of t) {
        net.set(m.from, net.get(m.from) + m.amount);
        net.set(m.to, net.get(m.to) - m.amount);
        expect(m.amount).toBeGreaterThan(0);
      }
      expect([...net.values()].every((v) => v === 0)).toBe(true);
      expect(t.length).toBeLessThanOrEqual(people.length - 1);
    }
  });
});
