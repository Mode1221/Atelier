import { defineConfig, devices } from '@playwright/test';

const PORT = 3999;
export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['iPhone 13'], browserName: 'chromium' },
  // 실제 Cloudflare 런타임(workerd) + 로컬 D1 로 띄운다
  webServer: {
    command: `rm -rf data/e2e && npx wrangler d1 migrations apply DB --local --persist-to data/e2e && npx wrangler dev --local --ip 127.0.0.1 --port ${PORT} --persist-to data/e2e`,
    env: { WRANGLER_SEND_METRICS: 'false', CI: '1' },
    url: `http://127.0.0.1:${PORT}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
