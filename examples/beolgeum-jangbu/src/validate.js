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

// 베타 피드백. 공개 저장소 이슈로 옮겨질 수 있으므로 연락처·모임 링크처럼 보이는 값은 가린다.
export const FEEDBACK_KINDS = { good: '좋아요', hard: '불편해요', bug: '오류', idea: '제안' };
// 경로는 패턴으로만 남긴다 — 모임 ID(보기 링크)가 새지 않게
const PAGES = [
  [/^\/$/, '/'],
  [/^\/g\/[^/]+$/, '/g/:id'],
  [/^\/(privacy|terms|feedback)$/, null],
];
export function feedbackPage(raw) {
  const path = typeof raw === 'string' ? raw.split(/[?#]/)[0] : '';
  for (const [re, name] of PAGES) if (re.test(path)) return name ?? path;
  return '기타';
}
export function maskContacts(text) {
  return text
    .replace(/https?:\/\/\S*\/g\/[\w-]+\S*/g, '[모임 링크 가림]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[이메일 가림]')
    .replace(/(\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, '[전화번호 가림]');
}
export function validateFeedback(input) {
  const kind = Object.hasOwn(FEEDBACK_KINDS, input?.kind) ? input.kind : null;
  if (!kind) return { error: '종류를 골라 주세요' };
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (message.length > 1000) return { error: '1000자까지 적을 수 있어요' };
  if (!message && kind !== 'good') return { error: '내용을 적어 주세요' };
  return { value: { kind, message: maskContacts(message), page: feedbackPage(input.page) } };
}
