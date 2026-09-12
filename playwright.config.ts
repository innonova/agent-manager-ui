import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { MANAGER_PORT } from './e2e/constants'

/**
 * e2e/backend.mjs starts a real agent-daemon and agent-manager (fake
 * profile, no tokens) on a fixed port; Vite's /api proxy targets it. Both
 * sibling repos must be built first.
 */
process.env.AGENT_MANAGER_URL = `http://127.0.0.1:${MANAGER_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: { timeout: 10000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    testIdAttribute: 'data-test',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/backend.mjs',
      url: `http://127.0.0.1:${MANAGER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60 * 1000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60 * 1000,
    },
  ],
})
