// 앱 안 결제 (iOS·Android 스토어) — RevenueCat 으로 두 스토어를 한 코드로. Expo 앱에 src/purchases.js 로 복사.
//   npx expo install react-native-purchases   (Expo Go 에서는 안 되고 개발 빌드·EAS 빌드에서 동작)
//   import Purchases from 'react-native-purchases'; import { Platform } from 'react-native';
//   const store = createStore({ Purchases, platform: Platform.OS });
// 원칙: "유료인가?"는 스토어 영수증을 검증한 RevenueCat 의 entitlement 로만 판단한다(앱이 기억한 값 X).
// 디지털 상품을 앱 안에서 팔 때는 스토어 결제가 의무다(웹 결제 링크 안내는 스토어 규정 확인).
export const ENTITLEMENT = 'pro'; // RevenueCat 대시보드의 Entitlement 이름과 같게

export function createStore({ Purchases, platform, keys = { ios: process.env.EXPO_PUBLIC_RC_IOS_KEY, android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY }, entitlement = ENTITLEMENT }) {
  let ready = false;
  const isActive = (info) => Boolean(info?.entitlements?.active?.[entitlement]);
  return {
    // 앱 시작 시 한 번. appUserId 를 주면(로그인 사용자) 기기를 바꿔도 구매가 따라간다
    async init(appUserId) {
      const apiKey = platform === 'ios' ? keys.ios : keys.android;
      if (!apiKey) throw new Error(`RevenueCat 키가 없어요 (EXPO_PUBLIC_RC_${platform === 'ios' ? 'IOS' : 'ANDROID'}_KEY)`);
      Purchases.configure({ apiKey, ...(appUserId ? { appUserID: appUserId } : {}) });
      ready = true;
    },
    // 팔 상품 목록(스토어에 등록한 가격·현지 통화 그대로 표시)
    async products() {
      if (!ready) throw new Error('init() 먼저');
      const o = await Purchases.getOfferings();
      return (o.current?.availablePackages ?? []).map((p) => ({ id: p.identifier, title: p.product.title, price: p.product.priceString, pkg: p }));
    },
    async buy(item) {
      try {
        const { customerInfo } = await Purchases.purchasePackage(item.pkg);
        return { ok: isActive(customerInfo) };
      } catch (e) {
        if (e.userCancelled) return { ok: false, cancelled: true }; // 사용자가 닫음 — 오류 아님
        return { ok: false, reason: e.message };
      }
    },
    // "구매 복원" 버튼 — 스토어 심사 필수(기기 변경·재설치)
    async restore() { return { ok: isActive(await Purchases.restorePurchases()) }; },
    async isPro() { return isActive(await Purchases.getCustomerInfo()); },
    // 해지는 앱이 아니라 스토어 구독 관리에서 — 이 주소로 보내 준다
    manageUrl: () => (platform === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions'),
  };
}
