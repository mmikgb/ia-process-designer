import { defineConfig, devices } from "@playwright/test"

// pnpm e2e: builds, serves on :3100 with a fresh outcome log (e2e/.out), runs e2e/*.spec.ts.
// PW_CHROMIUM_PATH points at a preinstalled Chromium when the bundled one is absent.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "rm -rf e2e/.out && CS_OUT_DIR=e2e/.out pnpm start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
