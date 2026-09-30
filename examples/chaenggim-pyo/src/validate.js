// 입력 검증. 실패하면 사용자에게 보여 줄 한국어 메시지를 돌려준다.
import { TEMPLATES } from './templates.js';

export const LIMITS = { tripNameMax: 40, nameMax: 20, itemNameMax: 30, memoMax: 40, maxPeople: 30, maxItems: 200, maxExpenses: 300, maxAmount: 10_000_000 };

const text = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export function validateDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw);
}

export function validateTrip(input) {
  const errors = {};
  const name = text(input?.name);
  if (!name) errors.name = '이름을 입력해 주세요';
  else if (name.length > LIMITS.tripNameMax) errors.name = `이름은 ${LIMITS.tripNameMax}자까지예요`;
  const template = Object.hasOwn(TEMPLATES, input?.template) ? input.template : 'blank';
  let starts_on = null;
  if (input?.starts_on) {
    if (validateDate(input.starts_on)) starts_on = input.starts_on;
    else errors.starts_on = '날짜를 확인해 주세요';
  }
  return { errors, value: { name, template, starts_on } };
}

export function validatePersonName(raw) {
  const name = text(raw);
  if (!name) return { error: '이름을 입력해 주세요' };
  if (name.length > LIMITS.nameMax) return { error: `이름은 ${LIMITS.nameMax}자까지예요` };
  return { name };
}

export function validateItem(input) {
  const name = text(input?.name);
  if (!name) return { error: '준비물 이름을 입력해 주세요' };
  if (name.length > LIMITS.itemNameMax) return { error: `준비물 이름은 ${LIMITS.itemNameMax}자까지예요` };
  const qty = input?.qty === undefined || input?.qty === '' ? 1 : Number(input.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: '수량은 1~99 사이로 입력해 주세요' };
  const kind = input?.kind === 'personal' ? 'personal' : 'shared';
  return { value: { name, qty, kind } };
}

export function validateExpense(input) {
  const amount = Number(input?.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > LIMITS.maxAmount) return { error: '금액은 1원~1,000만 원 사이로 입력해 주세요' };
  const paid_by = Number(input?.paid_by);
  if (!Number.isSafeInteger(paid_by) || paid_by <= 0) return { error: '낸 사람을 골라 주세요' };
  const memo = text(input?.memo);
  if (memo.length > LIMITS.memoMax) return { error: `메모는 ${LIMITS.memoMax}자까지예요` };
  const shares = Array.isArray(input?.shares) ? [...new Set(input.shares.map(Number))] : [];
  if (!shares.length) return { error: '나눠 낼 사람을 한 명 이상 골라 주세요' };
  if (shares.length > LIMITS.maxPeople || shares.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { error: '나눠 낼 사람 정보가 올바르지 않아요' };
  return { value: { amount, paid_by, memo, shares } };
}

// 베타 피드백. 공개 저장소 이슈로 옮겨질 수 있으므로 연락처·목록 링크처럼 보이는 값은 가린다.
export const FEEDBACK_KINDS = { good: '좋아요', hard: '불편해요', bug: '오류', idea: '제안' };
const PAGES = [
  [/^\/$/, '/'],
  [/^\/t\/[^/]+$/, '/t/:id'],
  [/^\/(privacy|terms|feedback)$/, null],
];
export function feedbackPage(raw) {
  const path = typeof raw === 'string' ? raw.split(/[?#]/)[0] : '';
  for (const [re, name] of PAGES) if (re.test(path)) return name ?? path;
  return '기타';
}
export function maskContacts(s) {
  return s
    .replace(/https?:\/\/\S*\/t\/[\w-]+\S*/g, '[목록 링크 가림]')
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
