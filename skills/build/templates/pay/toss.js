// 토스페이먼츠 API 클라이언트 (서버 전용 — 시크릿 키는 브라우저로 보내지 않는다)
// 문서: https://docs.tosspayments.com/reference (2026-10 기준 형식. 바뀌면 이 파일만 고친다)
// fetch 를 주입받아 테스트에서 가짜로 바꿀 수 있다.
const API = 'https://api.tosspayments.com';

export class TossError extends Error {
  constructor(status, code, message) {
    super(message || code || `토스페이먼츠 오류 ${status}`);
    this.status = status;
    this.code = code;
  }
}

export function createToss({ secretKey, fetch: f = fetch, base = API } = {}) {
  if (!secretKey) throw new Error('TOSS_SECRET_KEY 가 없어요 — .dev.vars(로컬) 또는 wrangler secret(운영)에 넣어 주세요');
  const auth = `Basic ${btoa(`${secretKey}:`)}`;
  async function call(method, path, body, idem) {
    const headers = { authorization: auth, 'content-type': 'application/json' };
    if (idem) headers['idempotency-key'] = idem; // 같은 요청을 두 번 보내도 한 번만 처리된다
    const res = await f(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new TossError(res.status, data.code, data.message);
    return data;
  }
  return {
    // 결제 승인: 성공 페이지로 돌아온 paymentKey·orderId·amount 를 서버가 확정한다
    confirm: ({ paymentKey, orderId, amount }) => call('POST', '/v1/payments/confirm', { paymentKey, orderId, amount }, `confirm-${orderId}`),
    get: (paymentKey) => call('GET', `/v1/payments/${encodeURIComponent(paymentKey)}`),
    getByOrder: (orderId) => call('GET', `/v1/payments/orders/${encodeURIComponent(orderId)}`),
    cancel: (paymentKey, { reason, amount, idem }) => call('POST', `/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: reason, ...(amount ? { cancelAmount: amount } : {}) }, idem),
    // 정기결제: 카드 등록(authKey) → 빌링키 발급 → 빌링키로 청구
    issueBillingKey: ({ authKey, customerKey }) => call('POST', '/v1/billing/authorizations/issue', { authKey, customerKey }),
    chargeBilling: (billingKey, { customerKey, amount, orderId, orderName }) => call('POST', `/v1/billing/${encodeURIComponent(billingKey)}`, { customerKey, amount, orderId, orderName }, `bill-${orderId}`),
  };
}
