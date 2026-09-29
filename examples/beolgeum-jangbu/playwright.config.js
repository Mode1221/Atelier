import { defineConfig, devices } from '@playwright/test';

const PORT = 3999;
export default defineConfig({
  testDir: 'e2e',
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['iPhone 13'], browserName: 'chromium' },
  webServer: {
    command: `rm -f data/e2e.db* && node src/server.js`,
    env: { PORT: String(PORT), DB_PATH: 'data/e2e.db' },
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
  },
});
