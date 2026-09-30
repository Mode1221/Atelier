// Atelier build — 로그인이 필요한 웹 (Cloudflare Workers + Supabase Auth, 무료).
// 로그인·가입·비밀번호 재설정·메일 발송은 Supabase 가 한다 (직접 만들지 않는다 — build B3).
// 서버(Worker)는 요청마다 로그인 토큰을 **Supabase 공개키(JWKS)로 검증**만 한다. 의존성 없음 (WebCrypto).
//
// 환경: SUPABASE_URL (vars, 예 https://abcd.supabase.co) · SUPABASE_SERVICE_ROLE_KEY (비밀값 — 탈퇴 처리에만)
// 사용 (Hono 예):
//   import { requireUser, deleteUser } from './auth/supabase-auth.js';
//   app.get('/api/me', async (c) => { const u = await requireUser(c.req.raw, c.env); return u.error ? c.json(u, 401) : c.json({ id: u.id }); });
//   app.post('/api/account/delete', async (c) => { const u = await requireUser(c.req.raw, c.env); if (u.error) return c.json(u, 401);
//     /* 내 DB 의 이 사용자 데이터 먼저 삭제 */ await deleteUser(u.id, c.env); return c.body(null, 204); });

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const ALGS = { ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }, RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } };

// 공개키는 자주 안 바뀐다 — 인스턴스 안에서 10분 캐시
const cache = new Map();
async function jwks(url, fetchImpl, now) {
  const hit = cache.get(url);
  if (hit && hit.until > now) return hit.keys;
  const r = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
  if (!r.ok) throw new Error(`JWKS ${r.status}`);
  const { keys = [] } = await r.json();
  cache.set(url, { keys, until: now + 600_000 });
  return keys;
}

// 토큰 검증 → { id, email, role } 또는 { error }
export async function verifyToken(token, { url, fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const [h, p, sig] = String(token ?? '').split('.');
    if (!sig) return { error: 'no_token' };
    const header = JSON.parse(new TextDecoder().decode(b64url(h)));
    const alg = ALGS[header.alg];
    if (!alg) return { error: 'bad_alg' }; // HS256(공유 비밀) 토큰은 받지 않는다 — 새 Supabase 프로젝트는 비대칭 키
    const jwk = (await jwks(url, fetchImpl, now)).find((k) => k.kid === header.kid);
    if (!jwk) return { error: 'unknown_key' };
    const key = await crypto.subtle.importKey('jwk', jwk, alg, false, ['verify']);
    const ok = await crypto.subtle.verify(alg, key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return { error: 'bad_signature' };
    const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
    if (claims.iss !== `${url.replace(/\/$/, '')}/auth/v1`) return { error: 'bad_issuer' };
    if (!claims.exp || claims.exp * 1000 <= now) return { error: 'expired' };
    if (claims.role !== 'authenticated') return { error: 'not_signed_in' };
    return { id: claims.sub, email: claims.email ?? null, role: claims.role };
  } catch {
    return { error: 'bad_token' };
  }
}

// Authorization: Bearer <토큰> 을 읽어 검증
export function requireUser(request, env, opts = {}) {
  const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  return verifyToken(m?.[1], { url: env.SUPABASE_URL, ...opts });
}

// 탈퇴: Supabase 계정 삭제 (내 DB 의 데이터는 호출 전에 지운다)
export async function deleteUser(id, env, fetchImpl = fetch) {
  const r = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`계정 삭제 실패: ${r.status}`);
}

export const _clearCache = () => cache.clear();
