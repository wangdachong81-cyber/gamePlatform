import { defineConfig } from '@playwright/test';
const baseURL = process.env.PLATFORM_TEST_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    channel: 'chromium',
    baseURL,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'artifacts/test-results',
  webServer: { command: process.env.PLATFORM_TEST_URL ? 'npm run preview' : 'npm run dev', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
