#!/usr/bin/env node
// Atelier build — 테스트 서버(wrangler dev 등)용 포트. 고정 번호(8787 등) 대신 비어 있는 포트를 운영체제에서 받는다.
// 사용:
//   node scripts/free-port.mjs            → 빈 포트 번호 출력 (셸: PORT=$(node scripts/free-port.mjs))
//   node scripts/free-port.mjs --check N  → N 이 쓰이는 중이면 이유를 말하고 종료 코드 1
//   import { freePort, assertPortFree } from './scripts/free-port.mjs'  (playwright.config.js 등)
import { createServer } from 'node:net';

const HOST = '127.0.0.1';

// 0번 포트로 열면 운영체제가 빈 번호를 준다 → 번호만 받고 닫는다
export function freePort(host = HOST) {
  return new Promise((resolve, reject) => {
    const s = createServer().once('error', reject);
    s.listen(0, host, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

export function assertPortFree(port, host = HOST) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', (e) => reject(e.code === 'EADDRINUSE'
      ? new Error(`포트 ${port} 를 이미 다른 프로그램이 쓰고 있어요. 그 프로그램(이전 테스트 서버 등)을 끄거나, 포트를 지정하지 말고 다시 실행하면 빈 포트를 자동으로 골라요.`)
      : e));
    s.listen(port, host, () => s.close(() => resolve(port)));
  });
}

// 지정한 포트(환경변수)가 있으면 비었는지 확인하고, 없으면 빈 포트를 고른다
export async function testPort(requested, host = HOST) {
  return requested ? assertPortFree(Number(requested), host) : freePort(host);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [flag, n] = process.argv.slice(2);
  (flag === '--check' ? assertPortFree(Number(n)) : freePort())
    .then((p) => { if (flag !== '--check') console.log(p); })
    .catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
}
