import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3199', browserName: 'chromium' },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: { command: 'node e2e/serve.mjs', url: 'http://127.0.0.1:3199/health', reuseExistingServer: false },
});
