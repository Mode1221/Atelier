// 앱 푸시 받기 (Expo 앱 쪽) — npx expo install expo-notifications expo-device expo-constants
//   import { registerForPush } from './push-client';
//   // "가치를 보여 준 뒤" 부른다(예: 첫 예약을 마친 직후) — 앱 켜자마자 묻지 않는다
//   const r = await registerForPush({ api: 'https://<서비스 주소>' }); // { ok } | { ok:false, reason }
// 실제 기기에서만 된다(시뮬레이터 X). EAS 프로젝트 id 가 app.json extra.eas.projectId 에 있어야 한다(eas init 이 넣음).
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function registerForPush({ api, headers = {} }) {
  if (!Device.isDevice) return { ok: false, reason: '실제 휴대폰에서만 알림을 받을 수 있어요' };
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: '기본 알림', importance: Notifications.AndroidImportance.DEFAULT });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return { ok: false, reason: '알림이 꺼져 있어요 — 휴대폰 설정에서 켤 수 있어요' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'EAS 프로젝트 id 가 없어요 (npx eas init)' };
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const r = await fetch(`${api}/api/push/register`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ token, platform: Platform.OS }) });
  return r.ok ? { ok: true, token } : { ok: false, reason: '서버에 등록하지 못했어요' };
}
