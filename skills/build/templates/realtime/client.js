// 브라우저 쪽: 끊기면 알아서 다시 붙는 실시간 연결. public/realtime.js 로 복사.
//   const rt = connect('/rt/my-room', { name: '민지', onMessage: (m) => …, onStatus: (s) => … });  rt.say('안녕');  rt.state({ x, y });
export function connect(path, { name = '', onMessage = () => {}, onStatus = () => {}, WS = globalThis.WebSocket, loc = globalThis.location } = {}) {
  let ws, tries = 0, closed = false, timer;
  const url = `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${path}?name=${encodeURIComponent(name)}`;
  const open = () => {
    onStatus(tries ? 'reconnecting' : 'connecting');
    ws = new WS(url);
    ws.onopen = () => { tries = 0; onStatus('online'); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* 무시 */ } };
    ws.onclose = () => {
      if (closed) return;
      onStatus('offline');
      const wait = Math.min(30_000, 500 * 2 ** tries++) + Math.random() * 300; // 0.5초 → 30초까지 늘려 가며
      timer = setTimeout(open, wait);
    };
  };
  open();
  const send = (o) => ws?.readyState === 1 && ws.send(JSON.stringify(o));
  return { say: (body) => send({ type: 'say', body }), state: (body) => send({ type: 'state', body }), close: () => { closed = true; clearTimeout(timer); ws?.close(); } };
}
