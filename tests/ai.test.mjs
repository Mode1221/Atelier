// AI 기능 템플릿(templates/ai) — 가짜 Claude 로 한도·비용 상한·오류 문구·거절·AI 표시를 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './helpers/d1.mjs';
import { createAi, costMicro, friendlyError, AI_NOTICE } from '../skills/build/templates/ai/ai.js';

const SQL = readFileSync(new URL('../skills/build/templates/ai/ai.sql', import.meta.url), 'utf8');
const fakeClaude = (reply = {}) => {
  const calls = [];
  return { calls, beta: { messages: { create: async (req) => { calls.push(req); if (reply.throw) throw reply.throw; return { model: req.model, stop_reason: 'end_turn', content: [{ type: 'text', text: '요약입니다' }], usage: { input_tokens: 1000, output_tokens: 500 }, ...reply }; } } } };
};

test('ai: 답·AI 표시·요청 모양(효과 수준·거절 대체·길이 상한), 토큰만 기록', async () => {
  const db = fakeD1(SQL), c = fakeClaude();
  const ai = createAi({ db, env: { ANTHROPIC_API_KEY: 'k' }, client: c });
  const r = await ai.ask({ customer: 'u1', prompt: '이 글 요약해 줘', maxTokens: 99999 });
  assert.deepEqual([r.ok, r.answer, r.notice], [true, '요약입니다', AI_NOTICE]);
  const req = c.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.max_tokens, 2000);
  assert.deepEqual(req.output_config, { effort: 'low' });
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  const row = db.raw.prepare("SELECT * FROM ai_usage WHERE customer = '*'").get();
  assert.equal(row.calls, 1);
  assert.equal(row.cost_micro_usd, costMicro('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 }));
  assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM ai_usage').all()).includes('요약'), false, '내용은 저장하지 않는다');
});

test('ai: 사용자 하루 한도, 하루 전체 비용 상한, 빈 입력·긴 입력, 키 없음', async () => {
  const db = fakeD1(SQL), c = fakeClaude();
  const ai = createAi({ db, env: { ANTHROPIC_API_KEY: 'k' }, client: c, options: { perUserPerDay: 2, dailyBudgetUsd: 0.05 } });
  assert.equal((await ai.ask({ customer: 'u1', prompt: ' ' })).status, 400);
  assert.equal((await ai.ask({ customer: 'u1', prompt: 'x'.repeat(8001) })).status, 400);
  await ai.ask({ customer: 'u1', prompt: 'a' }); await ai.ask({ customer: 'u1', prompt: 'b' });
  const r = await ai.ask({ customer: 'u1', prompt: 'c' });
  assert.equal(r.status, 429); assert.match(r.message, /내일/);
  assert.equal(await ai.remaining('u1'), 0);
  // 1회 = 1000×4 + 500×20 = 14,000 마이크로달러, 상한 50,000 → 4번째 전체 호출부터 막힘
  await ai.ask({ customer: 'u2', prompt: 'd' }); await ai.ask({ customer: 'u3', prompt: 'e' });
  const b = await ai.ask({ customer: 'u4', prompt: 'f' });
  assert.equal(b.status, 503); assert.match(b.message, /사용량이 모두 끝/);
  assert.equal(c.calls.length, 4);
  assert.equal((await createAi({ db, env: {} }).ask({ customer: 'u', prompt: 'x' })).status, 503);
});

test('ai: 거절·잘림·API 오류를 쉬운 말로', async () => {
  const db = fakeD1(SQL);
  const refused = await createAi({ db, env: { ANTHROPIC_API_KEY: 'k' }, client: fakeClaude({ stop_reason: 'refusal', content: [] }) }).ask({ customer: 'u', prompt: 'x' });
  assert.deepEqual([refused.ok, refused.status], [false, 422]);
  assert.equal((await createAi({ db, env: { ANTHROPIC_API_KEY: 'k' }, client: fakeClaude({ stop_reason: 'max_tokens' }) }).ask({ customer: 'v', prompt: 'x' })).truncated, true);
  const rate = await createAi({ db, env: { ANTHROPIC_API_KEY: 'k' }, client: fakeClaude({ throw: Object.assign(new Error('rl'), { status: 429 }) }) }).ask({ customer: 'w', prompt: 'x' });
  assert.match(rate.message, /바빠요/);
  assert.equal(friendlyError({ status: 401 }).log, 'ai_key_invalid');
  assert.equal(friendlyError({ name: 'APIConnectionTimeoutError' }).status, 503);
});
