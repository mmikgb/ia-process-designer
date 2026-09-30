import { defineConfig, devices } from "@playwright/test"

// pnpm e2e: builds, serves on :3100 with a fresh outcome log (e2e/.out), runs e2e/*.spec.ts.
// PW_CHROMIUM_PATH points at a preinstalled Chromium when the bundled one is absent.
// Two runs cover the AI states: `pnpm e2e` (no key) and `CS_AI_MOCK=1 pnpm e2e` (mock model);
// the server inherits the variable. Two projects cover the layouts: 1440 light (every spec)
// and 390 dark (the smoke sweep).
const launch = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", launchOptions: launch },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    {
      name: "mobile-dark",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true },
    },
  ],
  webServer: {
    command: "rm -rf e2e/.out && CS_OUT_DIR=e2e/.out pnpm start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
