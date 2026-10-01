// 앱 푸시 토큰 받기·보내기 (서버) — 앱의 push-client.js 가 /api/push/register 로 토큰을 보낸다.
//   mountPushTokens(app, { customerOf });                 // 로그인 id 또는 기기 id
//   await sendPush(env, { customers: ['u1'], title, body }) // 그 사람들의 모든 기기로, 무효 토큰은 지움
import { createNotify } from './notify.js';
const TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;
export function mountPushTokens(app, { customerOf }) {
  app.post('/api/push/register', async (c) => {
    const { token, platform } = await c.req.json().catch(() => ({}));
    if (!TOKEN_RE.test(String(token ?? ''))) return c.json({ error: '토큰 형식이 이상해요' }, 400);
    await c.env.DB.prepare(`INSERT INTO push_tokens (token, customer, platform, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(token) DO UPDATE SET customer = excluded.customer, platform = excluded.platform, updated_at = excluded.updated_at`).bind(token, customerOf(c), String(platform ?? '').slice(0, 10)).run();
    return c.json({ ok: true });
  });
  app.post('/api/push/unregister', async (c) => {
    const { token } = await c.req.json().catch(() => ({}));
    await c.env.DB.prepare('DELETE FROM push_tokens WHERE token = ? AND customer = ?').bind(String(token ?? ''), customerOf(c)).run();
    return c.json({ ok: true });
  });
}
export async function sendPush(env, { customers, title, body, data }, { fetch: f = fetch, log } = {}) {
  const list = [].concat(customers);
  if (!list.length) return { ok: 0, invalid: 0 };
  const { results } = await env.DB.prepare(`SELECT token FROM push_tokens WHERE customer IN (${list.map(() => '?').join(',')})`).bind(...list).all();
  const r = await createNotify({ env, fetch: f, log }).push({ tokens: results.map((x) => x.token), title, body, data });
  for (const t of r.invalid ?? []) await env.DB.prepare('DELETE FROM push_tokens WHERE token = ?').bind(t).run();
  return { ok: r.ok, invalid: (r.invalid ?? []).length };
}
