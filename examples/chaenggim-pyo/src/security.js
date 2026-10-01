import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const newId = () => randomBytes(12).toString('base64url'); // 16자
export const newAdminKey = () => randomBytes(18).toString('base64url'); // 144비트
export const hashKey = (key) => createHash('sha256').update(key).digest('hex');

export function keyMatches(key, hash) {
  if (typeof key !== 'string' || !key) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// 고정 창 속도 제한 (메모리). 서버 1대 전제 — ADR-001.
export function rateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return function hit(key) {
    const t = now();
    const cur = hits.get(key);
    if (!cur || t - cur.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return true;
    }
    cur.count += 1;
    return cur.count <= limit;
  };
}

// 공개 통계 주소의 비밀 경로 — STATS_TOKEN 에서 만든다(새 비밀값 없이). 토큰을 모르면 추측할 수 없다.
export const publicStatsKey = (token) => createHmac('sha256', String(token)).update('public-stats').digest('hex').slice(0, 32);
// 하루 방문자 id: 날짜가 섞여 있어 다른 날과 이어지지 않는다
export const visitorId = (ip, ua, date) => createHash('sha256').update(`v:${date}:${ip}:${ua}`).digest('hex').slice(0, 16);
export const hashIp = (ip) => createHash('sha256').update(`ip:${ip}`).digest('hex').slice(0, 12);

export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y) && a === b;
}
