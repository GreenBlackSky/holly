import { defineConfig } from '@playwright/test';

/* End-to-end checks: build the app, serve it, and drive it like a phone. */
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4181',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4181 --strictPort',
    port: 4181,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
