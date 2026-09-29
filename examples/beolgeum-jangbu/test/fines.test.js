import { describe, it, expect } from 'vitest';
import { entryFine, summarize, kakaoSummary } from '../src/fines.js';
import { validateGroup, validateDate, validateAmount, validateMemberName } from '../src/validate.js';

const rules = { fine_late: 1000, fine_absent: 3000, fine_homework: 2000 };

describe('entryFine', () => {
  it('출석은 0원', () => expect(entryFine({ status: 'present', homework_missed: 0 }, rules)).toBe(0));
  it('지각 1000', () => expect(entryFine({ status: 'late', homework_missed: 0 }, rules)).toBe(1000));
  it('결석 + 과제 미제출 = 5000', () => expect(entryFine({ status: 'absent', homework_missed: 1 }, rules)).toBe(5000));
});

describe('summarize', () => {
  const members = [{ id: 1, name: '민수' }, { id: 2, name: '지영' }];
  it('회차별 규칙 스냅숏으로 계산하고 납부를 뺀다', () => {
    const sessions = [
      { ...rules, entries: [{ member_id: 1, status: 'late', homework_missed: 0 }] },
      { fine_late: 500, fine_absent: 3000, fine_homework: 2000, entries: [{ member_id: 1, status: 'late', homework_missed: 1 }] },
    ];
    const r = summarize(members, sessions, [{ member_id: 1, amount: 3000 }, { member_id: 2, amount: 1000 }]);
    expect(r.find((x) => x.member.id === 1)).toMatchObject({ fined: 3500, paid: 3000, balance: 500 });
    expect(r.find((x) => x.member.id === 2)).toMatchObject({ fined: 0, paid: 1000, balance: -1000 });
  });
  it('카톡 요약: 미납·선납·완납, 미납 합계', () => {
    const text = kakaoSummary('스터디', [
      { member: { name: '민수' }, balance: 1000 },
      { member: { name: '지영' }, balance: -500 },
      { member: { name: '철수' }, balance: 0 },
    ]);
    expect(text).toBe('[스터디] 벌금 정산\n민수 1,000원 미납\n지영 500원 선납\n철수 완납\n미납 합계 1,000원');
  });
});

describe('validate', () => {
  it('빈 이름·음수·초과 금액을 거부', () => {
    const { errors } = validateGroup({ name: ' ', fine_late: -1, fine_absent: 1_000_001, fine_homework: 1.5 });
    expect(Object.keys(errors).sort()).toEqual(['fine_absent', 'fine_homework', 'fine_late', 'name']);
  });
  it('정상 입력', () => {
    expect(validateGroup({ name: ' 스터디 ', fine_late: 0, fine_absent: 1000, fine_homework: 1_000_000 })).toEqual({
      errors: {},
      value: { name: '스터디', fine_late: 0, fine_absent: 1000, fine_homework: 1_000_000 },
    });
  });
  it('날짜', () => {
    expect(validateDate('2026-09-29')).toBe(true);
    expect(validateDate('2026-02-30')).toBe(false);
    expect(validateDate('20260929')).toBe(false);
  });
  it('금액·이름', () => {
    expect(validateAmount('3000')).toBe(3000);
    expect(validateAmount(0)).toBeNull();
    expect(validateMemberName('a'.repeat(31)).error).toBeTruthy();
  });
});
