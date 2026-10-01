# 결제·구독

## 빠른 길: 국내 웹 결제는 템플릿으로 (토스페이먼츠)
`../templates/pay/` — 단건 결제·정기결제(구독)·웹훅·환불·자동 갱신(실패 시 유예 후 만료)·해지(기간 끝까지 사용)·매출 지표까지 들어 있고 테스트로 검증돼 있다(`tests/pay.test.mjs`).
1. `node <atelier>/skills/build/templates/pay/pay-first.mjs install` — `src/pay/`, `public/pay/checkout.html`, 결제 마이그레이션, `npm run pay:first` 를 넣는다.
2. 앱에 붙이기: `mountPay(app, { customerOf: (c) => <로그인 사용자 id> })`, 유료 기능은 `/api/pay/me`(또는 `createPay().access(customer)`)로만 판단. 매일 갱신: wrangler `[triggers] crons` + `scheduled` 에서 `renewAll(env)`.
3. 파는 것은 `src/pay/plans.js` 에서만 정한다(금액·기간). 약관 조항은 `../../guard/templates/paid-terms-kr.md` 를 같은 값으로 채운다.
4. 사람 몫: 토스페이먼츠 가입 → 테스트 키 2개를 `.dev.vars` 에 → `npm run pay:first` (테스트 결제는 실제 돈이 나가지 않음). 실제 판매는 사업자등록·통신판매업 신고·전자결제 신청(가맹 심사) 뒤 실서비스 키로 `npm run pay:first -- --deploy`, 웹훅 주소 등록.
5. 운영 지표: stats 응답의 `series` 에 `revenue: "매출(원)"`·`paid_orders: "결제 건수"` 를 `store.revenueByDay()` 로 넣으면 본부 운영 지표에 매출이 그려진다.
- 해외 판매·세금 대행이 필요하면 Lemon Squeezy·Paddle.
- **앱 안 디지털 상품·구독**은 스토어 결제가 의무 — `../templates/iap/`(RevenueCat, 구매·복원·유료 판단·구독 관리 링크, `README.md` 에 사람 할 일 순서).
- 로그인이 없는 웹은 `deviceCustomer`(기기 쿠키)가 기본 — 정기결제·비싼 상품이면 로그인(auth 템플릿)을 붙여 `customerOf` 를 로그인 id 로.

결제 정보(카드번호)는 **절대 직접 저장하지 않는다.** PG·스토어가 처리한다.

## 무엇으로 받나
| 상황 | 방식 |
|---|---|
| 앱 안 디지털 상품·구독 | 스토어 인앱 결제 (RevenueCat 로 iOS·Android 통합 추천). 국가별 대체 결제 규정 확인 |
| 웹 구독 (해외) | Stripe, Paddle·Lemon Squeezy (세금 대행형) |
| 웹 결제 (국내) | 토스페이먼츠, 포트원 등 PG |
| 실물·서비스 | PG (스토어 인앱 결제 대상 아님) |

## 구현 체크리스트
- [ ] 결제 성공 판단은 **서버**가 한다: 웹훅 또는 영수증 서버 검증. 클라이언트의 "성공" 신호를 믿지 않는다
- [ ] 웹훅 서명 검증, 같은 이벤트 중복 수신에 안전(멱등)
- [ ] 결제 상태를 DB 에 기록: 결제·환불·구독 시작·갱신·해지·만료·결제 실패
- [ ] 권한(유료 기능 사용 가능 여부)은 이 상태에서 계산
- [ ] 구독: 무료 체험, 갱신 실패 시 유예 기간, 해지 후 기간 끝까지 사용 가능
- [ ] 구매 복원 (앱)
- [ ] 환불 정책 = 약관 = 실제 처리 절차 (guard G4)
- [ ] 영수증 이메일
- [ ] 테스트 모드(샌드박스)로 성공·실패·환불·갱신·해지 전부 시험
- [ ] 가격 표시: 부가세 포함 여부, 통화, 자동 갱신 고지
- [ ] 관리자 도구에서 결제 조회·환불 가능 (B7)

## 관련 사람 할 일
- 사업자등록, 통신판매업 신고, PG 가맹 심사, 스토어 유료 앱 계약·세금·정산 계좌 (guard G7)
