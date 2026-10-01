// 장소·주소 (서버) — 카카오 로컬 API 어댑터. 화면 코드는 이 파일만 부른다(업체를 바꿔도 화면은 그대로).
//   const g = createGeo({ env });
//   await g.search('성수 카페', { lat, lng, radius: 2000 }) → { ok, items: [{ id, name, address, lat, lng, phone, category, url }] }
//   await g.geocode('서울 성동구 왕십리로 83') → { ok, lat, lng, address }
//   distanceM(a, b) → 미터
// 키: KAKAO_REST_KEY (developers.kakao.com → 앱 → REST API 키, 무료 하루 10만 건 안팎 — 콘솔에서 확인). 없으면 { ok:false, reason:'no_key' } — 화면은 지도만 보여 주고 검색칸을 숨긴다.
// 원칙: 결과는 캐시(같은 검색 10분), 사용자 위치는 저장하지 않는다(guard 위치정보 — rules-kr loc).
const BASE = 'https://dapi.kakao.com/v2/local';
const TTL = 10 * 60_000;

export function distanceM(a, b) {
  const R = 6_371_000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const place = (d) => ({ id: d.id, name: d.place_name, address: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x), phone: d.phone || '', category: (d.category_name || '').split(' > ').pop(), url: d.place_url, distance: d.distance ? Number(d.distance) : undefined });

export function createGeo({ env, fetch: f = fetch, cache = new Map(), now = () => Date.now(), log = () => {} }) {
  const key = env.KAKAO_REST_KEY;
  async function get(path, params) {
    if (!key) return { ok: false, reason: 'no_key' };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    const url = `${BASE}${path}?${qs}`;
    const hit = cache.get(url);
    if (hit && now() - hit.at < TTL) return hit.value;
    let r;
    try { r = await f(url, { headers: { authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000) }); } catch { log({ event: 'geo_failed', reason: 'network' }); return { ok: false, reason: 'network' }; }
    if (r.status === 401 || r.status === 403) { log({ event: 'geo_failed', reason: 'key' }); return { ok: false, reason: 'key' }; }
    if (r.status === 429) return { ok: false, reason: 'quota' };
    if (!r.ok) return { ok: false, reason: `http_${r.status}` };
    const value = { ok: true, data: await r.json() };
    cache.set(url, { at: now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  }
  return {
    async search(query, { lat, lng, radius, page = 1, size = 15 } = {}) {
      const q = String(query ?? '').trim().slice(0, 100);
      if (!q) return { ok: true, items: [] };
      const near = Number.isFinite(lat) && Number.isFinite(lng);
      const r = await get('/search/keyword.json', { query: q, page, size, ...(near ? { y: lat, x: lng, radius: Math.min(20000, radius ?? 5000), sort: 'distance' } : {}) });
      return r.ok ? { ok: true, items: (r.data.documents ?? []).map(place), end: r.data.meta?.is_end ?? true } : r;
    },
    async geocode(address) {
      const r = await get('/search/address.json', { query: String(address ?? '').slice(0, 100) });
      if (!r.ok) return r;
      const d = r.data.documents?.[0];
      return d ? { ok: true, lat: Number(d.y), lng: Number(d.x), address: d.road_address?.address_name || d.address_name } : { ok: false, reason: 'not_found' };
    },
  };
}

// 라우트 — 화면은 /api/geo/search?q=&lat=&lng= 만 부른다 (키는 서버에만)
export function mountGeo(app) {
  app.get('/api/geo/search', async (c) => {
    const num = (k) => (c.req.query(k) ? Number(c.req.query(k)) : undefined);
    const r = await createGeo({ env: c.env }).search(c.req.query('q'), { lat: num('lat'), lng: num('lng') });
    return c.json(r, r.ok || r.reason === 'no_key' ? 200 : 502);
  });
  app.get('/api/geo/config', (c) => c.json({ kakaoJsKey: c.env.KAKAO_JS_KEY || '' })); // JS 키는 공개용(도메인 제한) — 카카오 콘솔에 사이트 도메인 등록
}
