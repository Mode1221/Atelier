// 실시간 템플릿(templates/realtime) — Durable Object 를 가짜 상태·소켓으로 돌린다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, roomFetch } from '../skills/build/templates/realtime/room.js';
import { connect } from '../skills/build/templates/realtime/client.js';

class FakeSocket { constructor() { this.out = []; this.att = null; } send(s) { this.out.push(JSON.parse(s)); } serializeAttachment(a) { this.att = structuredClone(a); } deserializeAttachment() { return structuredClone(this.att); } }
let pair;
globalThis.WebSocketPair = class { constructor() { pair = [new FakeSocket(), new FakeSocket()]; return { 0: pair[0], 1: pair[1] }; } };
const realResponse = globalThis.Response;
globalThis.Response = class extends realResponse { constructor(b, init = {}) { super(b, init.status === 101 ? { status: 200 } : init); this.realStatus = init.status ?? 200; this.webSocket = init.webSocket; } };
const fakeState = () => { const sockets = [], store = new Map(); return { sockets, acceptWebSocket: (s) => sockets.push(s), getWebSockets: () => sockets, storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v) } }; };
const join = async (room, name) => { await room.fetch(new Request(`https://x/rt/a?name=${name}`, { headers: { upgrade: 'websocket' } })); return pair[1]; };

test('realtime: 입장 인사·참가자 목록·지난 대화, 말하기는 모두에게·기록, 상태는 나 빼고·기록 안 함, 퇴장 알림', async () => {
  const st = fakeState(), room = new Room(st, {});
  const a = await join(room, '민지');
  assert.equal(a.out[0].type, 'hello');
  const b = await join(room, '준호');
  assert.deepEqual(b.out[0].peers.map((p) => p.name), ['민지', '준호']);
  assert.equal(a.out.at(-1).type, 'join');
  await room.webSocketMessage(a, JSON.stringify({ type: 'say', body: '안녕' }));
  assert.equal(b.out.at(-1).body, '안녕');
  assert.equal(a.out.at(-1).body, '안녕', '말한 사람에게도 보여서 순서가 맞는다');
  await room.webSocketMessage(b, JSON.stringify({ type: 'state', body: { x: 1 } }));
  assert.deepEqual(a.out.at(-1).body, { x: 1 });
  assert.notEqual(b.out.at(-1).type, 'state');
  const c = await join(room, '새로');
  assert.deepEqual(c.out[0].recent.map((m) => m.body), ['안녕']);
  await room.webSocketClose(b);
  assert.equal(a.out.at(-1).type, 'leave');
});

test('realtime: 너무 긴·빠른·이상한 메시지 거절, 방 정원, 웹소켓 아니면 426, 방 이름 검사', async () => {
  const room = new Room(fakeState(), {}, { maxPeers: 2, maxBytes: 50, perSecond: 2, keep: 5 });
  const a = await join(room, 'a');
  await room.webSocketMessage(a, 'x'.repeat(51));
  assert.match(a.out.at(-1).message, /길어요/);
  await room.webSocketMessage(a, '{bad');
  assert.match(a.out.at(-1).message, /형식/);
  await room.webSocketMessage(a, '{"type":"ping"}');
  assert.equal(a.out.at(-1).type, 'pong');
  await room.webSocketMessage(a, '{"type":"ping"}');
  assert.match(a.out.at(-1).message, /빨라요/, '1초에 2번 넘게');
  await join(room, 'b');
  assert.equal((await room.fetch(new Request('https://x/rt/a', { headers: { upgrade: 'websocket' } }))).realStatus, 429);
  assert.equal((await room.fetch(new Request('https://x/rt/a'))).realStatus, 426);
  assert.equal(roomFetch({}, '../x', null).status, 400);
});

test('realtime client: 끊기면 점점 늦게 다시 붙고, close 하면 멈춘다', async () => {
  const made = [];
  class WS { constructor(u) { this.url = u; this.readyState = 1; made.push(this); } send(s) { this.sent = s; } close() {} }
  const statuses = [];
  const timers = [];
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push(ms); return realSet(fn, 0); };
  const rt = connect('/rt/r1', { name: '민 지', WS, loc: { protocol: 'https:', host: 'a.dev' }, onStatus: (s) => statuses.push(s) });
  assert.equal(made[0].url, 'wss://a.dev/rt/r1?name=%EB%AF%BC%20%EC%A7%80');
  made[0].onopen(); rt.say('hi');
  assert.deepEqual(JSON.parse(made[0].sent), { type: 'say', body: 'hi' });
  made[0].onclose();
  await new Promise((r) => realSet(r, 5));
  assert.equal(made.length, 2);
  made[1].onclose();
  await new Promise((r) => realSet(r, 5));
  assert.ok(timers[1] > timers[0], '두 번째는 더 늦게');
  rt.close(); made.at(-1).onclose();
  await new Promise((r) => realSet(r, 5));
  assert.equal(made.length, 3);
  globalThis.setTimeout = realSet;
  assert.ok(statuses.includes('reconnecting') && statuses.includes('online'));
});
