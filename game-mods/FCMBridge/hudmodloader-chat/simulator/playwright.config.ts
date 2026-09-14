import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:41739', trace: 'retain-on-failure', video: 'retain-on-failure' },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 41739 --strictPort',
    url: 'http://127.0.0.1:41739',
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
