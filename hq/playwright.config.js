import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3199', browserName: 'chromium' },
  projects: [{ name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
  // 정적 파일 + 같은 주소의 가짜 GitHub·Claude (/__fake/…)
  webServer: { command: 'node scripts/serve.mjs', env: { FAKE: '1', PORT: '3199' }, url: 'http://127.0.0.1:3199/', reuseExistingServer: false },
});
