import { defineConfig, devices } from '@playwright/test';
import { testPort, freePort } from './scripts/free-port.mjs';

// 고정 번호 대신 빈 포트를 고른다 (E2E_PORT 로 지정하면 비었는지 확인하고, 쓰이는 중이면 멈춤).
// 워커 프로세스도 이 파일을 다시 읽으므로 처음 고른 번호를 환경변수로 넘긴다.
if (!process.env.E2E_PORT_PICKED) {
  process.env.E2E_PORT = String(await testPort(process.env.E2E_PORT));
  process.env.E2E_INSPECTOR_PORT = String(await freePort());
  process.env.E2E_PORT_PICKED = '1';
}
const PORT = process.env.E2E_PORT;
export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['iPhone 13'], browserName: 'chromium' },
  // 실제 Cloudflare 런타임(workerd) + 로컬 D1 로 띄운다
  webServer: {
    command: `rm -rf data/e2e && npx wrangler d1 migrations apply DB --local --persist-to data/e2e && npx wrangler dev --local --ip 127.0.0.1 --port ${PORT} --inspector-port ${process.env.E2E_INSPECTOR_PORT} --persist-to data/e2e --var STATS_TOKEN:e2e-stats`,
    env: { WRANGLER_SEND_METRICS: 'false', CI: '1' },
    url: `http://127.0.0.1:${PORT}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
