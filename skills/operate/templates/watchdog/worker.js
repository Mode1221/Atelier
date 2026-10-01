// Atelier operate — 서비스 지킴이 (Cloudflare Worker, 무료). 5분마다 서비스 주소를 확인해서
// 연속 2번 실패하면 휴대폰으로 알림(ntfy), 다시 살아나면 "복구" 알림. 내 컴퓨터가 꺼져 있어도 돈다.
// 설정(wrangler.toml, setup.mjs 가 만든다): vars HEALTH_URL · SERVICE_NAME, 비밀값 NTFY_TOPIC, KV STATE(상태 기억)
const FAILS_TO_ALERT = 2;

export async function probe(url, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': 'atelier-watchdog' }, signal: AbortSignal.timeout(10_000) });
    return { ok: r.ok, detail: `응답 코드 ${r.status}` };
  } catch (e) {
    return { ok: false, detail: e.name === 'TimeoutError' ? '10초 안에 응답 없음' : `연결 실패 (${e.message})` };
  }
}

export async function notify(env, { title, message, priority = 'high', tags = 'warning' }, fetchImpl = fetch) {
  if (!env.NTFY_TOPIC) return false;
  const r = await fetchImpl(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: 'POST', body: message,
    headers: { Title: encodeURIComponent(title), Priority: priority, Tags: tags, 'Content-Type': 'text/plain; charset=utf-8' },
  });
  return r.ok;
}

// 한 번 확인. 상태가 바뀔 때만 KV 에 쓴다 (무료 쓰기 한도 절약)
export async function check(env, fetchImpl = fetch) {
  const name = env.SERVICE_NAME || '서비스';
  const state = JSON.parse((await env.STATE.get('state')) ?? '{"down":false,"fails":0}');
  const { ok, detail } = await probe(env.HEALTH_URL, fetchImpl);
  if (ok) {
    if (state.down) await notify(env, { title: `✅ ${name} 복구`, message: `${name}가 다시 응답해요. (${env.HEALTH_URL})`, priority: 'default', tags: 'white_check_mark' }, fetchImpl);
    if (state.down || state.fails) await env.STATE.put('state', JSON.stringify({ down: false, fails: 0 }));
    return { ok, alerted: state.down ? 'recovered' : null };
  }
  const fails = state.fails + 1;
  let alerted = null;
  if (!state.down && fails >= FAILS_TO_ALERT) {
    await notify(env, { title: `🔴 ${name} 응답 없음`, message: `${name}가 ${FAILS_TO_ALERT * 5}분째 응답하지 않아요: ${detail}\n${env.HEALTH_URL}\n프로젝트에서 npm run incident (또는 Claude Code 에 "서비스가 죽었어").` }, fetchImpl);
    alerted = 'down';
  }
  await env.STATE.put('state', JSON.stringify({ down: state.down || fails >= FAILS_TO_ALERT, fails }));
  return { ok, alerted };
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(check(env)); },
  // 주소로 열면 지금 상태만 보여 준다 (알림 주제는 숨김)
  async fetch(_req, env) {
    const s = JSON.parse((await env.STATE.get('state')) ?? '{"down":false,"fails":0}');
    return Response.json({ watching: env.HEALTH_URL, down: s.down, fails: s.fails });
  },
};
