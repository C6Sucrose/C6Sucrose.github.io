import { defineConfig } from '@playwright/test';

const external = process.env.SITE_URL;
export default defineConfig({
  testDir: './test', testMatch: '**/*.spec.ts', timeout: 30000,
  expect: { timeout: 6000 }, fullyParallel: false, workers: 1,
  reporter: 'list',
  use: { baseURL: external || 'http://127.0.0.1:4321', headless: true, viewport: { width: 1440, height: 1050 },
    channel: process.platform === 'win32' ? 'msedge' : undefined, trace: 'retain-on-failure' },
  webServer: external ? undefined : { command: 'npm run preview -- --port 4321', url: 'http://127.0.0.1:4321', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
