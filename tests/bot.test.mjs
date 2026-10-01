// 챗봇 템플릿(templates/bot) — 서명·비밀 값 확인과 플랫폼별 응답 모양
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordHandle, telegramHandle, kakaoHandle, kakaoResponse } from '../skills/build/templates/bot/bot.js';

const reply = async (t, ctx) => `${ctx.platform}:${t}`;
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

test('bot discord: Ed25519 서명이 맞아야 하고, PING 은 PONG, 명령은 reply 결과', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = toHex(await crypto.subtle.exportKey('raw', kp.publicKey));
  const send = async (obj, { tamper = false } = {}) => {
    const body = JSON.stringify(obj), ts = '1700000000';
    const sig = toHex(await crypto.subtle.sign({ name: 'Ed25519' }, kp.privateKey, new TextEncoder().encode(ts + body)));
    return discordHandle(new Request('https://x/bot/discord', { method: 'POST', body: tamper ? body.replace('}', ',"x":1}') : body, headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts } }), { DISCORD_PUBLIC_KEY: pub }, reply);
  };
  assert.deepEqual(await (await send({ type: 1 })).json(), { type: 1 });
  assert.equal((await send({ type: 1 }, { tamper: true })).status, 401);
  const r = await (await send({ type: 2, data: { name: 'ask', options: [{ name: 'text', value: '안녕' }] }, member: { user: { id: 'u' } } })).json();
  assert.deepEqual(r, { type: 4, data: { content: 'discord:안녕' } });
});

test('bot telegram: 비밀 헤더가 다르면 403, 맞으면 sendMessage 로 답', async () => {
  const sent = [];
  const f = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); };
  const env = { TELEGRAM_SECRET: 's3', TELEGRAM_TOKEN: 'T' };
  const req = (h) => new Request('https://x', { method: 'POST', headers: h, body: JSON.stringify({ message: { text: '날씨', chat: { id: 7 }, from: { id: 1 } } }) });
  assert.equal((await telegramHandle(req({}), env, reply, f)).status, 403);
  await telegramHandle(req({ 'x-telegram-bot-api-secret-token': 's3' }), env, reply, f);
  assert.equal(sent[0].url, 'https://api.telegram.org/botT/sendMessage');
  assert.deepEqual(sent[0].body, { chat_id: 7, text: 'telegram:날씨' });
});

test('bot kakao: 주소 비밀 값 확인, 응답 형식 2.0·바로가기 버튼, 느리면 4.5초에 안내', async () => {
  const env = { KAKAO_SKILL_SECRET: 'k1' };
  const req = () => new Request('https://x', { method: 'POST', body: JSON.stringify({ userRequest: { utterance: '메뉴', user: { id: 'u' } } }) });
  assert.equal((await kakaoHandle(req(), env, reply, 'nope')).status, 403);
  const r = await (await kakaoHandle(req(), env, async () => ({ text: '오늘 메뉴', quick: ['다시', '도움말'] }), 'k1')).json();
  assert.equal(r.version, '2.0');
  assert.equal(r.template.outputs[0].simpleText.text, '오늘 메뉴');
  assert.deepEqual(r.template.quickReplies[0], { label: '다시', action: 'message', messageText: '다시' });
  assert.equal(kakaoResponse('x'.repeat(2000)).template.outputs[0].simpleText.text.length, 1000);
});
