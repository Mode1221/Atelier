// 챗봇 서버 (카카오톡 채널 · 디스코드 · 텔레그램) — Cloudflare Workers 하나에 웹훅 주소를 붙인다.
// 봇이 하는 일은 reply(text, ctx) 한 함수에만 쓴다 → 세 플랫폼이 같은 답을 한다. AI 답이 필요하면 ../ai/ai.js 를 reply 안에서 부른다.
//   mountBots(app, { reply: async (text, { platform, user }) => '…' })
// 원칙: 플랫폼이 보낸 요청인지 먼저 확인(서명·비밀 값), 답은 빨리(카카오 5초·디스코드 3초 안에), 사용자 id 는 해시로만 기록.

// ---- 디스코드: Ed25519 서명 확인 (개발자 포털의 PUBLIC KEY)
const hex = (s) => new Uint8Array(String(s).match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
export async function discordVerify(request, publicKeyHex) {
  const sig = request.headers.get('x-signature-ed25519'), ts = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  if (!sig || !ts || !publicKeyHex) return { ok: false, body };
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, hex(sig), new TextEncoder().encode(ts + body));
    return { ok, body };
  } catch { return { ok: false, body }; }
}
export async function discordHandle(request, env, reply) {
  const v = await discordVerify(request, env.DISCORD_PUBLIC_KEY);
  if (!v.ok) return new Response('bad signature', { status: 401 });
  const i = JSON.parse(v.body);
  if (i.type === 1) return Response.json({ type: 1 }); // 디스코드가 주소를 확인하는 PING
  if (i.type === 2) {
    const text = i.data?.options?.find((o) => o.name === 'text')?.value ?? i.data?.name ?? '';
    const content = await reply(String(text), { platform: 'discord', user: i.member?.user?.id ?? i.user?.id });
    return Response.json({ type: 4, data: { content: String(content).slice(0, 2000) } });
  }
  return Response.json({ type: 4, data: { content: '지원하지 않는 요청이에요.' } });
}

// ---- 텔레그램: setWebhook 때 정한 secret_token 이 헤더로 온다
export async function telegramHandle(request, env, reply, f = fetch) {
  if (!env.TELEGRAM_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) return new Response('forbidden', { status: 403 });
  const u = await request.json();
  const m = u.message ?? u.edited_message;
  if (!m?.text) return new Response('ok');
  const text = await reply(m.text, { platform: 'telegram', user: m.from?.id });
  await f(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: m.chat.id, text: String(text).slice(0, 4096) }) });
  return new Response('ok');
}

// ---- 카카오톡 채널 챗봇 (카카오 i 오픈빌더 "스킬"): 주소 끝의 비밀 값으로 확인, 응답 형식 2.0
export function kakaoResponse(text, quickReplies = []) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text: String(text).slice(0, 1000) } }],
      ...(quickReplies.length ? { quickReplies: quickReplies.slice(0, 10).map((q) => ({ label: q.slice(0, 14), action: 'message', messageText: q })) } : {}),
    },
  };
}
export async function kakaoHandle(request, env, reply, secret) {
  if (!env.KAKAO_SKILL_SECRET || secret !== env.KAKAO_SKILL_SECRET) return new Response('forbidden', { status: 403 });
  const body = await request.json();
  const text = body.userRequest?.utterance ?? '';
  // 카카오는 5초 안에 답이 없으면 실패로 본다 — 오래 걸리는 일은 4.5초에서 끊고 안내
  const answer = await Promise.race([reply(text, { platform: 'kakao', user: body.userRequest?.user?.id }), new Promise((r) => setTimeout(() => r('조금 오래 걸려요. 잠시 뒤 다시 물어봐 주세요.'), 4500))]);
  const quick = typeof answer === 'object' ? answer.quick : [];
  return Response.json(kakaoResponse(typeof answer === 'object' ? answer.text : answer, quick));
}

export function mountBots(app, { reply }) {
  app.post('/bot/discord', (c) => discordHandle(c.req.raw, c.env, reply));
  app.post('/bot/telegram', (c) => telegramHandle(c.req.raw, c.env, reply));
  app.post('/bot/kakao/:secret', (c) => kakaoHandle(c.req.raw, c.env, reply, c.req.param('secret')));
}
