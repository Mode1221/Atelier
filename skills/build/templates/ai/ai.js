// AI 기능 붙이기 (Claude API) — 키는 서버에만, 사용자별 하루 한도, 하루 전체 비용 상한, 쉬운 오류 문구, AI 결과 표시.
//   npm i @anthropic-ai/sdk     /  .dev.vars 와 wrangler secret 에 ANTHROPIC_API_KEY (채팅에 붙여 넣지 않기)
//   (선택) ANTHROPIC_BASE_URL — Cloudflare AI Gateway 같은 중계 주소(호출 기록·캐시)를 쓸 때
//   const ai = createAi({ db: env.DB, env });   const r = await ai.ask({ customer, prompt });
// 대화 내용은 저장하지 않고 토큰 수만 센다(개인정보·비용 기록 겸용). 처리방침에 "AI 처리·국외 이전(Anthropic)"을 넣는다(guard).

// 1M 토큰당 달러 (2026-09 기준 공개 가격 — 바뀌면 고친다). 모르는 모델은 가장 비싼 값으로 계산(상한을 넘지 않게).
export const PRICES = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5': [1, 5] };
export const DEFAULTS = {
  model: 'claude-opus-5-5',
  effort: 'low',            // 짧은 답·분류·요약은 low 로 충분한 경우가 많다. 품질이 모자라면 medium.
  maxTokens: 2000,          // 한 번 답의 최대 길이(비용 상한에도 쓰임)
  perUserPerDay: 20,        // 사용자 1명이 하루에 쓸 수 있는 횟수
  dailyBudgetUsd: 2,        // 하루 전체 비용 상한(달러). 넘으면 그날은 "오늘 AI 사용량이 끝났어요"
  timeoutMs: 60_000,
};
export const AI_NOTICE = 'AI 가 만든 결과예요. 틀릴 수 있으니 중요한 내용은 확인해 주세요.';

const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
export const costMicro = (model, usage) => {
  const [i, o] = PRICES[model] ?? [20, 100];
  return Math.ceil((usage.input_tokens ?? 0) * i + (usage.output_tokens ?? 0) * o); // 1M 토큰당 달러 × 토큰 = 마이크로달러
};

// 대표가 이해할 수 있는 문장으로 (서비스 화면에 그대로 보여 준다)
export function friendlyError(e) {
  const s = e?.status;
  if (s === 401 || s === 403) return { status: 503, message: 'AI 설정에 문제가 있어요. 운영자가 확인 중이에요.', log: 'ai_key_invalid' };
  if (s === 429) return { status: 503, message: 'AI 가 잠시 바빠요. 1분 뒤 다시 시도해 주세요.', log: 'ai_rate_limited' };
  if (s === 400) return { status: 400, message: '요청을 처리할 수 없어요. 내용을 줄이거나 바꿔 주세요.', log: 'ai_bad_request' };
  if (s >= 500 || e?.name === 'APIConnectionError' || e?.name === 'APIConnectionTimeoutError') return { status: 503, message: 'AI 연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.', log: 'ai_unavailable' };
  return { status: 500, message: '알 수 없는 문제로 답을 만들지 못했어요.', log: 'ai_error' };
}

export function createAi({ db, env, client, options = {}, now = () => new Date(), log = () => {} }) {
  const o = { ...DEFAULTS, ...options };
  const model = env.AI_MODEL || o.model;
  // SDK 는 처음 쓸 때 불러온다 (테스트는 가짜 client 를 넘긴다)
  let anthropic = client;
  const sdk = async () => (anthropic ??= new (await import('@anthropic-ai/sdk')).default({ apiKey: env.ANTHROPIC_API_KEY, timeout: o.timeoutMs, maxRetries: 2, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) }));
  const get = (day, who) => db.prepare('SELECT * FROM ai_usage WHERE day = ? AND customer = ?').bind(day, who).first();
  const add = (day, who, u, cost) => db.prepare(`INSERT INTO ai_usage (day, customer, calls, input_tokens, output_tokens, cost_micro_usd) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(day, customer) DO UPDATE SET calls = calls + 1, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, cost_micro_usd = cost_micro_usd + excluded.cost_micro_usd`)
    .bind(day, who, u.input_tokens ?? 0, u.output_tokens ?? 0, cost).run();

  return {
    // 남은 횟수 (화면에 "오늘 17번 남았어요")
    async remaining(customer) {
      const day = kstDay(now());
      const [me, all] = await Promise.all([get(day, customer), get(day, '*')]);
      if ((all?.cost_micro_usd ?? 0) >= o.dailyBudgetUsd * 1e6) return 0;
      return Math.max(0, o.perUserPerDay - (me?.calls ?? 0));
    },
    async ask({ customer, prompt, system, maxTokens }) {
      if (!env.ANTHROPIC_API_KEY && !client) return { ok: false, status: 503, message: 'AI 기능이 아직 설정되지 않았어요 (운영자: ANTHROPIC_API_KEY).' };
      const text = String(prompt ?? '').trim();
      if (!text) return { ok: false, status: 400, message: '내용을 입력해 주세요.' };
      if (text.length > 8000) return { ok: false, status: 400, message: '내용이 너무 길어요. 8,000자 이하로 줄여 주세요.' };
      const day = kstDay(now());
      const [me, all] = await Promise.all([get(day, customer), get(day, '*')]);
      if ((me?.calls ?? 0) >= o.perUserPerDay) return { ok: false, status: 429, message: `오늘 쓸 수 있는 ${o.perUserPerDay}번을 다 썼어요. 내일 다시 쓸 수 있어요.` };
      if ((all?.cost_micro_usd ?? 0) >= o.dailyBudgetUsd * 1e6) { log({ event: 'ai_budget_reached', day }); return { ok: false, status: 503, message: '오늘 AI 사용량이 모두 끝났어요. 내일 다시 쓸 수 있어요.' }; }
      try {
        const res = await (await sdk()).beta.messages.create({
          model,
          max_tokens: Math.min(maxTokens ?? o.maxTokens, o.maxTokens),
          ...(system ? { system } : {}),
          output_config: { effort: o.effort },
          // 안전 분류기가 거절하면 서버가 알맞은 모델로 다시 시도 (Claude API 전용)
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages: [{ role: 'user', content: text }],
        });
        const usage = res.usage ?? {};
        const cost = costMicro(res.model ?? model, usage);
        await add(day, customer, usage, cost);
        await add(day, '*', usage, cost);
        log({ event: 'ai_answer', tokens_in: usage.input_tokens, tokens_out: usage.output_tokens, cost_micro_usd: cost, stop: res.stop_reason });
        if (res.stop_reason === 'refusal') return { ok: false, status: 422, message: '이 요청에는 답할 수 없어요. 다른 내용으로 시도해 주세요.' };
        const answer = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
        return { ok: true, answer, truncated: res.stop_reason === 'max_tokens', notice: AI_NOTICE };
      } catch (e) {
        const f = friendlyError(e);
        log({ event: f.log, status: e?.status });
        return { ok: false, status: f.status, message: f.message };
      }
    },
    // 운영 지표: 날짜별 호출·비용 (본부 stats series: ai_calls, ai_cost_usd)
    usageByDay: (fromDay) => db.prepare("SELECT day AS date, calls AS ai_calls, ROUND(cost_micro_usd / 1e6, 4) AS ai_cost_usd FROM ai_usage WHERE customer = '*' AND day >= ? ORDER BY day").bind(fromDay).all().then((r) => r.results),
  };
}
