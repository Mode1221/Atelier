// 실시간 방 (채팅·함께 편집·멀티플레이 게임 로비) — Cloudflare Durable Objects + WebSocket (무료 등급, SQLite 저장).
// wrangler.toml:
//   [[durable_objects.bindings]]
//   name = "ROOMS"
//   class_name = "Room"
//   [[migrations]]
//   tag = "v1"
//   new_sqlite_classes = ["Room"]
// 워커 진입점: export { Room } from './realtime/room.js';  그리고 app.get('/rt/:room', (c) => roomFetch(c.env, c.req.param('room'), c.req.raw))
// 방 하나 = 객체 하나. 같은 방 사람들은 같은 객체에 붙어 서로 메시지를 받는다. 잠자기(hibernation)로 접속만 있고 조용할 때는 요금이 거의 없다.
export const LIMITS = { maxPeers: 50, maxBytes: 4000, perSecond: 10, keep: 50 };

export function roomFetch(env, room, request) {
  if (!/^[\w-]{1,64}$/.test(room)) return new Response('방 이름이 이상해요', { status: 400 });
  return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
}

export class Room {
  constructor(state, env, limits = LIMITS) {
    this.state = state;
    this.env = env;
    this.limits = limits;
  }
  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('WebSocket 으로 접속해 주세요', { status: 426 });
    if (this.state.getWebSockets().length >= this.limits.maxPeers) return new Response('방이 가득 찼어요', { status: 429 });
    const name = (new URL(request.url).searchParams.get('name') ?? '').trim().slice(0, 20) || '손님';
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name, t: [] });
    const recent = (await this.state.storage.get('recent')) ?? [];
    server.send(JSON.stringify({ type: 'hello', you: server.deserializeAttachment(), peers: this.peers(), recent }));
    this.broadcast({ type: 'join', peer: this.who(server) }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  who(ws) { const a = ws.deserializeAttachment(); return { id: a.id, name: a.name }; }
  peers() { return this.state.getWebSockets().map((ws) => this.who(ws)); }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch { /* 끊긴 소켓 */ } }
  }
  // 잠자기에서 깨어나 메시지 처리
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > this.limits.maxBytes) return ws.send(JSON.stringify({ type: 'error', message: '메시지가 너무 길어요' }));
    const a = ws.deserializeAttachment(), now = Date.now();
    a.t = (a.t ?? []).filter((x) => now - x < 1000);
    if (a.t.length >= this.limits.perSecond) return ws.send(JSON.stringify({ type: 'error', message: '너무 빨라요. 잠시 뒤에 보내 주세요' }));
    a.t.push(now);
    ws.serializeAttachment(a);
    let data;
    try { data = JSON.parse(raw); } catch { return ws.send(JSON.stringify({ type: 'error', message: '형식이 이상해요' })); }
    if (data.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
    // 'say' 는 기록에 남기고 모두에게, 'state' 는 기록 없이 모두에게(커서·게임 위치처럼 자주 바뀌는 것)
    const msg = { type: data.type === 'state' ? 'state' : 'say', from: this.who(ws), body: data.body, at: new Date(now).toISOString() };
    if (msg.type === 'say') {
      const recent = [...((await this.state.storage.get('recent')) ?? []), msg].slice(-this.limits.keep);
      await this.state.storage.put('recent', recent);
    }
    this.broadcast(msg, msg.type === 'state' ? ws : undefined);
  }
  async webSocketClose(ws) { this.broadcast({ type: 'leave', peer: this.who(ws) }, ws); }
  async webSocketError(ws) { this.broadcast({ type: 'leave', peer: this.who(ws) }, ws); }
}
