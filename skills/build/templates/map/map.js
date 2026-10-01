// 지도 (브라우저) — 카카오 지도(JS 키 있으면) 또는 OpenStreetMap(키 없이). 화면 코드는 이 파일의 함수만 쓴다.
//   import { createMap } from '/map.js';
//   const map = await createMap(document.querySelector('#map'), { center: { lat: 37.5665, lng: 126.978 }, level: 5 });
//   map.addMarker({ lat, lng, label: '가게', onClick }); map.fit(); map.clear(); map.onMove(({ lat, lng }) => …)
//   const me = await myLocation(); // 사용자가 허락할 때만 (한 번 조회, 저장하지 않음)
// 카카오: /api/geo/config 의 kakaoJsKey + 카카오 콘솔 "플랫폼 → Web" 에 사이트 도메인 등록. OSM: 출처 표시 필수(자동), 대량 사용 금지 정책.
const loadScript = (src) => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
const loadCss = (href) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); };

async function kakaoMap(el, key, { center, level }) {
  await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`);
  await new Promise((ok) => window.kakao.maps.load(ok));
  const K = window.kakao.maps;
  const map = new K.Map(el, { center: new K.LatLng(center.lat, center.lng), level });
  const markers = [];
  return {
    provider: 'kakao',
    addMarker({ lat, lng, label, onClick }) {
      const m = new K.Marker({ position: new K.LatLng(lat, lng), title: label, map });
      if (onClick) K.event.addListener(m, 'click', onClick);
      markers.push(m); return m;
    },
    clear() { markers.splice(0).forEach((m) => m.setMap(null)); },
    fit() { if (!markers.length) return; const b = new K.LatLngBounds(); markers.forEach((m) => b.extend(m.getPosition())); map.setBounds(b); },
    setCenter({ lat, lng }) { map.setCenter(new K.LatLng(lat, lng)); },
    onMove(fn) { K.event.addListener(map, 'idle', () => { const c = map.getCenter(); fn({ lat: c.getLat(), lng: c.getLng() }); }); },
  };
}
async function osmMap(el, { center, level }) {
  loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  const L = window.L;
  const map = L.map(el).setView([center.lat, center.lng], Math.max(3, 19 - level));
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const layer = L.featureGroup().addTo(map);
  return {
    provider: 'osm',
    addMarker({ lat, lng, label, onClick }) { const m = L.marker([lat, lng], { title: label, alt: label }).addTo(layer); if (onClick) m.on('click', onClick); return m; },
    clear() { layer.clearLayers(); },
    fit() { if (layer.getLayers().length) map.fitBounds(layer.getBounds(), { padding: [24, 24] }); },
    setCenter({ lat, lng }) { map.setView([lat, lng]); },
    onMove(fn) { map.on('moveend', () => { const c = map.getCenter(); fn({ lat: c.lat, lng: c.lng }); }); },
  };
}
export async function createMap(el, { center = { lat: 37.5665, lng: 126.978 }, level = 5, kakaoJsKey } = {}) {
  let key = kakaoJsKey;
  if (key === undefined) { try { key = (await (await fetch('/api/geo/config')).json()).kakaoJsKey; } catch { key = ''; } }
  if (key) { try { return await kakaoMap(el, key, { center, level }); } catch { /* 키·도메인 문제면 OSM 으로 */ } }
  return osmMap(el, { center, level });
}
export function myLocation({ timeout = 8000 } = {}) {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { timeout, maximumAge: 60_000 });
  });
}
