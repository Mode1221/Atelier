# 앱 안 결제 (스토어 인앱 결제 · RevenueCat)

디지털 상품·구독을 **앱 안에서** 팔면 애플·구글 스토어 결제를 써야 한다. 두 스토어를 각각 붙이는 대신 RevenueCat(일정 매출까지 무료 — 요금은 가입 전 공식 사이트에서 확인)으로 한 번에 붙인다.

## 사람 할 일 (순서대로, 한 번)
1. 스토어 개발자 계정(Apple 연 $99 · Google 1회 $25) + 유료 앱 계약·세금·정산 계좌(App Store Connect "계약/세금/금융", Play Console "결제 프로필")
2. 스토어에 상품 만들기 — 구독이면 구독 그룹·기간·가격 (상품 ID 는 Claude 가 정해 준 대로)
3. RevenueCat 가입 → 프로젝트·앱 2개(iOS·Android) 추가 → 스토어 연결(가이드 따라 키 업로드) → Entitlement `pro` 와 Offering 만들기
4. RevenueCat 의 공개 SDK 키 2개를 프로젝트 `.env` 에 `EXPO_PUBLIC_RC_IOS_KEY=…` / `EXPO_PUBLIC_RC_ANDROID_KEY=…` (채팅에 붙여 넣지 않기 — 공개 키지만 습관)

## Claude 가 하는 일
- `purchases.js` 를 `src/` 에 두고 `npx expo install react-native-purchases`, 개발 빌드(`eas build --profile development`)로 시험
- 결제 화면: 상품 목록(스토어 가격 그대로) · 구매 · **구매 복원** · 구독 관리 링크 · 자동 갱신·해지 안내 문구(스토어 심사 요구)
- 유료 기능은 `isPro()` 로만 연다
- 시험: iOS 샌드박스 테스터 / Play 라이선스 테스터로 구매·복원·해지(테스트는 실제 청구 없음)
- 약관: `../../../guard/templates/paid-terms-kr.md` (결제 수단 문장만 "앱스토어·구글 플레이"로)
