import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Load local env files for Playwright test process (useful for E2E_* vars).
// In CI, GitHub Actions injects env via job env, so these calls are harmless.
// Note: This file runs in ESM context (package.json "type": "module"), so __dirname is not available.
// Use process.cwd() which will be the package directory when running via the web package scripts.
const cwd = process.cwd();
loadEnv({ path: path.join(cwd, ".env") });
loadEnv({ path: path.join(cwd, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
