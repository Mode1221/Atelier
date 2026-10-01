// 파는 것 — 금액은 여기서만 정한다(브라우저가 보낸 금액은 무시). 바꾸면 약관·가격 표시도 같이 고친다.
// kind: once(한 번 결제) | subscription(정기결제, period_days 마다 자동 청구)
export const PRODUCTS = {
  pro_month: { name: '프로 1개월', amount: 4900, kind: 'subscription', period_days: 30 },
  credits_100: { name: '이용권 100회', amount: 9900, kind: 'once' },
};
// 자동 갱신 실패 시 다시 시도하는 기간(일). 이 기간 동안은 계속 쓸 수 있고, 지나면 만료.
export const GRACE_DAYS = 3;
