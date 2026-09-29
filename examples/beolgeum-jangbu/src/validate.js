// 입력 검증. 실패하면 { field: 메시지 } 를 돌려준다.
export const LIMITS = { maxFine: 1_000_000, maxMembers: 30, maxSessions: 500, nameMax: 30, groupNameMax: 40 };

const isInt = (v) => Number.isInteger(v);

export function validateGroup(input) {
  const errors = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) errors.name = '모임 이름을 입력해 주세요';
  else if (name.length > LIMITS.groupNameMax) errors.name = `모임 이름은 ${LIMITS.groupNameMax}자까지예요`;
  const fines = {};
  for (const k of ['fine_late', 'fine_absent', 'fine_homework']) {
    const v = Number(input[k]);
    if (!isInt(v) || v < 0 || v > LIMITS.maxFine) errors[k] = '0~1,000,000원 사이로 입력해 주세요';
    fines[k] = v;
  }
  return { errors, value: { name, ...fines } };
}

export function validateMemberName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { error: '이름을 입력해 주세요' };
  if (name.length > LIMITS.nameMax) return { error: `이름은 ${LIMITS.nameMax}자까지예요` };
  return { name };
}

export function validateDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw);
}

export function validateAmount(raw) {
  const v = Number(raw);
  return isInt(v) && v > 0 && v <= LIMITS.maxFine ? v : null;
}
